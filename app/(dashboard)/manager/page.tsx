"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { generateRentSchedule, saveSignature, askAI, createMaintenanceRequest, evictTenant } from "@/lib/actions";
import SignaturePad from "@/components/SignaturePad";
import PropertyAccess from "@/components/PropertyAccess";
import FileUploader from "@/components/FileUploader";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell
} from "recharts";

export default function ManagerPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <ManagerDashboard />
    </Suspense>
  );
}

function ManagerDashboard() {
  const supabase = createClient();
  const params = useSearchParams();
  const tab = params.get("tab") || "dashboard";

  const [data, setData] = useState<any>({
    properties: [], units: [], leases: [], charges: [], payments: [],
    maintenance: [], members: [], profiles: [], ai: []
  });
  const [aiMsg, setAiMsg] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<any>(null);
  
  const [maintenancePhotos, setMaintenancePhotos] = useState<any[]>([]);
  const [maintenanceVideos, setMaintenanceVideos] = useState<any[]>([]);

  // NEW: Eviction state
  const [evictModal, setEvictModal] = useState<{ leaseId: string; tenantEmail: string } | null>(null);
  const [evictionReason, setEvictionReason] = useState("");

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: membership } = await supabase
      .from("org_members").select("org_id")
      .eq("user_id", user!.id).eq("status", "active").single();
    const orgId = membership.org_id;

    const [properties, units, leases, charges, payments, maintenance, members, profiles, ai] =
      await Promise.all([
        supabase.from("properties").select("*, units(*)").eq("org_id", orgId),
        supabase.from("units").select("*").eq("org_id", orgId),
        supabase.from("leases").select("*, units(name, property_id), properties(name)").eq("org_id", orgId),
        supabase.from("rent_charges").select("*").eq("org_id", orgId),
        supabase.from("payments").select("*").eq("org_id", orgId),
        supabase.from("maintenance_requests").select("*").eq("org_id", orgId),
        supabase.from("org_members").select("user_id, role, status, profiles(email, full_name)").eq("org_id", orgId),
        supabase.from("profiles").select("id, email, full_name"),
        supabase.from("ai_messages").select("*").eq("org_id", orgId).order("created_at")
      ]);

    setData({
      properties: properties.data || [],
      units: units.data || [],
      leases: leases.data || [],
      charges: charges.data || [],
      payments: payments.data || [],
      maintenance: maintenance.data || [],
      members: members.data || [],
      profiles: profiles.data || [],
      ai: ai.data || []
    });
  }

  useEffect(() => { load(); }, []);

  const emailOf = (id: string) => data.profiles.find((p: any) => p.id === id)?.email || "—";
  const memberName = (id: string) => {
    const m = data.members.find((m: any) => m.user_id === id);
    return m?.profiles?.full_name || m?.profiles?.email || "—";
  };

  const occupiedUnitIds = data.leases.filter((l: any) => l.status === "active").map((l: any) => l.unit_id);
  const monthlyRevenue = data.leases
    .filter((l: any) => l.status === "active")
    .reduce((s: number, l: any) => s + Number(l.monthly_rent || 0), 0);

  const revenueByMonth = data.charges
    .filter((c: any) => c.status === "paid")
    .reduce((acc: any, c: any) => {
      const m = String(c.due_date).slice(0, 7);
      acc[m] = (acc[m] || 0) + Number(c.amount);
      return acc;
    }, {});
  const revenueData = Object.entries(revenueByMonth).map(([month, total]) => ({ month, total }));

  const occupancyData = [
    { name: "Occupied", value: occupiedUnitIds.length },
    { name: "Vacant", value: Math.max(data.units.length - occupiedUnitIds.length, 0) }
  ];

  async function addProperty(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: membership } = await supabase.from("org_members").select("org_id").eq("user_id", user!.id).single();
    await supabase.from("properties").insert({
      org_id: membership.org_id,
      name: fd.get("name") as string,
      address: fd.get("address") as string
    });
    load();
    (e.target as HTMLFormElement).reset();
  }

  async function addUnit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: membership } = await supabase.from("org_members").select("org_id").eq("user_id", user!.id).single();
    await supabase.from("units").insert({
      org_id: membership.org_id,
      property_id: fd.get("property_id") as string,
      name: fd.get("name") as string,
      monthly_rent: Number(fd.get("monthly_rent")),
      security_deposit: Number(fd.get("security_deposit") || 0)
    });
    load();
    (e.target as HTMLFormElement).reset();
  }

  async function createLease(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: membership } = await supabase.from("org_members").select("org_id").eq("user_id", user!.id).single();

    const leaseType = fd.get("lease_type") as string;
    const startDate = fd.get("start_date") as string;
    const endDate = leaseType === "indefinite" ? "2099-12-31" : fd.get("end_date") as string;

    const unitId = fd.get("unit_id") as string;
    const unit = data.units.find((u: any) => u.id === unitId);

    const { data: lease, error } = await supabase.from("leases").insert({
      org_id: membership.org_id,
      property_id: unit?.property_id || null,
      unit_id: unitId,
      tenant_user_id: fd.get("tenant_user_id") as string,
      start_date: startDate,
      end_date: endDate,
      monthly_rent: Number(fd.get("monthly_rent")),
      security_deposit: Number(fd.get("security_deposit") || 0),
      lease_type: leaseType,
      status: "active"
    }).select().single();

    if (error) {
      alert("Lease error: " + error.message);
      return;
    }

    if (lease && leaseType === "fixed") {
      await generateRentSchedule(lease.id);
    }

    alert(`Lease created (${leaseType})! ${leaseType === "fixed" ? "Rent schedule generated." : "No schedule for indefinite lease."}`);
    load();
    (e.target as HTMLFormElement).reset();
    setSelectedUnit(null);
  }

  async function setMaintenanceStatus(id: string, status: string) {
    await supabase.from("maintenance_requests").update({ 
      status,
      ...(status === "completed" ? { completed_at: new Date().toISOString() } : {})
    }).eq("id", id);
    load();
  }

  async function sendAI(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!aiMsg.trim()) return;
    setAiBusy(true);
    await askAI(aiMsg);
    setAiMsg("");
    setAiBusy(false);
    load();
  }

  async function submitMaintenance(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await createMaintenanceRequest({
      unitId: (fd.get("unit_id") as string) || null,
      propertyId: fd.get("property_id") as string,
      title: fd.get("title") as string,
      description: fd.get("description") as string,
      priority: fd.get("priority") as string,
      assignedVendorUserId: (fd.get("assigned_vendor_user_id") as string) || undefined,
      issuePhotos: maintenancePhotos,
      issueVideos: maintenanceVideos
    });
    setMaintenancePhotos([]);
    setMaintenanceVideos([]);
    (e.target as HTMLFormElement).reset();
    load();
    alert("Task created!");
  }

  // NEW: Eviction handler
  async function handleEvict() {
    if (!evictModal) return;
    await evictTenant(evictModal.leaseId, evictionReason);
    setEvictModal(null);
    setEvictionReason("");
    load();
    alert("Tenant has been evicted");
  }

  const tenants = data.members.filter((m: any) => m.role === "tenant");
  const caretakers = data.members.filter((m: any) => m.role === "vendor");

  function handleUnitSelect(unitId: string) {
    const unit = data.units.find((u: any) => u.id === unitId);
    setSelectedUnit(unit);
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Manager Console</h1>

      {tab === "dashboard" && (
        <div>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <Stat label="Properties" value={data.properties.length} />
            <Stat label="Units" value={data.units.length} />
            <Stat label="Occupied" value={`${occupiedUnitIds.length}/${data.units.length}`} />
            <Stat label="Monthly Revenue" value={`$${monthlyRevenue}`} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-6 rounded-xl h-72">
              <h3 className="font-semibold mb-4">Collected Rent</h3>
              <ResponsiveContainer width="100%" height="80%">
                <BarChart data={revenueData}>
                  <XAxis dataKey="month" /><YAxis /><Tooltip />
                  <Bar dataKey="total" fill="#4f46e5" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white p-6 rounded-xl h-72">
              <h3 className="font-semibold mb-4">Occupancy</h3>
              <ResponsiveContainer width="100%" height="80%">
                <PieChart>
                  <Pie data={occupancyData} dataKey="value" nameKey="name" outerRadius={80} label>
                    <Cell fill="#22c55e" /><Cell fill="#ef4444" />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {tab === "properties" && (
        <div>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <form onSubmit={addProperty} className="bg-white p-6 rounded-xl">
              <h3 className="font-semibold mb-3">Add Property</h3>
              <input name="name" placeholder="Property name" required className="w-full p-2 border rounded mb-2" />
              <input name="address" placeholder="Address" required className="w-full p-2 border rounded mb-3" />
              <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg">Add Property</button>
            </form>

            <form onSubmit={addUnit} className="bg-white p-6 rounded-xl">
              <h3 className="font-semibold mb-3">Add Unit</h3>
              <select name="property_id" required className="w-full p-2 border rounded mb-2">
                <option value="">Choose property…</option>
                {data.properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input name="name" placeholder="Unit name (e.g. A1)" required className="w-full p-2 border rounded mb-2" />
              <input name="monthly_rent" type="number" placeholder="Monthly rent" required className="w-full p-2 border rounded mb-2" />
              <input name="security_deposit" type="number" placeholder="Security deposit" className="w-full p-2 border rounded mb-3" />
              <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg">Add Unit</button>
            </form>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {data.properties.map((p: any) => (
              <div key={p.id} className="bg-white p-6 rounded-xl">
                <div className="flex justify-between">
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  <span className="text-sm text-gray-500">
                    Caretaker: {p.caretaker_user_id ? memberName(p.caretaker_user_id) : "—"}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mb-3">{p.address}</p>
                <div className="space-y-1 mb-2">
                  {(p.units || []).map((u: any) => (
                    <div key={u.id} className="flex justify-between text-sm bg-gray-50 rounded px-2 py-1">
                      <span>{u.name}</span>
                      <span>${u.monthly_rent}/mo {occupiedUnitIds.includes(u.id) ? "• Occupied" : "• Vacant"}</span>
                    </div>
                  ))}
                  {(p.units || []).length === 0 && <p className="text-sm text-gray-400">No units yet</p>}
                </div>
                <PropertyAccess propertyId={p.id} caretakerUserId={p.caretaker_user_id} />
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "tenants" && (
        <div className="bg-white p-6 rounded-xl">
          <h3 className="font-semibold mb-4">Tenants</h3>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left">
              <th className="py-2">Name</th><th>Email</th><th>Status</th><th>Lease</th>
            </tr></thead>
            <tbody>
              {tenants.map((m: any) => {
                const lease = data.leases.find((l: any) => l.tenant_user_id === m.user_id && l.status === "active");
                return (
                  <tr key={m.user_id} className="border-b">
                    <td className="py-2">{m.profiles?.full_name || "—"}</td>
                    <td>{m.profiles?.email}</td>
                    <td>{m.status}</td>
                    <td>{lease ? `${lease.properties?.name} • ${lease.units?.name}` : "No active lease"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-3">Invite tenants from Admin Panel → Team.</p>
        </div>
      )}

      {tab === "leases" && (
        <div>
          <form onSubmit={createLease} className="bg-white p-6 rounded-xl mb-6 grid grid-cols-3 gap-3">
            <h3 className="col-span-3 font-semibold">Create Lease</h3>
            <select name="tenant_user_id" required className="p-2 border rounded">
              <option value="">Tenant…</option>
              {tenants.map((m: any) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.profiles?.full_name || m.profiles?.email}
                </option>
              ))}
            </select>
            <select name="unit_id" required className="p-2 border rounded" onChange={(e) => handleUnitSelect(e.target.value)}>
              <option value="">Unit…</option>
              {data.units.map((u: any) => {
                const prop = data.properties.find((p: any) => p.id === u.property_id);
                return (
                  <option key={u.id} value={u.id}>
                    {prop?.name} — {u.name} (${u.monthly_rent}/mo)
                  </option>
                );
              })}
            </select>
            <select name="lease_type" required className="p-2 border rounded">
              <option value="fixed">Fixed Period</option>
              <option value="indefinite">Indefinite</option>
            </select>
            <input name="start_date" type="date" required className="p-2 border rounded" />
            <input name="end_date" type="date" className="p-2 border rounded" />
            <input name="monthly_rent" type="number" placeholder="Monthly rent" readOnly value={selectedUnit?.monthly_rent || ""} required className="p-2 border rounded bg-gray-50" />
            <input name="security_deposit" type="number" placeholder="Deposit" readOnly value={selectedUnit?.security_deposit || 0} className="p-2 border rounded bg-gray-50" />
            <button className="col-span-3 px-4 py-2 bg-indigo-600 text-white rounded-lg">
              Create Lease
            </button>
          </form>

          <div className="space-y-3">
            {data.leases.map((l: any) => (
              <div key={l.id} className="bg-white p-6 rounded-xl">
                <div className="flex justify-between mb-2">
                  <b>{l.properties?.name} • {l.units?.name}</b>
                  <span className="text-sm text-gray-500">{emailOf(l.tenant_user_id)}</span>
                </div>
                <p className="text-sm text-gray-600">
                  {l.start_date} → {l.lease_type === "indefinite" ? "Indefinite" : l.end_date} • ${l.monthly_rent}/mo • Deposit ${l.security_deposit}
                </p>
                {l.evicted && (
                  <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    ⚠️ Evicted{l.eviction_reason && <> — Reason: {l.eviction_reason}</>}
                    {l.eviction_date && <> on {new Date(l.eviction_date).toLocaleDateString()}</>}
                  </div>
                )}
                <div className="flex gap-4 mt-2 text-sm">
                  <span>{l.signed_by_tenant ? "✅ Tenant signed" : "⏳ Tenant signature pending"}</span>
                  <span>{l.signed_by_manager ? "✅ Manager signed" : "⏳ Manager signature pending"}</span>
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  {!l.signed_by_manager && (
                    <div className="max-w-md">
                      <SignaturePad leaseId={l.id} role="manager" onSigned={load} />
                    </div>
                  )}
                  {/* NEW: Evict button */}
                  {!l.evicted && l.status === "active" && (
                    <button 
                      onClick={() => setEvictModal({ leaseId: l.id, tenantEmail: emailOf(l.tenant_user_id) })}
                      className="px-3 py-1 bg-red-600 text-white rounded text-sm"
                    >
                      Evict Tenant
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "payments" && (
        <div>
          <div className="bg-white p-6 rounded-xl mb-6">
            <h3 className="font-semibold mb-4">Rent Charges</h3>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left">
                <th className="py-2">Tenant</th><th>Due</th><th>Amount</th><th>Status</th>
              </tr></thead>
              <tbody>
                {data.charges.map((c: any) => (
                  <tr key={c.id} className="border-b">
                    <td className="py-2">{emailOf(c.tenant_user_id)}</td>
                    <td>{c.due_date}</td>
                    <td>${c.amount}</td>
                    <td className={c.status === "paid" ? "text-green-600" : "text-yellow-600"}>{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white p-6 rounded-xl">
            <h3 className="font-semibold mb-4">Payments Received</h3>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left">
                <th className="py-2">Payer</th><th>Amount</th><th>Status</th>
              </tr></thead>
              <tbody>
                {data.payments.map((p: any) => (
                  <tr key={p.id} className="border-b">
                    <td className="py-2">{emailOf(p.payer_user_id)}</td>
                    <td>${p.amount}</td>
                    <td>{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "maintenance" && (
        <div className="space-y-6">
          <form onSubmit={submitMaintenance} className="bg-white p-6 rounded-xl">
            <h3 className="font-semibold mb-4">Create Task / Assign to Caretaker</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <select name="property_id" required className="p-2 border rounded">
                <option value="">Property…</option>
                {data.properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select name="unit_id" className="p-2 border rounded">
                <option value="">Unit (optional)…</option>
                {data.units.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <select name="assigned_vendor_user_id" className="w-full p-2 border rounded mb-3">
              <option value="">Assign to Caretaker (optional)…</option>
              {caretakers.map((v: any) => (
                <option key={v.user_id} value={v.user_id}>
                  {v.profiles?.full_name || v.profiles?.email}
                </option>
              ))}
            </select>
            <input name="title" placeholder="Task title" required className="w-full p-2 border rounded mb-2" />
            <textarea name="description" placeholder="Describe the task" rows={3} required className="w-full p-2 border rounded mb-2" />
            <select name="priority" required className="w-full p-2 border rounded mb-3">
              <option value="low">Low Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="high">High Priority</option>
              <option value="emergency">Emergency</option>
            </select>

            <div className="space-y-3 mb-3">
              <div>
                <div className="text-sm font-semibold mb-2">Reference Photos (optional)</div>
                <FileUploader 
                  folder="maintenance" 
                  mode="image-video" 
                  onUploaded={(meta) => setMaintenancePhotos([...maintenancePhotos, meta.file])}
                />
                {maintenancePhotos.length > 0 && (
                  <div className="mt-2 text-sm text-gray-600">{maintenancePhotos.length} photo(s) uploaded</div>
                )}
              </div>
              <div>
                <div className="text-sm font-semibold mb-2">Reference Videos (optional)</div>
                <FileUploader 
                  folder="maintenance" 
                  mode="image-video" 
                  onUploaded={(meta) => setMaintenanceVideos([...maintenanceVideos, meta.file])}
                />
                {maintenanceVideos.length > 0 && (
                  <div className="mt-2 text-sm text-gray-600">{maintenanceVideos.length} video(s) uploaded</div>
                )}
              </div>
            </div>

            <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg">Create Task</button>
          </form>

          <div className="space-y-3">
            <h3 className="font-semibold text-lg">All Tasks & Requests</h3>
            {data.maintenance.map((m: any) => {
              const assignedVendor = data.members.find((member: any) => member.user_id === m.assigned_vendor_user_id);
              return (
                <div key={m.id} className="bg-white p-6 rounded-xl">
                  <div className="flex justify-between">
                    <b>{m.title}</b>
                    <span className={`text-xs px-2 py-1 rounded ${
                      m.status === "completed" ? "bg-green-100" : m.status === "in_progress" ? "bg-blue-100" : "bg-yellow-100"
                    }`}>{m.status}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{m.description}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Priority: {m.priority} • Reported by: {emailOf(m.reporter_user_id)}
                    {assignedVendor && <> • <b>Assigned: {assignedVendor.profiles?.full_name || assignedVendor.profiles?.email}</b></>}
                  </p>
                  {(m.issue_photos || []).length > 0 && (
                    <div className="mt-2">
                      <div className="text-xs font-semibold text-gray-500 mb-1">ISSUE PHOTOS</div>
                      <div className="flex gap-2 flex-wrap">
                        {m.issue_photos.map((ph: any, i: number) => (
                          <a key={i} href={typeof ph === "string" ? ph : ph?.signedUrl} target="_blank" className="text-indigo-600 text-xs underline">
                            Photo {i + 1}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {(m.completed_photos || []).length > 0 && (
                    <div className="mt-2">
                      <div className="text-xs font-semibold text-green-600 mb-1">COMPLETION PHOTOS</div>
                      <div className="flex gap-2 flex-wrap">
                        {m.completed_photos.map((ph: any, i: number) => (
                          <a key={i} href={typeof ph === "string" ? ph : ph?.signedUrl} target="_blank" className="text-green-600 text-xs underline">
                            Done {i + 1}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {m.completed_at && (
                    <div className="text-xs text-green-600 mt-1">
                      ✅ Completed: {new Date(m.completed_at).toLocaleString()}
                    </div>
                  )}
                  <div className="flex gap-2 mt-3">
                    {m.status !== "in_progress" && m.status !== "completed" && (
                      <button onClick={() => setMaintenanceStatus(m.id, "in_progress")}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-sm">Start Work</button>
                    )}
                    {m.status !== "completed" && (
                      <button onClick={() => setMaintenanceStatus(m.id, "completed")}
                        className="px-3 py-1 bg-green-600 text-white rounded text-sm">Mark Completed</button>
                    )}
                  </div>
                </div>
              );
            })}
            {data.maintenance.length === 0 && <p className="text-gray-400">No maintenance requests.</p>}
          </div>
        </div>
      )}

      {tab === "reports" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-6 rounded-xl h-80">
            <h3 className="font-semibold mb-4">Revenue (paid rent)</h3>
            <ResponsiveContainer width="100%" height="80%">
              <BarChart data={revenueData}>
                <XAxis dataKey="month" /><YAxis /><Tooltip />
                <Bar dataKey="total" fill="#4f46e5" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white p-6 rounded-xl h-80">
            <h3 className="font-semibold mb-4">Occupancy</h3>
            <ResponsiveContainer width="100%" height="80%">
              <PieChart>
                <Pie data={occupancyData} dataKey="value" nameKey="name" outerRadius={100} label>
                  <Cell fill="#22c55e" /><Cell fill="#ef4444" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {tab === "ai" && (
        <div className="bg-white p-6 rounded-xl max-w-2xl">
          <h3 className="font-semibold mb-4">AI Assistant</h3>
          <div className="space-y-2 mb-4 max-h-96 overflow-auto">
            {data.ai.map((m: any) => (
              <div key={m.id} className={`p-3 rounded-lg text-sm ${m.role === "user" ? "bg-indigo-50" : "bg-gray-100"}`}>
                <b className="block text-xs text-gray-500 mb-1">{m.role === "user" ? "You" : "AI"}</b>
                {m.content}
              </div>
            ))}
          </div>
          <form onSubmit={sendAI} className="flex gap-2">
            <input value={aiMsg} onChange={e => setAiMsg(e.target.value)}
              placeholder="Ask about your portfolio…" className="flex-1 p-3 border rounded-lg" />
            <button disabled={aiBusy} className="px-5 py-3 bg-indigo-600 text-white rounded-lg">
              {aiBusy ? "Thinking…" : "Send"}
            </button>
          </form>
        </div>
      )}

      {/* NEW: Eviction Modal */}
      {evictModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Evict Tenant</h3>
            <p className="text-sm text-gray-600 mb-4">
              You are about to evict <b>{evictModal.tenantEmail}</b>. This will terminate their lease.
            </p>
            <textarea
              value={evictionReason}
              onChange={(e) => setEvictionReason(e.target.value)}
              placeholder="Reason for eviction (optional)"
              rows={3}
              className="w-full p-2 border rounded mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={handleEvict}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded"
              >
                Confirm Eviction
              </button>
              <button
                onClick={() => { setEvictModal(null); setEvictionReason(""); }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: any) {
  return (
    <div className="bg-white p-6 rounded-xl">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
