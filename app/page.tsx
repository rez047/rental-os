import Link from "next/link";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white">
      <nav className="max-w-7xl mx-auto px-6 py-6 flex justify-between">
        <div className="text-2xl font-bold">RentOS</div>
        <div className="flex gap-4">
          <Link href="/login" className="px-4 py-2">Login</Link>
          <Link href="/signup" className="px-4 py-2 bg-indigo-600 text-white rounded-lg">Get Started</Link>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-6 py-20 text-center">
        <h1 className="text-6xl font-bold mb-6">The modern OS for rental management</h1>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Manage properties, tenants, leases, payments, and maintenance — all in one AI-powered platform.
        </p>
        <Link href="/signup" className="px-8 py-4 bg-indigo-600 text-white rounded-xl text-lg font-semibold">
          Start free trial
        </Link>
      </main>
    </div>
  );
}