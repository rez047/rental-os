"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { payRent, createMaintenanceRequest, addMaintenancePhoto, saveSignature, sendMessage, getMessages, saveMoveInCondition, initiateMpesaPayment } from "@/lib/actions";
import { loadStripe } from "@stripe/stripe-js";
import SignaturePad from "@/components/SignaturePad";
import FileUploader from "@/components/FileUploader";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export default function TenantPortal() {
  const supabase = createClient();
  const [data, setData] = useState<any>({ lease: null, charges: [], payments: [], maintenance: [], messages: [] });
  const [tab, setTab] = useState("home");
  const [moveInPhotos, setMoveInPhotos] = useState<any[]>([]);
  const [moveInVideos, setMoveInVideos] = useState<any[]>([]);
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [messageText, setMessageText] = useState("");

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();

    const { data: leases } = await supabase
      .from("leases")
      .select("*, units(*), properties(*)")
      .eq("tenant_user_id", user!.id)
      .eq("status", "active")
      .order("start_date", { ascending: false });

    const lease = leases && leases.length > 0 ? leases[0] : null;

    const [charges, payments, maintenance, messages] = await Promise.all([
      supabase.from("rent_charges").select("*").eq("tenant_user_id", user!.id).order("due_date"),
      supabase.from("payments").select("*").eq("payer_user_id", user!.id).order("created_at", { ascending: false }),
      supabase.from("maintenance_requests").select("*").eq("reporter_user_id", user!.id),
      getMessages()
    ]);

    setData({
      lease, 
      charges: charges.data || [], 
      payments: payments.data || [],
      maintenance: maintenance.data || [],
      messages: messages || []
    });
  }

  useEffect(() => { load(); }, []);

  const isIndefinite = data.lease?.lease_type === "indefinite";
  const isEvicted = data.lease?.evicted;

  async function handlePay(chargeId: string, amount: number) {
    if (!mpesaPhone) {
      alert("Please enter your M-Pesa phone number first");
      return;
    }

    const result = await initiateMpesaPayment(mpesaPhone, amount, chargeId);
    if (result.success) {
      alert(result.message);
      setTimeout(load, 12000); // Reload after payment completes
    }
  }

  async function handleSendMessage() {
    if (!messageText.trim()) return;
    await sendMessage(messageText);
    setMessageText("");
    load();
  }

  async function handleSaveMoveIn() {
    if (!data.lease) return;
    await saveMoveInCondition(data.lease.id, moveInPhotos, moveInVideos);
    alert("Move-in condition saved!");
    load();
  }

  const getPaymentStatus = (charge: any) => {
    if (charge.status === "paid") return { color: "green", label: "Paid" };
    const dueDate = new Date(charge.due_date);
    const now = new Date();
    const daysDiff = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff < 0) return { color: "red", label: "Overdue" };
    if (daysDiff <= 7) return { color: "orange", label: "Due Soon" };
    return { color: "yellow", label: "Upcoming" };
  };

  if (isEvicted) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-2xl">
          <h2 className="text-2xl font-bold text-red-700 mb-4">Lease Terminated</h2>
          <p className="text-red-600">Your lease has been terminated.</p>
          {data.lease?.eviction_reason && (
            <p className="mt-2 text-sm text-gray-600">Reason: {data.lease.eviction_reason}</p>
          )}
          {data.lease?.eviction_date && (
            <p className="mt-2 text-sm text-gray-600">
              Date: {new Date(data.lease.eviction_date).toLocaleDateString()}
            </p>
          )}
          <p className="mt-4 text-sm text-gray-600">Please contact your property manager for more information.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2 mb-6 flex-wrap">
        {["home", "lease", "payments", "maintenance", "messages"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg ${tab === t ? "bg-indigo-600 text-white" : "bg-white"}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "home" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-6 rounded-xl">
            <h2 className="font-semibold mb-2">My Home</h2>
            <p>{data.lease?.units?.name || "No active lease"}</p>
            <p className="text-sm text-gray-500">{data.lease?.properties?.name}</p>
            {data.lease && (
              <span className={`inline-block mt-2 text-xs px-2 py-1 rounded ${
                isIndefinite ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
              }`}>
                {isIndefinite ? "Indefinite / Month-to-Month" : "Fixed Period Lease"}
              </span>
            )}
          </div>
          <div className="bg-white p-6 rounded-xl">
            <h2 className="font-semibold mb-2">Next Payment Due</h2>
            {data.charges.find((c: any) => c.status !== "paid") ? (
              <>
                <p className="text-2xl font-bold">${data.charges.find((c: any) => c.status !== "paid").amount}</p>
                <p className="text-sm text-gray-500">Due {data.charges.find((c: any) => c.status !== "paid").due_date}</p>
              </>
            ) : (
              <p className="text-sm text-gray-500">
                {isIndefinite
                  ? "No upcoming charges yet — your manager will add them."
                  : "All paid up! 🎉"}
              </p>
            )}
          </div>
        </div>
      )}

      {tab === "lease" && data.lease && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl">
            <h2 className="text-xl font-semibold mb-4">My Lease</h2>
            <div className="space-y-2 text-sm">
              <p><b>Type:</b> {isIndefinite ? "Indefinite (no fixed end date)" : "Fixed Period"}</p>
              <p><b>Start:</b> {data.lease.start_date}</p>
              <p><b>End:</b> {isIndefinite ? "No end date" : data.lease.end_date}</p>
              <p><b>Monthly Rent:</b> ${data.lease.monthly_rent}</p>
              <p><b>Deposit:</b> ${data.lease.security_deposit}</p>
            </div>
            
            {/* Move-in Condition */}
            {!data.lease.move_in_photos?.length && (
              <div className="mt-6 pt-6 border-t">
                <h3 className="font-semibold mb-2">Document Move-in Condition</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Take photos/videos of the property condition when you move in. This protects both you and the landlord.
                </p>
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-semibold mb-2">Photos</div>
                    <FileUploader 
                      folder="leases" 
                      mode="image-video" 
                      onUploaded={(meta) => setMoveInPhotos([...moveInPhotos, meta.file])}
                    />
                    {moveInPhotos.length > 0 && (
                      <div className="mt-2 text-sm text-gray-600">{moveInPhotos.length} photo(s) uploaded</div>
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-semibold mb-2">Videos</div>
                    <FileUploader 
                      folder="leases" 
                      mode="image-video" 
                      onUploaded={(meta) => setMoveInVideos([...moveInVideos, meta.file])}
                    />
                    {moveInVideos.length > 0 && (
                      <div className="mt-2 text-sm text-gray-600">{moveInVideos.length} video(s) uploaded</div>
                    )}
                  </div>
                  <button 
                    onClick={handleSaveMoveIn}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg"
                  >
                    Save Move-in Condition
                  </button>
                </div>
              </div>
            )}

            {data.lease.move_in_photos?.length > 0 && (
              <div className="mt-6 pt-6 border-t">
                <h3 className="font-semibold mb-2">Move-in Condition (Saved)</h3>
                <div className="flex gap-2 flex-wrap">
                  {data.lease.move_in_photos.map((ph: string, i: number) => (
                    <a key={i} href={ph} target="_blank" className="text-indigo-600 text-xs underline">
                      Photo {i + 1}
                    </a>
                  ))}
                  {data.lease.move_in_videos?.map((vid: string, i: number) => (
                    <a key={i} href={vid} target="_blank" className="text-indigo-600 text-xs underline">
                      Video {i + 1}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Signature Section */}
          <div className="bg-white p-6 rounded-xl">
            <h3 className="font-semibold mb-2">Sign Your Lease</h3>
            {!data.lease.signed_by_tenant && (
              <SignaturePad leaseId={data.lease.id} role="tenant" onSigned={load} />
            )}
            {data.lease.signed_by_tenant && <p className="text-green-600">✓ Lease signed on {new Date(data.lease.updated_at).toLocaleDateString()}</p>}
          </div>
        </div>
      )}

      {tab === "lease" && !data.lease && (
        <div className="bg-white p-6 rounded-xl">
          <p className="text-gray-500">No active lease yet. Your manager will assign one to you.</p>
        </div>
      )}

      {tab === "payments" && data.lease?.signed_by_tenant && (
        <div className="space-y-6">
          {/* M-Pesa Phone Input */}
          <div className="bg-white p-6 rounded-xl">
            <h3 className="font-semibold mb-4">M-Pesa Payment Setup</h3>
            <input
              type="tel"
              placeholder="Enter M-Pesa phone number (e.g., 254712345678)"
              value={mpesaPhone}
              onChange={(e) => setMpesaPhone(e.target.value)}
              className="w-full p-2 border rounded mb-2"
            />
            <p className="text-xs text-gray-500">
              Your M-Pesa STK Push will be sent to this number when you make a payment.
            </p>
          </div>

          {/* Rent Charges */}
          <div className="bg-white p-6 rounded-xl">
            <h3 className="font-semibold mb-4">My Rent Schedule</h3>
            {data.charges.length === 0 ? (
              <p className="text-sm text-gray-500">No rent charges yet.</p>
            ) : (
              <div className="space-y-3">
                {data.charges.map((c: any) => {
                  const status = getPaymentStatus(c);
                  return (
                    <div key={c.id} className="border-b pb-3 flex justify-between items-center">
                      <div>
                        <div className="font-semibold">{c.due_date}</div>
                        <div className="text-sm text-gray-500">Amount: ${c.amount}</div>
                        <span className={`inline-block mt-1 text-xs px-2 py-1 rounded bg-${status.color}-100 text-${status.color}-700`}>
                          {status.label}
                        </span>
                      </div>
                      {c.status === "paid" ? (
                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded">Paid</span>
                      ) : (
                        <button onClick={() => handlePay(c.id, Number(c.amount))}
                          disabled={!mpesaPhone}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-lg disabled:bg-gray-300">
                          Pay ${c.amount}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Payment History */}
          <div className="bg-white p-6 rounded-xl">
            <h3 className="font-semibold mb-4">Payment History</h3>
            {data.payments.length === 0 ? (
              <p className="text-sm text-gray-500">No payments yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2">Date</th>
                    <th className="py-2">Amount</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p: any) => (
                    <tr key={p.id} className="border-b">
                      <td className="py-2">{new Date(p.created_at).toLocaleDateString()}</td>
                      <td>${p.amount}</td>
                      <td>
                        <span className={`px-2 py-1 rounded ${
                          p.status === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="text-xs text-gray-500">
                        {p.mpesa_receipt || p.stripe_payment_intent?.slice(0, 12) || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === "payments" && !data.lease?.signed_by_tenant && (
        <div className="bg-white p-6 rounded-xl">
          <p className="text-gray-500">Please sign your lease first to access payments.</p>
        </div>
      )}

      {tab === "maintenance" && (
        <div>
          <MaintenanceForm unitId={data.lease?.unit_id || null} propertyId={data.lease?.units?.property_id || null} onCreated={load} />
          <div className="mt-6 space-y-3">
            {data.maintenance.map((m: any) => (
              <div key={m.id} className="bg-white p-4 rounded-xl">
                <div className="flex justify-between">
                  <b>{m.title}</b>
                  <span className={`text-xs px-2 py-1 rounded ${
                    m.status === "completed" ? "bg-green-100" : m.status === "in_progress" ? "bg-blue-100" : "bg-yellow-100"
                  }`}>{m.status}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">{m.description}</p>
                {(m.issue_photos || []).length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {m.issue_photos.map((ph: any, i: number) => (
                      <a key={i} href={typeof ph === "string" ? ph : ph?.signedUrl} target="_blank" className="text-indigo-600 text-xs underline">
                        Photo {i + 1}
                      </a>
                    ))}
                  </div>
                )}
                {(m.completed_photos || []).length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {m.completed_photos.map((ph: any, i: number) => (
                      <a key={i} href={typeof ph === "string" ? ph : ph?.signedUrl} target="_blank" className="text-green-600 text-xs underline">
                        Done {i + 1}
                      </a>
                    ))}
                  </div>
                )}
                {m.completed_at && (
                  <div className="text-xs text-green-600 mt-1">
                    ✅ Completed: {new Date(m.completed_at).toLocaleString()}
                  </div>
                )}
                <div className="mt-2">
                  <FileUploader folder="maintenance" mode="image-video"
                    onUploaded={async (meta) => {
                      await addMaintenancePhoto(m.id, meta.file);
                      load();
                    }} />
                </div>
              </div>
            ))}
            {data.maintenance.length === 0 && (
              <p className="text-gray-400 text-sm">No maintenance requests yet.</p>
            )}
          </div>
        </div>
      )}

      {tab === "messages" && (
        <div className="bg-white p-6 rounded-xl">
          <h3 className="font-semibold mb-4">Messages</h3>
          <div className="space-y-3 max-h-96 overflow-y-auto mb-4">
            {data.messages.map((m: any) => (
              <div key={m.id} className={`p-3 rounded-lg ${m.sender_user_id === supabase.auth.getUser().then(d => d.data.user?.id) ? "bg-indigo-50 ml-8" : "bg-gray-50 mr-8"}`}>
                <div className="text-xs text-gray-500 mb-1">
                  {m.sender?.full_name || m.sender?.email} • {new Date(m.created_at).toLocaleString()}
                </div>
                <p className="text-sm">{m.content}</p>
              </div>
            ))}
            {data.messages.length === 0 && (
              <p className="text-gray-400 text-sm text-center">No messages yet. Start a conversation!</p>
            )}
          </div>
          <div className="flex gap-2">
            <input
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 p-2 border rounded"
              onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
            />
            <button onClick={handleSendMessage} className="px-4 py-2 bg-indigo-600 text-white rounded">
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MaintenanceForm({ unitId, propertyId, onCreated }: any) {
  const [photos, setPhotos] = useState<any[]>([]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await createMaintenanceRequest({
      unitId: unitId, 
      propertyId: propertyId,
      title: fd.get("title") as string,
      description: fd.get("description") as string,
      priority: fd.get("priority") as string,
      issuePhotos: photos
    });
    onCreated();
    (e.target as HTMLFormElement).reset();
    setPhotos([]);
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl">
      <h3 className="font-semibold mb-4">Submit Maintenance Request</h3>
      
      {!unitId && (
        <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
          ⚠️ No active lease found. Your request will be submitted without a unit.
        </div>
      )}

      <input name="title" placeholder="Issue title" required className="w-full p-2 border rounded mb-2" />
      <textarea name="description" placeholder="Describe the issue" rows={3} required className="w-full p-2 border rounded mb-2" />
      <select name="priority" className="w-full p-2 border rounded mb-3">
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="emergency">Emergency</option>
      </select>
      
      <div className="mb-3">
        <div className="text-sm font-semibold mb-2">Upload Photos (optional)</div>
        <FileUploader 
          folder="maintenance" 
          mode="image-video" 
          onUploaded={(meta) => setPhotos([...photos, meta.file])}
        />
        {photos.length > 0 && (
          <div className="mt-2 text-sm text-gray-600">{photos.length} photo(s) attached</div>
        )}
      </div>

      <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg">Submit Request</button>
    </form>
  );
}
