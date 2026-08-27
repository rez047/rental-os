"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { assignCaretaker, addCoOwner, removeCoOwner } from "@/lib/actions";

export default function PropertyAccess({ propertyId, caretakerUserId }: {
  propertyId: string;
  caretakerUserId: string | null;
}) {
  const supabase = createClient();
  const [members, setMembers] = useState<any[]>([]);
  const [coOwners, setCoOwners] = useState<any[]>([]);
  const [caretaker, setCaretaker] = useState<string>(caretakerUserId || "");
  const [pickOwner, setPickOwner] = useState("");

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: membership } = await supabase
      .from("org_members").select("org_id")
      .eq("user_id", user!.id).eq("status", "active").single();

    const { data: m } = await supabase
      .from("org_members")
      .select("user_id, role, profiles(email, full_name)")
      .eq("org_id", membership.org_id);
    setMembers(m || []);

    const { data: po } = await supabase
      .from("property_owners")
      .select("user_id, profiles(email, full_name)")
      .eq("property_id", propertyId);
    setCoOwners(po || []);
  }

  useEffect(() => { load(); }, [propertyId]);

  const caretakers = members.filter(m => m.role === "vendor" || m.role === "manager");
  const owners = members.filter(m => m.role === "owner" || m.role === "owner_admin");
  const availableOwners = owners.filter(o => !coOwners.some(c => c.user_id === o.user_id));

  return (
    <div className="mt-4 pt-4 border-t space-y-3">
      <div>
        <div className="text-xs font-semibold text-gray-500 mb-1">CARETAKER</div>
        <select
          value={caretaker}
          onChange={async (e) => {
            setCaretaker(e.target.value);
            await assignCaretaker(propertyId, e.target.value || null);
          }}
          className="w-full p-2 border rounded-lg text-sm"
        >
          <option value="">— No caretaker —</option>
          {caretakers.map(v => (
            <option key={v.user_id} value={v.user_id}>
              {v.profiles?.full_name || v.profiles?.email} ({v.role})
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-500 mb-1">CO-OWNERS</div>
        {coOwners.length === 0 && <p className="text-sm text-gray-400">Sole ownership</p>}
        <ul className="space-y-1 mb-2">
          {coOwners.map(c => (
            <li key={c.user_id} className="flex items-center justify-between text-sm bg-gray-50 rounded px-2 py-1">
              <span>{c.profiles?.full_name || c.profiles?.email}</span>
              <button
                onClick={async () => { await removeCoOwner(propertyId, c.user_id); load(); }}
                className="text-red-600 text-xs"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <select value={pickOwner} onChange={e => setPickOwner(e.target.value)}
            className="flex-1 p-2 border rounded-lg text-sm">
            <option value="">Add co-owner…</option>
            {availableOwners.map(o => (
              <option key={o.user_id} value={o.user_id}>
                {o.profiles?.full_name || o.profiles?.email}
              </option>
            ))}
          </select>
          <button
            disabled={!pickOwner}
            onClick={async () => { await addCoOwner(propertyId, pickOwner); setPickOwner(""); load(); }}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
