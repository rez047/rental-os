import { createServerSupabase as createClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import DashboardSidebar from "@/components/DashboardSidebar";

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
    { label: "Messages", href: "/manager?tab=messages" },
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
      { label: "Maintenance", href: "/tenants?tab=maintenance" },
      { label: "Messages", href: "/tenants?tab=messages" }
    ],
    owner: [
      { label: "Portfolio", href: "/owner" },
      { label: "Statements", href: "/owner?tab=statements" },
      { label: "Messages", href: "/owner?tab=messages" }
    ],
    vendor: [
      { label: "My Jobs", href: "/vendor" },
      { label: "Completed", href: "/vendor?tab=completed" },
      { label: "Messages", href: "/vendor?tab=messages" }
    ],
    admin: [{ label: "Admin Panel", href: "/admin" }]
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <DashboardSidebar
        role={role}
        orgName={org.name}
        userEmail={user.email}
        navItems={navItems[role] || []}
      />
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
