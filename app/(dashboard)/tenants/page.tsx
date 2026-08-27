"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import {
  createMaintenanceRequest, addMaintenancePhoto, saveMoveInCondition,
  initiateMpesaPayment, sendMessage, getMessages, getSignedUrl, uploadLeaseMedia
} from "@/lib/actions";
import SignaturePad from "@/components/SignaturePad";
import FileUploader from "@/components/FileUploader";

export default function TenantPortal() {
  const supabase = createClient();
  const [data, setData] = useState<any>({ leases: [], charges: [], payments: [], maintenance: [], messages: [], profiles: [] });
  const [tab, setTab] = useState("home");
  const [selectedLeaseId, setSelectedLeaseId] = useState("");
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [messageText, setMessageText] = useState("");
  const [userId, setUserId] = useState("");

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user!.id);

    const { data: leases } = await supabase
      .from("leases")
      .select("*, units(*), properties(*)")
      .eq("tenant_user_id", user!.id)
      .order("start_date", { ascending: false });

    const activeLeases = (leases || []).filter((l: any) => l.status === "active");

    const [charges, payments, maintenance, messages, profiles] = await Promise.all([
      supabase.from("rent_charges").select("*").eq("tenant_user_id", user!.id).order("due_date"),
      supabase.from("payments").select("*").eq("payer_user_id", user!.id).order("created_at", { ascending: false }),
      supabase.from("maintenance_requests").select("*").eq("reporter_user_id", user!.id),
      getMessages(),
      supabase.from("profiles").select("id, email, full_name")
    ]);

    setData({
      leases: activeLeases,
      charges: charges.data || [],
      payments: payments.data || [],
      maintenance: maintenance.data || [],
      messages: messages || [],
      profiles: profiles.data || []
    });

    if (!selectedLeaseId && activeLeases.length > 0) {
      setSelectedLeaseId(activeLeases[0].id);
    }
  }

  useEffect(() => { load(); }, []);

  const selectedLease = data.leases.find((l: any) => l.id === selectedLeaseId);
  const leaseCharges = data.charges.filter((c: any) => c.lease_id === selectedLeaseId);
  const depositPaid = data.payments.some((p: any) => p.lease_id === selectedLeaseId && p.payment_type === "deposit" && p.status === "paid");

  async function handlePay(chargeId: string, amount: number) {
    if (!mpesaPhone) { alert("Please enter your M-Pesa phone number first."); return; }
    const result = await initiateMpesaPayment(mpesaPhone, amount, chargeId, "rent", selectedLeaseId);
    alert(result.message);
    setTimeout(load, 12000);
  }

  async function handlePayDeposit() {
    if (!selectedLease) return;
    if (!mpesaPhone) { alert("Please enter your M-Pesa phone number first."); return; }
    const result = await initiateMpesaPayment(mpesaPhone, Number(selectedLease.security_deposit), null, "deposit", selectedLease.id);
    alert(result.message);
    setTimeout(load, 12000);
  }

  async function handleSendMessage() {
    if (!messageText.trim()) return;
    await sendMessage(messageText);
    setMessageText("");
    load();
  }

  const getPaymentStatus = (charge: any) => {
    if (charge.status === "paid") return { cls: "bg-green-100 text-green-700", label: "Paid" };
    const dueDate = new Date(charge.due_date);
    const now = new Date();
    const daysDiff = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff < 0) return { cls: "bg-red-100 text-red-700", label: "Overdue" };
    if (daysDiff <= 7) return { cls: "bg-orange-100 text-orange-700", label: "Due Soon" };
    return { cls: "bg-yellow-100 text-yellow-700", label: "Upcoming" };
  };

  const nameOf = (id: string) => {
    const p = data.profiles.find((pr: any) => pr.id === id);
    return p?.full_name || p?.email || "—";
  };

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
            {selectedLease ? (
              <>
                <p>{selectedLease.units?.name}</p>
                <p className="text-sm text-gray-500">{selectedLease.properties?.name}</p>
                <span className={`inline-block mt-2 text-xs px-2 py-1 rounded ${
                  selectedLease.lease_type === "indefinite" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                }`}>
                  {selectedLease.lease_type === "indefinite" ? "Indefinite" : "Fixed Period"}
                </span>
              </>
            ) : (
              <p className="text-sm text-gray-500">No active lease yet.</p>
            )}
          </div>
          <div className="bg-white p-6 rounded-xl">
            <h2 className="font-semibold mb-2">Next Payment Due</h2>
            {leaseCharges.find((c: any) => c.status !== "paid") ? (
              <>
                <p className="text-2xl font-bold">${leaseCharges.find((c: any) => c.status !== "paid").amount}</p>
                <p className="text-sm text-gray-500">Due {leaseCharges.find((c: any) => c.status !== "paid").due_date}</p>
              </>
            ) : (
              <p className="text-sm text-gray-500">All paid up! 🎉</p>
            )}
          </div>
        </div>
      )}

      {tab === "lease" && (
        <div className="space-y-6">
          {data.leases.length === 0 && (
            <div className="bg-white p-6 rounded-xl"><p className="text-gray-500">No active lease yet.</p></div>
          )}
          {data.leases.map((lease: any) => (
            <LeaseCard key={lease.id} lease={lease} onSigned={load} />
          ))}
        </div>
      )}

      {tab === "payments" && (
        <div className="space-y-6">
          {/* Lease selector */}
          <div className="bg-white p-6 rounded-xl">
            <h3 className="font-semibold mb-3">Select Lease / Unit</h3>
            <select value={selectedLeaseId} onChange={(e) => setSelectedLeaseId(e.target.value)}
              className="w-full p-2 border rounded">
              {data.leases.map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.properties?.name} — {l.units?.name}
                </option>
              ))}
            </select>
          </div>

          {selectedLease && !selectedLease.signed_by_tenant && (
            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl text-sm text-yellow-700">
              ⚠️ Please sign this lease first (Lease tab) before making payments.
            </div>
          )}

          {selectedLease && selectedLease.signed_by_tenant && (
            <>
              <div className="bg-white p-6 rounded-xl">
                <h3 className="font-semibold mb-3">M-Pesa Payment Setup</h3>
                <input type="tel" placeholder="M-Pesa phone number (e.g. 254712345678)"
                  value={mpesaPhone} onChange={(e) => setMpesaPhone(e.target.value)}
                  className="w-full p-2 border rounded" />
              </div>

              {/* Deposit */}
              {Number(selectedLease.security_deposit) > 0 && (
                <div className="bg-white p-6 rounded-xl flex justify-between items-center">
                  <div>
                    <div className="font-semibold">Security Deposit</div>
                    <div className="text-sm text-gray-500">${selectedLease.security_deposit}</div>
                  </div>
                  {depositPaid ? (
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded">Paid</span>
                  ) : (
                    <button onClick={handlePayDeposit} disabled={!mpesaPhone}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg disabled:bg-gray-300">
                      Pay Deposit
                    </button>
                  )}
                </div>
              )}

              {/* Rent charges for selected lease */}
              <div className="bg-white p-6 rounded-xl">
                <h3 className="font-semibold mb-4">Rent Schedule — {selectedLease.units?.name}</h3>
                {leaseCharges.length === 0 ? (
                  <p className="text-sm text-gray-500">No rent charges for this lease yet.</p>
                ) : (
                  <div className="space-y-3">
                    {leaseCharges.map((c: any) => {
                      const st = getPaymentStatus(c);
                      return (
                        <div key={c.id} className="border-b pb-3 flex justify-between items-center">
                          <div>
                            <div className="font-semibold">{c.due_date}</div>
                            <div className="text-sm text-gray-500">Amount: ${c.amount}</div>
                            <span className={`inline-block mt-1 text-xs px-2 py-1 rounded ${st.cls}`}>{st.label}</span>
                          </div>
                          {c.status === "paid" ? (
                            <span className="px-3 py-1 bg-green-100 text-green-700 rounded">Paid</span>
                          ) : (
                            <button onClick={() => handlePay(c.id, Number(c.amount))} disabled={!mpesaPhone}
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
            </>
          )}

          {/* Payment history (all leases) */}
          <div className="bg-white p-6 rounded-xl">
            <h3 className="font-semibold mb-4">Payment History</h3>
            {data.payments.length === 0 ? (
              <p className="text-sm text-gray-500">No payments yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left">
                  <th className="py-2">Date</th><th>Type</th><th>Amount</th><th>Status</th><th>Receipt</th>
                </tr></thead>
                <tbody>
                  {data.payments.map((p: any) => (
                    <tr key={p.id} className="border-b">
                      <td className="py-2">{new Date(p.created_at).toLocaleDateString()}</td>
                      <td className="capitalize">{p.payment_type || "rent"}</td>
                      <td>${p.amount}</td>
                      <td>
                        <span className={`px-2 py-1 rounded ${p.status === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="text-xs text-gray-500">{p.mpesa_receipt || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === "maintenance" && (
        <div>
          <MaintenanceForm
            unitId={selectedLease?.unit_id || null}
            propertyId={selectedLease?.units?.property_id || null}
            onCreated={load}
          />
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
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {m.issue_photos.map((ph: any, i: number) => (
                      <SignedLink key={i} path={typeof ph === "string" ? ph : ph?.path} label={`Photo ${i + 1}`} />
                    ))}
                  </div>
                )}
                {(m.completed_photos || []).length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {m.completed_photos.map((ph: any, i: number) => (
                      <SignedLink key={i} path={typeof ph === "string" ? ph : ph?.path} label={`Done ${i + 1}`} green />
                    ))}
                  </div>
                )}
                {m.completed_at && (
                  <div className="text-xs text-green-600 mt-1">✅ Completed: {new Date(m.completed_at).toLocaleString()}</div>
                )}
                <div className="mt-2">
                  <FileUploader folder="maintenance" mode="image-video"
                    onUploaded={async (meta: any) => {
                      await addMaintenancePhoto(m.id, meta.file);
                      load();
                    }} />
                </div>
              </div>
            ))}
            {data.maintenance.length === 0 && <p className="text-gray-400 text-sm">No maintenance requests yet.</p>}
          </div>
        </div>
      )}

      {tab === "messages" && (
        <div className="bg-white p-6 rounded-xl">
          <h3 className="font-semibold mb-4">Messages</h3>
          <div className="space-y-3 max-h-96 overflow-y-auto mb-4">
            {data.messages.map((m: any) => (
              <div key={m.id} className={`p-3 rounded-lg ${m.sender_user_id === userId ? "bg-indigo-50 ml-8" : "bg-gray-50 mr-8"}`}>
                <div className="text-xs text-gray-500 mb-1">
                  {nameOf(m.sender_user_id)} • {new Date(m.created_at).toLocaleString()}
                </div>
                <p className="text-sm">{m.content}</p>
              </div>
            ))}
            {data.messages.length === 0 && (
              <p className="text-gray-400 text-sm text-center">No messages yet. Start a conversation!</p>
            )}
          </div>
          <div className="flex gap-2">
            <input value={messageText} onChange={(e) => setMessageText(e.target.value)}
              placeholder="Type your message..." className="flex-1 p-2 border rounded"
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()} />
            <button onClick={handleSendMessage} className="px-4 py-2 bg-indigo-600 text-white rounded">Send</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Lease card: info + signature + move-in media ---------- */
function LeaseCard({ lease, onSigned }: any) {
  const isIndefinite = lease.lease_type === "indefinite";
  const hasMedia = (lease.move_in_photos || []).length > 0 || (lease.move_in_videos || []).length > 0;

  return (
    <div className="bg-white p-6 rounded-xl">
      <div className="flex justify-between mb-2">
        <h2 className="text-xl font-semibold">{lease.properties?.name} • {lease.units?.name}</h2>
        <span className={`text-xs px-2 py-1 rounded ${isIndefinite ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
          {isIndefinite ? "Indefinite" : "Fixed Period"}
        </span>
      </div>
      <div className="space-y-2 text-sm mb-4">
        <p><b>Start:</b> {lease.start_date}</p>
        <p><b>End:</b> {isIndefinite ? "No end date" : lease.end_date}</p>
        <p><b>Monthly Rent:</b> ${lease.monthly_rent}</p>
        <p><b>Deposit:</b> ${lease.security_deposit}</p>
      </div>

      {/* Signature — shown once, then locked with saved image */}
      <div className="pt-4 border-t">
        <h3 className="font-semibold mb-2">Tenant Signature</h3>
        {lease.signed_by_tenant ? (
          <div>
            <p className="text-green-600 text-sm mb-2">
              ✓ Signed {lease.tenant_signed_at ? `on ${new Date(lease.tenant_signed_at).toLocaleString()}` : ""}
            </p>
            {lease.tenant_signature_url && <SignedImage path={lease.tenant_signature_url} />}
          </div>
        ) : (
          <SignaturePad leaseId={lease.id} role="tenant" onSigned={onSigned} />
        )}
      </div>

      {/* Move-in condition */}
      <div className="pt-4 mt-4 border-t">
        <h3 className="font-semibold mb-2">Move-in Condition</h3>
        {hasMedia ? (
          <div className="space-y-2">
            <div className="flex gap-2 flex-wrap">
              {(lease.move_in_photos || []).map((p: string, i: number) => (
                <SignedImage key={i} path={p} />
              ))}
            </div>
            <div className="flex gap-2 flex-wrap">
              {(lease.move_in_videos || []).map((v: string, i: number) => (
                <SignedLink key={i} path={v} label={`Video ${i + 1}`} />
              ))}
            </div>
          </div>
        ) : (
          <MoveInForm leaseId={lease.id} onSaved={onSigned} />
        )}
      </div>
    </div>
  );
}

/* ---------- Move-in upload form ---------- */
function MoveInForm({ leaseId, onSaved }: any) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function handleUpload(meta: any, kind: "photo" | "video") {
    let path = meta?.path;
    if (!path && meta?.file instanceof File) {
      const res = await uploadLeaseMedia(meta.file, "leases");
      path = res.path;
    }
    if (path) {
      if (kind === "photo") setPhotos((p) => [...p, path]);
      else setVideos((v) => [...v, path]);
    }
  }

  async function save() {
    setSaving(true);
    await saveMoveInCondition(leaseId, photos, videos);
    setSaving(false);
    onSaved();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">Record the house condition with photos/videos for your records.</p>
      <div>
        <div className="text-sm font-semibold mb-1">Photos</div>
        <FileUploader folder="leases" mode="image-video" onUploaded={(meta: any) => handleUpload(meta, "photo")} />
        {photos.length > 0 && <div className="text-sm text-gray-600 mt-1">{photos.length} photo(s) ready</div>}
      </div>
      <div>
        <div className="text-sm font-semibold mb-1">Videos (optional)</div>
        <FileUploader folder="leases" mode="image-video" onUploaded={(meta: any) => handleUpload(meta, "video")} />
        {videos.length > 0 && <div className="text-sm text-gray-600 mt-1">{videos.length} video(s) ready</div>}
      </div>
      <button onClick={save} disabled={saving || (photos.length === 0 && videos.length === 0)}
        className="px-4 py-2 bg-indigo-600 text-white rounded-lg disabled:bg-gray-300">
        {saving ? "Saving..." : "Save Move-in Condition"}
      </button>
    </div>
  );
}

/* ---------- Signed URL helpers ---------- */
function SignedImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { getSignedUrl(path).then(setUrl); }, [path]);
  if (!url) return <div className="text-xs text-gray-400">Loading…</div>;
  return <img src={url} alt="media" className="h-28 rounded border inline-block mr-2" />;
}

function SignedLink({ path, label, green }: { path: string; label: string; green?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { getSignedUrl(path).then(setUrl); }, [path]);
  if (!url) return <span className="text-xs text-gray-400">Loading…</span>;
  return (
    <a href={url} target="_blank" className={`${green ? "text-green-600" : "text-indigo-600"} text-xs underline`}>
      {label}
    </a>
  );
}

/* ---------- Maintenance form ---------- */
function MaintenanceForm({ unitId, propertyId, onCreated }: any) {
  const [photos, setPhotos] = useState<string[]>([]);

  async function handleUpload(meta: any) {
    let path = meta?.path;
    if (!path && meta?.file instanceof File) {
      const res = await uploadLeaseMedia(meta.file, "maintenance");
      path = res.path;
    }
    if (path) setPhotos((p) => [...p, path]);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await createMaintenanceRequest({
      unitId, propertyId,
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
        <FileUploader folder="maintenance" mode="image-video" onUploaded={(meta: any) => handleUpload(meta)} />
        {photos.length > 0 && <div className="mt-2 text-sm text-gray-600">{photos.length} photo(s) attached</div>}
      </div>
      <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg">Submit Request</button>
    </form>
  );
}
