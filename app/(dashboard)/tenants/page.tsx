"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { payRent, createMaintenanceRequest, addMaintenancePhoto, saveSignature } from "@/lib/actions";
import { loadStripe } from "@stripe/stripe-js";
import SignaturePad from "@/components/SignaturePad";
import FileUploader from "@/components/FileUploader";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export default function TenantPortal() {
  const supabase = createClient();
  const [data, setData] = useState<any>({ lease: null, charges: [], payments: [], maintenance: [], units: [], properties: [] });
  const [tab, setTab] = useState("home");

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();

    // FIXED: Use array query instead of .single() which crashes with 0 or 2+ results
    const { data: leases } = await supabase
      .from("leases")
      .select("*, units(*), properties(*)")
      .eq("tenant_user_id", user!.id)
      .eq("status", "active")
      .order("start_date", { ascending: false });

    const lease = leases && leases.length > 0 ? leases[0] : null;

    const [charges, payments, maintenance] = await Promise.all([
      supabase.from("rent_charges").select("*").eq("tenant_user_id", user!.id).order("due_date"),
      supabase.from("payments").select("*").eq("payer_user_id", user!.id),
      supabase.from("maintenance_requests").select("*").eq("reporter_user_id", user!.id),
    ]);

    setData({
      lease, charges: charges.data || [], payments: payments.data || [],
      maintenance: maintenance.data || [], units: lease ? [lease.units] : [], properties: lease ? [lease.properties] : []
    });
  }

  useEffect(() => { load(); }, []);

  const isIndefinite = data.lease?.lease_type === "indefinite";

  async function handlePay(chargeId: string, amount: number) {
    const { clientSecret } = await payRent(chargeId, amount);
    const stripe = await stripePromise;
    if (!stripe) return;

    const elements = stripe.elements();
    const cardElement = elements.create("card");

    const { error } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: cardElement }
    });

    if (error) {
      alert("Payment error: " + error.message);
    } else {
      alert("Payment successful!");
      load();
    }
  }

  return (
    <div>
      <div className="flex gap-2 mb-6">
        {["home", "lease", "payments", "maintenance"].map(t => (
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
        <div className="bg-white p-6 rounded-xl">
          <h2 className="text-xl font-semibold mb-4">My Lease</h2>
          <div className="space-y-2 text-sm">
            <p><b>Type:</b> {isIndefinite ? "Indefinite (no fixed end date)" : "Fixed Period"}</p>
            <p><b>Start:</b> {data.lease.start_date}</p>
            <p><b>End:</b> {isIndefinite ? "No end date" : data.lease.end_date}</p>
            <p><b>Monthly Rent:</b> ${data.lease.monthly_rent}</p>
            <p><b>Deposit:</b> ${data.lease.security_deposit}</p>
          </div>
          {!data.lease.signed_by_tenant && (
            <div className="mt-6">
              <h3 className="font-semibold mb-2">Sign Your Lease</h3>
              <SignaturePad leaseId={data.lease.id} role="tenant" onSigned={load} />
            </div>
          )}
          {data.lease.signed_by_tenant && <p className="mt-4 text-green-600">✓ Lease signed</p>}
        </div>
      )}

      {tab === "lease" && !data.lease && (
        <div className="bg-white p-6 rounded-xl">
          <p className="text-gray-500">No active lease yet. Your manager will assign one to you.</p>
        </div>
      )}

      {tab === "payments" && (
        <div className="bg-white p-6 rounded-xl">
          <h2 className="text-xl font-semibold mb-4">My Rent Schedule</h2>
          {data.charges.length === 0 ? (
            <p className="text-sm text-gray-500">
              {isIndefinite
                ? "Your lease is indefinite — rent charges will appear here when your manager adds them."
                : "No rent charges yet."}
            </p>
          ) : (
            data.charges.map((c: any) => (
              <div key={c.id} className="border-b py-3 flex justify-between items-center">
                <div>
                  <div className="font-semibold">{c.due_date}</div>
                  <div className="text-sm text-gray-500">Amount: ${c.amount}</div>
                </div>
                {c.status === "paid" ? (
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded">Paid</span>
                ) : (
                  <button onClick={() => handlePay(c.id, Number(c.amount))}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg">
                    Pay ${c.amount}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "maintenance" && (
        <div>
          {/* FIXED: Always show the form, even without a lease */}
          <MaintenanceForm 
            unitId={data.lease?.unit_id || null} 
            propertyId={data.lease?.units?.property_id || null} 
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
                {/* Show issue photos */}
                {(m.issue_photos || []).length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {m.issue_photos.map((ph: any, i: number) => (
                      <a key={i} href={typeof ph === "string" ? ph : ph?.signedUrl} target="_blank" className="text-indigo-600 text-xs underline">
                        Photo {i + 1}
                      </a>
                    ))}
                  </div>
                )}
                {/* Show completion photos */}
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
    </div>
  );
}

// FIXED: Shows even without a lease, includes photo upload
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
          ⚠️ No active lease found. Your request will be submitted without a unit. Contact your manager if needed.
        </div>
      )}

      <input name="title" placeholder="Issue title (e.g. Leaking faucet)" required className="w-full p-2 border rounded mb-2" />
      <textarea name="description" placeholder="Describe the issue in detail" rows={3} required className="w-full p-2 border rounded mb-2" />
      <select name="priority" className="w-full p-2 border rounded mb-3">
        <option value="low">Low Priority</option>
        <option value="medium">Medium Priority</option>
        <option value="high">High Priority</option>
        <option value="emergency">Emergency</option>
      </select>
      
      {/* Photo upload */}
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
