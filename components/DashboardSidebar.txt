"use client";
import { useState } from "react";
import Link from "next/link";
import { signOut } from "@/lib/actions";
import { redirect } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
}

interface DashboardSidebarProps {
  role: string;
  orgName: string;
  userEmail: string;
  navItems: NavItem[];
}

export default function DashboardSidebar({ role, orgName, userEmail, navItems }: DashboardSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [side, setSide] = useState<"left" | "right">("left");

  const toggleCollapse = () => setCollapsed(!collapsed);
  const toggleSide = () => setSide(side === "left" ? "right" : "left");

  return (
    <aside
      className={`${
        collapsed ? "w-16" : "w-64"
      } ${
        side === "right" ? "order-last border-l" : "order-first border-r"
      } bg-white p-4 transition-all duration-300 ease-in-out relative`}
    >
      {/* Toggle Buttons */}
      <div className={`flex ${collapsed ? "flex-col" : "justify-between"} items-center mb-4`}>
        <button
          onClick={toggleCollapse}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-5 w-5 transition-transform ${collapsed && side === "right" ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        
        {!collapsed && (
          <button
            onClick={toggleSide}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title={`Move to ${side === "left" ? "right" : "left"} side`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-5 w-5 ${side === "right" ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </button>
        )}
      </div>

      {/* Logo */}
      <div className={`font-bold text-xl mb-2 ${collapsed ? "text-center" : ""}`}>
        {collapsed ? "R" : "RentOS"}
      </div>
      
      {!collapsed && (
        <div className="text-sm text-gray-500 mb-6">{orgName}</div>
      )}

      {/* Navigation */}
      <nav className="space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`block ${
              collapsed ? "px-2 py-2 text-center" : "px-4 py-2"
            } rounded-lg hover:bg-gray-100 text-sm transition-colors`}
            title={collapsed ? item.label : undefined}
          >
            {collapsed ? item.label.charAt(0) : item.label}
          </Link>
        ))}
      </nav>

      {/* User Info & Sign Out */}
      <div className={`mt-8 pt-6 border-t ${collapsed ? "text-center" : ""}`}>
        {!collapsed ? (
          <>
            <div className="text-sm mb-1 truncate">{userEmail}</div>
            <div className="text-xs text-gray-500 mb-3 capitalize">
              {role.replace("_", " ")}
            </div>
          </>
        ) : (
          <div className="text-xs text-gray-500 mb-3">
            {role.charAt(0).toUpperCase()}
          </div>
        )}
        
        <form
          action={async () => {
            "use server";
            await signOut();
            redirect("/login");
          }}
        >
          <button
            className={`text-sm text-red-600 ${collapsed ? "text-xs" : ""}`}
            title={collapsed ? "Sign out" : undefined}
          >
            {collapsed ? "⎋" : "Sign out"}
          </button>
        </form>
      </div>
    </aside>
  );
}
