"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Compass,
  LayoutDashboard,
  UserPlus,
  Users,
  Building2,
  Briefcase,
  CalendarCheck,
  Settings,
  Package,
  FileText,
  ShoppingCart,
  Receipt,
  Truck,
  BookOpen,
  Headphones,
  BarChart2,
  Megaphone,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: UserPlus },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/accounts", label: "Accounts", icon: Building2 },
  { href: "/deals", label: "Deals", icon: Briefcase },
  { href: "/activities", label: "Activities", icon: CalendarCheck },
  { href: "/products", label: "Products", icon: Package },
  { href: "/quotes", label: "Quotes", icon: FileText },
  { href: "/sales-orders", label: "Sales Orders", icon: ShoppingCart },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/purchase-orders", label: "Purchase Orders", icon: Truck },
  { href: "/cases", label: "Cases", icon: Headphones },
  { href: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
  { href: "/reports", label: "Reports", icon: BarChart2 },
  { href: "/marketing", label: "Marketing", icon: Megaphone },
  { href: "/data-tools", label: "Data Tools", icon: Database },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 items-center gap-2 px-5 text-lg font-semibold">
        <Compass className="h-6 w-6 text-primary" />
        Compass
      </div>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-4 text-xs text-sidebar-foreground/40">CRM v2.0 · Phase 7</div>
    </aside>
  );
}
