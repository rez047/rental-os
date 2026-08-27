"use client";
import { useState } from "react";
import { signIn } from "@/lib/actions";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

export default function Login() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email, password);

      // Get the logged-in user's role to route them correctly
      const { data: { user } } = await supabase.auth.getUser();
      const { data: membership } = await supabase
        .from("org_members")
        .select("role")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .single();

      const role = membership?.role;

      if (role === "tenant") router.push("/tenants");
      else if (role === "vendor") router.push("/vendor");
      else if (role === "owner") router.push("/owner");
      else if (role === "manager") router.push("/manager");
      else router.push("/admin"); // defaults to owner_admin

    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6">Login</h1>
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
          className="w-full p-3 border rounded-lg mb-3" required />
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
          className="w-full p-3 border rounded-lg mb-4" required />
        <button disabled={loading} className="w-full py-3 bg-indigo-600 text-white rounded-lg font-semibold">
          {loading ? "Signing in..." : "Sign In"}
        </button>
        <p className="text-center mt-4 text-sm">
          No account? <Link href="/signup" className="text-indigo-600">Sign up</Link>
        </p>
      </form>
    </div>
  );
}
