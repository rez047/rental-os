import { createServerSupabase as createClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/lib/actions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("org_members")
    .select("role, organizations(*)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (!membership) redirect("/signup");

  const role = membership.role;
  const org = membership.organizations as any;

  const managerLinks = [
    { label: "Manager Dashboard", href: "/manager" },
    { label: "Properties & Units", href: "/manager?tab=properties" },
    { label: "Tenants", href: "/manager?tab=tenants" },
    { label: "Leases", href: "/manager?tab=leases" },
    { label: "Payments & Invoices", href: "/manager?tab=payments" },
    { label: "Maintenance", href: "/manager?tab=maintenance" },
    { label: "Reports", href: "/manager?tab=reports" },
    { label: "AI Assistant", href: "/manager?tab=ai" }
  ];

  const navItems: Record<string, { label: string; href: string }[]> = {
    owner_admin: [
      { label: "Admin Panel", href: "/admin" },
      { label: "Team", href: "/admin?tab=team" },
      { label: "Billing", href: "/admin?tab=billing" },
      ...managerLinks
    ],
    manager: managerLinks,
    tenant: [
      { label: "Home", href: "/tenants" },
      { label: "My Lease", href: "/tenants?tab=lease" },
      { label: "Payments", href: "/tenants?tab=payments" },
      { label: "Maintenance", href: "/tenants?tab=maintenance" }
    ],
    owner: [
      { label: "Portfolio", href: "/owner" },
      { label: "Statements", href: "/owner?tab=statements" }
    ],
    vendor: [
      { label: "My Jobs", href: "/vendor" },
      { label: "Completed", href: "/vendor?tab=completed" }
    ],
    admin: [{ label: "Admin Panel", href: "/admin" }]
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r p-6">
        <div className="font-bold text-xl mb-2">RentOS</div>
        <div className="text-sm text-gray-500 mb-6">{org.name}</div>
        <nav className="space-y-1">
          {navItems[role]?.map(item => (
            <Link key={item.href} href={item.href}
              className="block px-4 py-2 rounded-lg hover:bg-gray-100 text-sm">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 pt-6 border-t">
          <div className="text-sm mb-1">{user.email}</div>
          <div className="text-xs text-gray-500 mb-3 capitalize">{role.replace("_", " ")}</div>
          <form action={async () => { "use server"; await signOut(); redirect("/login"); }}>
            <button className="text-sm text-red-600">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
