"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

export default function OwnerPortal() {
  const supabase = createClient();
  const [data, setData] = useState<any>({ properties: [], units: [], leases: [], payments: [] });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: properties } = await supabase.from("properties").select("*").eq("owner_user_id", user!.id);
      const propertyIds = (properties || []).map(p => p.id);
      const [units, leases, payments] = await Promise.all([
        supabase.from("units").select("*").in("property_id", propertyIds),
        supabase.from("leases").select("*").in("unit_id", (await supabase.from("units").select("id").in("property_id", propertyIds)).data?.map(u => u.id) || []),
        supabase.from("payments").select("*").eq("status", "succeeded")
      ]);
      setData({ properties: properties || [], units: units.data || [], leases: leases.data || [], payments: payments.data || [] });
    })();
  }, []);

  const revenue = data.payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
  const occupancy = data.units.length ? (data.units.filter((u: any) => u.status === "occupied").length / data.units.length) * 100 : 0;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Owner Portal</h1>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Properties" value={data.properties.length} />
        <StatCard label="Total Revenue" value={`$${revenue.toLocaleString()}`} />
        <StatCard label="Occupancy" value={`${occupancy.toFixed(0)}%`} />
      </div>

      <div className="bg-white p-6 rounded-xl">
        <h2 className="font-semibold mb-4">Monthly Statement</h2>
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-left py-2">Date</th><th>Description</th><th>Amount</th></tr></thead>
          <tbody>
            {data.payments.slice(-20).reverse().map((p: any) => (
              <tr key={p.id} className="border-b">
                <td className="py-2">{new Date(p.paid_at || p.created_at).toLocaleDateString()}</td>
                <td>Rent payment</td>
                <td className="text-green-600">+${p.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value }: any) {
  return <div className="bg-white p-6 rounded-xl"><div className="text-sm text-gray-500">{label}</div><div className="text-2xl font-bold mt-1">{value}</div></div>;
}