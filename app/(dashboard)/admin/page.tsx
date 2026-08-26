"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { createStripeCheckout, inviteMember } from "@/lib/actions";

export default function AdminDashboard() {
  const supabase = createClient();
  const [org, setOrg] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: membership } = await supabase
        .from("org_members").select("*, organizations(*)").eq("user_id", user!.id).single();
      setOrg(membership.organizations);

      const { data: m } = await supabase.from("org_members")
        .select("*, profiles(*)").eq("org_id", membership.org_id);
      setMembers(m || []);
    })();
  }, []);

  async function subscribe(priceId: string) {
    const url = await createStripeCheckout(org.id, priceId);
    if (url) window.location.href = url;
  }

  async function handleInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await inviteMember(fd.get("email") as string, fd.get("role") as string);
    alert("Invite sent");
    e.currentTarget.reset();
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Admin Panel</h1>
      <div className="flex gap-2 mb-6">
        {["overview", "team", "billing"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg ${tab === t ? "bg-indigo-600 text-white" : "bg-white"}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Plan" value={org?.plan || "free"} />
          <StatCard label="Members" value={members.length} />
          <StatCard label="Subscription" value={org?.subscription_status || "inactive"} />
        </div>
      )}

      {tab === "team" && (
        <div className="bg-white p-6 rounded-xl">
          <h2 className="text-xl font-semibold mb-4">Invite team member</h2>
          <form onSubmit={handleInvite} className="flex gap-2 mb-6">
            <input name="email" type="email" placeholder="email@example.com" required
              className="flex-1 p-3 border rounded-lg" />
            <select name="role" className="p-3 border rounded-lg">
              <option value="manager">Manager</option>
              <option value="tenant">Tenant</option>
              <option value="owner">Owner</option>
              <option value="vendor">Vendor/Caretaker</option>
            </select>
            <button className="px-6 bg-indigo-600 text-white rounded-lg">Invite</button>
          </form>
          <table className="w-full">
            <thead><tr className="border-b">
              <th className="text-left py-2">Email</th><th className="text-left py-2">Role</th><th className="text-left py-2">Status</th>
            </tr></thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} className="border-b">
                  <td className="py-2">{m.profiles?.email || m.invite_email}</td>
                  <td className="py-2 capitalize">{m.role}</td>
                  <td className="py-2">{m.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "billing" && (
        <div className="grid grid-cols-3 gap-4">
          <PlanCard name="Starter" price="$29/mo" onSubscribe={() => subscribe(process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY!)} />
          <PlanCard name="Pro" price="$79/mo" highlight onSubscribe={() => subscribe(process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY!)} />
          <PlanCard name="Enterprise" price="$199/mo" onSubscribe={() => subscribe(process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY!)} />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-white p-6 rounded-xl">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-bold mt-1 capitalize">{value}</div>
    </div>
  );
}

function PlanCard({ name, price, highlight, onSubscribe }: any) {
  return (
    <div className={`p-6 rounded-xl ${highlight ? "bg-indigo-600 text-white" : "bg-white"}`}>
      <h3 className="text-xl font-bold">{name}</h3>
      <div className="text-3xl font-bold my-4">{price}</div>
      <button onClick={onSubscribe}
        className={`w-full py-3 rounded-lg ${highlight ? "bg-white text-indigo-600" : "bg-indigo-600 text-white"}`}>
        Subscribe
      </button>
    </div>
  );
}