"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import { sendMessage } from "@/lib/actions";

const roleLabels: Record<string, string> = {
  owner_admin: "Owner Admin",
  owner: "Owner",
  manager: "Manager",
  vendor: "Caretaker",
  tenant: "Tenant"
};

const roleOrder = ["owner_admin", "owner", "manager", "vendor", "tenant"];

export default function MessagesPanel() {
  const supabase = createClient();
  const [userId, setUserId] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [recipient, setRecipient] = useState("");
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user!.id);
    const { data: membership } = await supabase
      .from("org_members").select("org_id")
      .eq("user_id", user!.id).eq("status", "active").single();

    const [membersRes, msgsRes] = await Promise.all([
      supabase.from("org_members")
        .select("user_id, role, profiles(email, full_name)")
        .eq("org_id", membership.org_id)
        .eq("status", "active"),
      supabase.from("messages")
        .select("*")
        .eq("org_id", membership.org_id)
        .or(`sender_user_id.eq.${user!.id},recipient_user_id.eq.${user!.id}`)
        .order("created_at", { ascending: true })
        .limit(300)
    ]);

    const others = (membersRes.data || [])
      .filter((m: any) => m.user_id !== user!.id)
      .sort((a: any, b: any) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role));

    setMembers(others);
    const msgs = msgsRes.data || [];
    setMessages(msgs);

    if (!recipient && msgs.length > 0) {
      const last = msgs[msgs.length - 1];
      setRecipient(last.sender_user_id === user!.id ? last.recipient_user_id : last.sender_user_id);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, recipient]);

  const nameOf = (id: string) => {
    const m = members.find((x: any) => x.user_id === id);
    return m?.profiles?.full_name || m?.profiles?.email || "—";
  };
  const roleOf = (id: string) => {
    const m = members.find((x: any) => x.user_id === id);
    return roleLabels[m?.role] || m?.role || "";
  };

  const thread = messages.filter((m: any) =>
    (m.sender_user_id === userId && m.recipient_user_id === recipient) ||
    (m.sender_user_id === recipient && m.recipient_user_id === userId)
  );

  async function send() {
    if (!text.trim() || !recipient) return;
    await sendMessage(text.trim(), recipient);
    setText("");
    load();
  }

  return (
    <div className="bg-white p-6 rounded-xl max-w-3xl">
      <h3 className="font-semibold mb-4">Messages</h3>

      {/* Recipient picker */}
      <div className="mb-4">
        <label className="text-sm font-semibold text-gray-600 block mb-1">Send message to:</label>
        <select value={recipient} onChange={(e) => setRecipient(e.target.value)}
          className="w-full p-2 border rounded">
          <option value="">— Choose a person —</option>
          {members.map((m: any) => (
            <option key={m.user_id} value={m.user_id}>
              {m.profiles?.full_name || m.profiles?.email} ({roleLabels[m.role] || m.role})
            </option>
          ))}
        </select>
      </div>

      {/* Conversation thread */}
      <div className="border rounded-lg p-4 h-96 overflow-y-auto bg-gray-50 space-y-3">
        {!recipient && <p className="text-sm text-gray-400 text-center">Select a person to start or view a conversation.</p>}
        {recipient && thread.length === 0 && (
          <p className="text-sm text-gray-400 text-center">No messages yet with {nameOf(recipient)}. Say hello!</p>
        )}
        {recipient && thread.map((m: any) => {
          const mine = m.sender_user_id === userId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] p-3 rounded-xl text-sm ${mine ? "bg-indigo-600 text-white" : "bg-white border"}`}>
                <div className={`text-xs mb-1 ${mine ? "text-indigo-200" : "text-gray-500"}`}>
                  {mine ? `You → ${nameOf(recipient)}` : `${nameOf(m.sender_user_id)} (${roleOf(m.sender_user_id)}) → You`}
                </div>
                <p>{m.content}</p>
                <div className={`text-[10px] mt-1 ${mine ? "text-indigo-200" : "text-gray-400"}`}>
                  {new Date(m.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="flex gap-2 mt-4">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={recipient ? `Message ${nameOf(recipient)}...` : "Select a recipient first"}
          disabled={!recipient}
          className="flex-1 p-2 border rounded disabled:bg-gray-100"
        />
        <button onClick={send} disabled={!recipient || !text.trim()}
          className="px-4 py-2 bg-indigo-600 text-white rounded disabled:bg-gray-300">
          Send
        </button>
      </div>
    </div>
  );
}
