"use client";
import { Suspense, useState } from "react";
import { signUp } from "@/lib/actions";
import { useRouter, useSearchParams } from "next/navigation";

const roleLabels: Record<string, string> = {
  tenant: "Tenant",
  manager: "Property Manager",
  owner: "Owner",
  vendor: "Caretaker / Vendor",
  owner_admin: "Administrator"
};

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50">Loading...</div>}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const searchParams = useSearchParams();
  const invitedRole = searchParams.get("role");
  const invitedEmail = searchParams.get("email") || "";

  const [form, setForm] = useState({
    fullName: "",
    orgName: "",
    email: invitedEmail,
    password: ""
  });
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result: any = await signUp(
        form.email,
        form.password,
        form.fullName,
        form.orgName || "My Organization"
      );

      if (result?.error) {
        alert(result.error);
        return;
      }

      if (result.invited) {
        const dest =
          invitedRole === "tenant" ? "/tenants" :
          invitedRole === "vendor" ? "/vendor" :
          invitedRole === "owner" ? "/owner" :
          invitedRole === "manager" ? "/manager" :
          "/admin";
        router.push(dest);
      } else {
        router.push("/admin");
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold mb-2">Create Account</h1>

        {invitedRole && (
          <div className="mb-4 p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-sm text-indigo-700">
            🎉 You've been invited to join as <b>{roleLabels[invitedRole] || invitedRole}</b>.
            <br />
            Sign up with <b>{invitedEmail}</b> to accept the invite.
          </div>
        )}

        <input
          type="text"
          placeholder="Full Name"
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          className="w-full p-3 border rounded-lg mb-3"
          required
        />

        {!invitedRole && (
          <input
            type="text"
            placeholder="Organization Name"
            value={form.orgName}
            onChange={(e) => setForm({ ...form, orgName: e.target.value })}
            className="w-full p-3 border rounded-lg mb-3"
            required={!invitedRole}
          />
        )}

        <input
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="w-full p-3 border rounded-lg mb-3"
          required
          readOnly={!!invitedEmail}
        />

        <input
          type="password"
          placeholder="Password (min 6 characters)"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="w-full p-3 border rounded-lg mb-4"
          required
          minLength={6}
        />

        <button disabled={loading} className="w-full py-3 bg-indigo-600 text-white rounded-lg font-semibold">
          {loading ? "Creating..." : invitedRole ? "Accept Invite & Create Account" : "Create Account"}
        </button>
      </form>
    </div>
  );
}
