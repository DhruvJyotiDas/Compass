"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Compass,
  Sparkles,
  Users,
  Target,
  Send,
  MessagesSquare,
  LineChart,
  ChevronDown,
  LayoutDashboard,
  UserPlus,
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
  Contact2,
  Heart,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Primary experience — AI-powered customer engagement.
const AI_NAV = [
  { href: "/growth", label: "Growth Assistant", icon: Sparkles },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/segments", label: "Segments", icon: Target },
  { href: "/campaigns", label: "Campaigns", icon: Send },
  { href: "/communications", label: "Communications", icon: MessagesSquare },
  { href: "/insights", label: "Analytics & Insights", icon: LineChart },
];

// Secondary — the traditional CRM kept fully intact.
const CRM_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: UserPlus },
  { href: "/contacts", label: "Contacts", icon: Contact2 },
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

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: React.ElementType; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
        active
          ? "ai-gradient text-white shadow-lg shadow-indigo-900/40"
          : "text-sidebar-foreground/65 hover:bg-white/[0.06] hover:text-sidebar-foreground"
      )}
    >
      <Icon className={cn("h-4 w-4 transition-transform", !active && "group-hover:scale-110")} />
      {label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  // CRM section starts collapsed if the user is currently inside the AI experience.
  const inCrm = CRM_NAV.some((n) => isActive(n.href));
  const [crmOpen, setCrmOpen] = useState(inCrm);

  return (
    <aside
      className="hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-white/5 text-sidebar-foreground md:flex"
      style={{
        backgroundImage:
          "radial-gradient(120% 80% at 0% 0%, hsl(245 75% 60% / 0.18), transparent 50%), linear-gradient(180deg, hsl(var(--sidebar)), hsl(224 47% 7%))",
      }}
    >
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="ai-gradient flex h-8 w-8 items-center justify-center rounded-lg shadow-lg shadow-indigo-900/40">
          <Compass className="h-5 w-5 text-white" />
        </div>
        <span className="text-lg font-bold tracking-tight">Compass</span>
        <span className="ml-0.5 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/80">
          AI
        </span>
      </div>

      <nav className="flex-1 px-3 py-2">
        <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
          AI Engagement
        </p>
        <div className="space-y-1">
          {AI_NAV.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} />
          ))}
        </div>

        <button
          onClick={() => setCrmOpen((v) => !v)}
          className="mt-4 flex w-full items-center justify-between px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40 hover:text-sidebar-foreground/70"
        >
          CRM
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", crmOpen ? "" : "-rotate-90")} />
        </button>
        {crmOpen && (
          <div className="space-y-1">
            {CRM_NAV.map((item) => (
              <NavLink key={item.href} {...item} active={isActive(item.href)} />
            ))}
          </div>
        )}
      </nav>

      <div className="mt-auto border-t border-white/5 px-5 py-4">
        <p className="text-[11px] leading-relaxed text-sidebar-foreground/40">
          Compass · AI-native CRM
        </p>
        <p className="mt-1 flex items-center gap-1 text-[11px] text-sidebar-foreground/55">
          Made with <Heart className="h-3 w-3 fill-rose-500 text-rose-500" /> by{" "}
          <span className="font-semibold text-sidebar-foreground/80">Dhruv Jyoti Das</span>
        </p>
      </div>
    </aside>
  );
}
