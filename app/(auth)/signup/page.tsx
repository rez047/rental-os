"use client";
import { useState } from "react";
import { signUp } from "@/lib/actions";
import { useRouter } from "next/navigation";

export default function Signup() {
  const [form, setForm] = useState({ email: "", password: "", fullName: "", orgName: "" });
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await signUp(form.email, form.password, form.fullName, form.orgName);
      router.push("/admin");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6">Create Account</h1>
        {["fullName", "orgName", "email", "password"].map(field => (
          <input
            key={field}
            type={field === "password" ? "password" : field === "email" ? "email" : "text"}
            placeholder={field === "fullName" ? "Full Name" : field === "orgName" ? "Organization Name" : field.charAt(0).toUpperCase() + field.slice(1)}
            value={(form as any)[field]}
            onChange={e => setForm({ ...form, [field]: e.target.value })}
            className="w-full p-3 border rounded-lg mb-3"
            required
          />
        ))}
        <button disabled={loading} className="w-full py-3 bg-indigo-600 text-white rounded-lg font-semibold mt-2">
          {loading ? "Creating..." : "Create Account"}
        </button>
      </form>
    </div>
  );
}