"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import MessagesPanel from "@/components/MessagesPanel";

export default function OwnerPortal() {
  const supabase = createClient();
  const [tab, setTab] = useState("portfolio");
  const [data, setData] = useState<any>({ properties: [], leases: [], charges: [], payments: [] });

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: membership } = await supabase
      .from("org_members").select("org_id")
      .eq("user_id", user!.id).eq("status", "active").single();

    const { data: ownedRows } = await supabase
      .from("property_owners").select("property_id")
      .eq("user_id", user!.id);
    const ownedIds = (ownedRows || []).map((r: any) => r.property_id);

    const { data: properties } = await supabase
      .from("properties").select("*, units(*)")
      .eq("org_id", membership.org_id)
      .in("id", ownedIds.length ? ownedIds : ["00000000-0000-0000-0000-000000000000"]);

    const props = properties || [];
    const unitIds = props.flatMap((p: any) => (p.units || []).map((u: any) => u.id));

    const { data: leases } = await supabase
      .from("leases").select("*")
      .in("unit_id", unitIds.length ? unitIds : ["00000000-0000-0000-0000-000000000000"]);

    const leaseIds = (leases || []).map((l: any) => l.id);

    const { data: charges } = await supabase
      .from("rent_charges").select("*")
      .in("lease_id", leaseIds.length ? leaseIds : ["00000000-0000-0000-0000-000000000000"]);

    const { data: payments } = await supabase
      .from("payments").select("*")
      .in("lease_id", leaseIds.length ? leaseIds : ["00000000-0000-0000-0000-000000000000"]);

    setData({
      properties: props,
      leases: leases || [],
      charges: charges || [],
      payments: payments || []
    });
  }

  useEffect(() => { load(); }, []);

  const activeLeases = data.leases.filter((l: any) => l.status === "active");
  const collected = data.charges.filter((c: any) => c.status === "paid").reduce((s: number, c: any) => s + Number(c.amount), 0);
  const outstanding = data.charges.filter((c: any) => c.status !== "paid").reduce((s: number, c: any) => s + Number(c.amount), 0);

  const byMonth = data.charges.filter((c: any) => c.status === "paid").reduce((acc: any, c: any) => {
    const m = String(c.due_date).slice(0, 7);
    acc[m] = (acc[m] || 0) + Number(c.amount);
    return acc;
  }, {});
  const statementData = Object.entries(byMonth).map(([month, total]) => ({ month, total }));

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Owner Portal</h1>
      <div className="flex gap-2 mb-6">
        {["portfolio", "statements", "messages"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg ${tab === t ? "bg-indigo-600 text-white" : "bg-white"}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "portfolio" && (
        <div>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Stat label="My Properties" value={data.properties.length} />
            <Stat label="Active Leases" value={activeLeases.length} />
            <Stat label="Outstanding Rent" value={`$${outstanding}`} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {data.properties.map((p: any) => (
              <div key={p.id} className="bg-white p-6 rounded-xl">
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <p className="text-sm text-gray-500 mb-3">{p.address}</p>
                <div className="space-y-1">
                  {(p.units || []).map((u: any) => {
                    const lease = data.leases.find((l: any) => l.unit_id === u.id && l.status === "active");
                    return (
                      <div key={u.id} className="flex justify-between text-sm bg-gray-50 rounded px-2 py-1">
                        <span>{u.name}</span>
                        <span>{lease ? `✅ $${lease.monthly_rent}/mo` : "• Vacant"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {data.properties.length === 0 && (
              <p className="text-gray-400">
                No properties assigned to you yet. Ask your organization admin to add you as a co-owner.
              </p>
            )}
          </div>
        </div>
      )}

      {tab === "statements" && (
        <div>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Stat label="Total Collected" value={`$${collected}`} />
            <Stat label="Outstanding" value={`$${outstanding}`} />
          </div>
          <div className="bg-white p-6 rounded-xl h-80 mb-6">
            <h3 className="font-semibold mb-4">Rent Collected Per Month (your properties)</h3>
            <ResponsiveContainer width="100%" height="80%">
              <BarChart data={statementData}>
                <XAxis dataKey="month" /><YAxis /><Tooltip />
                <Bar dataKey="total" fill="#22c55e" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white p-6 rounded-xl">
            <h3 className="font-semibold mb-4">Monthly Statements</h3>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left"><th className="py-2">Month</th><th>Collected</th></tr></thead>
              <tbody>
                {statementData.map((s: any) => (
                  <tr key={s.month} className="border-b">
                    <td className="py-2">{s.month}</td>
                    <td>${s.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "messages" && <MessagesPanel />}
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
