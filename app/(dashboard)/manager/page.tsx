"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useSearchParams } from "next/navigation";
import {
  generateRentSchedule, uploadDocument, askAI,
  createMaintenanceRequest
} from "@/lib/actions";
import FileUploader from "@/components/FileUploader";
import SignaturePad from "@/components/SignaturePad";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";

export default function ManagerDashboard() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") || "dashboard";
  const supabase = createClient();

  const [data, setData] = useState<any>({
    properties: [], units: [], leases: [], charges: [], payments: [],
    maintenance: [], tenants: [], documents: []
  });

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: membership } = await supabase.from("org_members")
      .select("org_id").eq("user_id", user!.id).single();
    const orgId = membership.org_id;

    const [properties, units, leases, charges, payments, maintenance, tenants, documents] = await Promise.all([
      supabase.from("properties").select("*").eq("org_id", orgId),
      supabase.from("units").select("*").eq("org_id", orgId),
      supabase.from("leases").select("*").eq("org_id", orgId),
      supabase.from("rent_charges").select("*").eq("org_id", orgId),
      supabase.from("payments").select("*").eq("org_id", orgId),
      supabase.from("maintenance_requests").select("*").eq("org_id", orgId),
      supabase.from("profiles").select("*"),
      supabase.from("documents").select("*").eq("org_id", orgId),
    ]);

    setData({
      properties: properties.data || [], units: units.data || [], leases: leases.data || [],
      charges: charges.data || [], payments: payments.data || [],
      maintenance: maintenance.data || [], tenants: tenants.data || [], documents: documents.data || []
    });
  }

  useEffect(() => { loadAll(); }, []);

  return (
    <div>
      {tab === "dashboard" && <Dashboard data={data} />}
      {tab === "properties" && <PropertiesTab data={data} reload={loadAll} />}
      {tab === "tenants" && <TenantsTab data={data} reload={loadAll} />}
      {tab === "leases" && <LeasesTab data={data} reload={loadAll} />}
      {tab === "payments" && <PaymentsTab data={data} />}
      {tab === "maintenance" && <MaintenanceTab data={data} reload={loadAll} />}
      {tab === "reports" && <ReportsTab data={data} />}
      {tab === "ai" && <AITab />}
    </div>
  );
}

function Dashboard({ data }: any) {
  const occupied = data.units.filter((u: any) => u.status === "occupied").length;
  const vacant = data.units.filter((u: any) => u.status === "vacant").length;
  const totalRent = data.charges.reduce((s: number, c: any) => s + Number(c.amount), 0);
  const collected = data.payments.reduce((s: number, p: any) => s + Number(p.amount), 0);

  const occupancyData = [
    { name: "Occupied", value: occupied },
    { name: "Vacant", value: vacant }
  ];
  const COLORS = ["#4f46e5", "#e5e7eb"];

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Properties" value={data.properties.length} />
        <StatCard label="Units" value={data.units.length} />
        <StatCard label="Active Leases" value={data.leases.filter((l: any) => l.status === "active").length} />
        <StatCard label="Open Maintenance" value={data.maintenance.filter((m: any) => m.status === "open").length} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-6 rounded-xl">
          <h3 className="font-semibold mb-4">Occupancy</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={occupancyData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value">
                {occupancyData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-xl">
          <h3 className="font-semibold mb-4">Revenue</h3>
          <div className="space-y-2">
            <div className="flex justify-between"><span>Total Charged:</span><b>${totalRent.toLocaleString()}</b></div>
            <div className="flex justify-between"><span>Collected:</span><b className="text-green-600">${collected.toLocaleString()}</b></div>
            <div className="flex justify-between"><span>Outstanding:</span><b className="text-red-600">${(totalRent - collected).toLocaleString()}</b></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PropertiesTab({ data, reload }: any) {
  const supabase = createClient();
  async function createProperty(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: membership } = await supabase.from("org_members").select("org_id").eq("user_id", user!.id).single();
    await supabase.from("properties").insert({
      org_id: membership.org_id, name: fd.get("name"), address: fd.get("address"),
      city: fd.get("city"), country: fd.get("country")
    });
    reload();
    (e.target as HTMLFormElement).reset();
  }

  async function createUnit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: membership } = await supabase.from("org_members").select("org_id").eq("user_id", user!.id).single();
    await supabase.from("units").insert({
      org_id: membership.org_id, property_id: fd.get("property_id"), name: fd.get("name"),
      rent_amount: Number(fd.get("rent_amount")), deposit_amount: Number(fd.get("deposit_amount") || 0),
      bedrooms: Number(fd.get("bedrooms") || 0)
    });
    reload();
    (e.target as HTMLFormElement).reset();
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Properties & Units</h1>
      <div className="grid grid-cols-2 gap-6 mb-6">
        <form onSubmit={createProperty} className="bg-white p-6 rounded-xl">
          <h3 className="font-semibold mb-4">Add Property</h3>
          <input name="name" placeholder="Property name" required className="w-full p-2 border rounded mb-2" />
          <input name="address" placeholder="Address" className="w-full p-2 border rounded mb-2" />
          <input name="city" placeholder="City" className="w-full p-2 border rounded mb-2" />
          <input name="country" placeholder="Country" className="w-full p-2 border rounded mb-2" />
          <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg">Add Property</button>
        </form>

        <form onSubmit={createUnit} className="bg-white p-6 rounded-xl">
          <h3 className="font-semibold mb-4">Add Unit</h3>
          <select name="property_id" required className="w-full p-2 border rounded mb-2">
            <option value="">Select property</option>
            {data.properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input name="name" placeholder="Unit name (e.g., Unit 3A)" required className="w-full p-2 border rounded mb-2" />
          <input name="rent_amount" type="number" placeholder="Monthly rent" required className="w-full p-2 border rounded mb-2" />
          <input name="deposit_amount" type="number" placeholder="Deposit" className="w-full p-2 border rounded mb-2" />
          <input name="bedrooms" type="number" placeholder="Bedrooms" className="w-full p-2 border rounded mb-2" />
          <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg">Add Unit</button>
        </form>
      </div>

      <div className="bg-white p-6 rounded-xl">
        <h3 className="font-semibold mb-4">All Units</h3>
        <table className="w-full text-sm">
          <thead><tr className="border-b">
            <th className="text-left py-2">Property</th><th className="text-left">Unit</th>
            <th className="text-left">Rent</th><th className="text-left">Status</th>
          </tr></thead>
          <tbody>
            {data.units.map((u: any) => {
              const p = data.properties.find((p: any) => p.id === u.property_id);
              return (
                <tr key={u.id} className="border-b">
                  <td className="py-2">{p?.name}</td><td>{u.name}</td>
                  <td>${u.rent_amount}</td>
                  <td><span className={`px-2 py-1 rounded text-xs ${u.status === "occupied" ? "bg-green-100 text-green-700" : "bg-gray-100"}`}>{u.status}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TenantsTab({ data, reload }: any) {
  // Similar pattern — invite tenant, link to unit
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Tenants</h1>
      <div className="bg-white p-6 rounded-xl">
        <p className="text-sm text-gray-600 mb-4">
          To add a tenant, invite them via Admin → Team with role "tenant", then they'll appear here after first login.
        </p>
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-left py-2">Name</th><th>Email</th><th>Phone</th></tr></thead>
          <tbody>
            {data.tenants.map((t: any) => (
              <tr key={t.id} className="border-b">
                <td className="py-2">{t.full_name}</td><td>{t.email}</td><td>{t.phone}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LeasesTab({ data, reload }: any) {
  const supabase = createClient();

  async function createLease(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: membership } = await supabase.from("org_members").select("org_id").eq("user_id", user!.id).single();
    const { data: lease } = await supabase.from("leases").insert({
      org_id: membership.org_id, unit_id: fd.get("unit_id"), tenant_user_id: fd.get("tenant_id"),
      start_date: fd.get("start_date"), end_date: fd.get("end_date"),
      monthly_rent: Number(fd.get("monthly_rent")), security_deposit: Number(fd.get("deposit") || 0)
    }).select().single();

    await generateRentSchedule(lease.id);
    reload();
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Leases</h1>
      <form onSubmit={createLease} className="bg-white p-6 rounded-xl mb-6">
        <h3 className="font-semibold mb-4">Create Lease</h3>
        <div className="grid grid-cols-2 gap-3">
          <select name="unit_id" required className="p-2 border rounded">
            <option value="">Select unit</option>
            {data.units.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select name="tenant_id" required className="p-2 border rounded">
            <option value="">Select tenant</option>
            {data.tenants.map((t: any) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
          <input name="start_date" type="date" required className="p-2 border rounded" />
          <input name="end_date" type="date" required className="p-2 border rounded" />
          <input name="monthly_rent" type="number" placeholder="Monthly rent" required className="p-2 border rounded" />
          <input name="deposit" type="number" placeholder="Deposit" className="p-2 border rounded" />
        </div>
        <button className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg">Create Lease & Generate Schedule</button>
      </form>

      <div className="bg-white p-6 rounded-xl">
        {data.leases.map((l: any) => (
          <div key={l.id} className="border-b py-3">
            <div className="flex justify-between">
              <div>
                <b>Lease #{l.id.slice(0, 8)}</b>
                <div className="text-sm text-gray-500">{l.start_date} → {l.end_date} | ${l.monthly_rent}/mo</div>
              </div>
              <div className="flex gap-2">
                <FileUploader
                  folder="leases"
                  mode="document"
                  onUploaded={async (meta) => {
                    await uploadDocument(meta.file, "lease", l.id);
                    reload();
                  }}
                />
                {!l.signed_by_manager && (
                  <SignaturePad leaseId={l.id} role="manager" onSigned={reload} />
                )}
              </div>
            </div>
            <div className="text-xs mt-1">
              Signed: Manager {l.signed_by_manager ? "✓" : "✗"} | Tenant {l.signed_by_tenant ? "✓" : "✗"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentsTab({ data }: any) {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Payments & Invoices</h1>
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl">
          <h3 className="font-semibold mb-4">Rent Charges</h3>
          {data.charges.slice(0, 20).map((c: any) => (
            <div key={c.id} className="border-b py-2 flex justify-between text-sm">
              <div>
                <div>{c.due_date}</div>
                <div className="text-xs text-gray-500">Amount: ${c.amount} | Paid: ${c.amount_paid}</div>
              </div>
              <span className={`text-xs px-2 py-1 rounded ${c.status === "paid" ? "bg-green-100" : "bg-yellow-100"}`}>
                {c.status}
              </span>
            </div>
          ))}
        </div>
        <div className="bg-white p-6 rounded-xl">
          <h3 className="font-semibold mb-4">Payments Received</h3>
          {data.payments.map((p: any) => (
            <div key={p.id} className="border-b py-2 text-sm">
              <div className="flex justify-between">
                <span>${p.amount}</span>
                <span className={p.status === "succeeded" ? "text-green-600" : "text-yellow-600"}>{p.status}</span>
              </div>
              {p.receipt_url && <a href={p.receipt_url} className="text-indigo-600 text-xs">Download receipt</a>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MaintenanceTab({ data, reload }: any) {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Maintenance</h1>
      <div className="space-y-3">
        {data.maintenance.map((m: any) => (
          <div key={m.id} className="bg-white p-4 rounded-xl">
            <div className="flex justify-between mb-2">
              <div>
                <b>{m.title}</b>
                <span className={`ml-2 text-xs px-2 py-1 rounded ${
                  m.priority === "high" ? "bg-red-100 text-red-700" :
                  m.priority === "emergency" ? "bg-red-600 text-white" : "bg-gray-100"
                }`}>{m.priority}</span>
              </div>
              <span className={`text-xs px-2 py-1 rounded ${m.status === "completed" ? "bg-green-100" : "bg-yellow-100"}`}>
                {m.status}
              </span>
            </div>
            <p className="text-sm text-gray-600">{m.description}</p>
            {m.photos?.length > 0 && (
              <div className="flex gap-2 mt-2">
                {m.photos.map((p: any, i: number) => (
                  <img key={i} src={p.signedUrl} className="w-20 h-20 rounded object-cover" />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportsTab({ data }: any) {
  const revenueByMonth: Record<string, number> = {};
  data.payments.forEach((p: any) => {
    const month = p.paid_at ? new Date(p.paid_at).toLocaleString("default", { month: "short" }) : "Pending";
    revenueByMonth[month] = (revenueByMonth[month] || 0) + Number(p.amount);
  });

  const chartData = Object.entries(revenueByMonth).map(([month, amount]) => ({ month, amount }));

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Advanced Reports</h1>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Revenue" value={`$${data.payments.reduce((s: number, p: any) => s + Number(p.amount), 0).toLocaleString()}`} />
        <StatCard label="Outstanding" value={`$${data.charges.reduce((s: number, c: any) => s + (Number(c.amount) - Number(c.amount_paid)), 0).toLocaleString()}`} />
        <StatCard label="Avg Rent" value={`$${Math.round(data.units.reduce((s: number, u: any) => s + Number(u.rent_amount), 0) / (data.units.length || 1))}`} />
      </div>
      <div className="bg-white p-6 rounded-xl">
        <h3 className="font-semibold mb-4">Revenue Over Time</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" /><YAxis /><Tooltip />
            <Bar dataKey="amount" fill="#4f46e5" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AITab() {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!input.trim()) return;
    const userMsg = input;
    setInput("");
    setMessages(m => [...m, { role: "user", content: userMsg }]);
    setLoading(true);
    const reply = await askAI(userMsg);
    setMessages(m => [...m, { role: "assistant", content: reply! }]);
    setLoading(false);
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">AI Assistant</h1>
      <div className="bg-white p-6 rounded-xl h-[600px] flex flex-col">
        <div className="flex-1 overflow-y-auto mb-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`p-3 rounded-lg max-w-[80%] ${
              m.role === "user" ? "bg-indigo-600 text-white ml-auto" : "bg-gray-100"
            }`}>
              {m.content}
            </div>
          ))}
          {loading && <div className="bg-gray-100 p-3 rounded-lg max-w-[80%]">Thinking...</div>}
        </div>
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && send()}
            placeholder="Ask about tenants, leases, maintenance..."
            className="flex-1 p-3 border rounded-lg" />
          <button onClick={send} disabled={loading} className="px-6 bg-indigo-600 text-white rounded-lg">Send</button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: any) {
  return (
    <div className="bg-white p-6 rounded-xl">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}