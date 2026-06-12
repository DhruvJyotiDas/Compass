"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "./index";

const SCREENS = [
  { id: "command",   label: "Command Center", href: "/" },
  { id: "segment",   label: "Segment & Plan",  href: "/segment" },
  { id: "dashboard", label: "Live Dashboard",  href: "/dashboard" },
  { id: "chaos",     label: "Chaos",           href: "/chaos" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [cacheRate, setCacheRate] = useState<number | null>(null);

  useEffect(() => {
    const load = () => api.meta().then(m => setCacheRate(m.cache_hit_rate_pct)).catch(() => {});
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);

  const activeId = pathname === "/" ? "command"
    : pathname.startsWith("/segment") ? "segment"
    : pathname.startsWith("/dashboard") ? "dashboard"
    : pathname.startsWith("/chaos") ? "chaos"
    : "command";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)" }}>
      {/* Top bar */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50, height: 56,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 22px",
        background: "var(--bg-panel)", borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <span style={{ color: "var(--accent)", display: "inline-flex" }}><Icon.compass /></span>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>Compass</span>
            <span className="ml" style={{ color: "var(--fg-faint)" }}>by Xeno</span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{
          display: "flex", gap: 3,
          background: "var(--bg-inset)", border: "1px solid var(--border)",
          borderRadius: 9, padding: 3,
        }}>
          {SCREENS.map((s, i) => {
            const active = activeId === s.id;
            return (
              <Link key={s.id} href={s.href} style={{ textDecoration: "none" }}>
                <button
                  className="focusable"
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    cursor: "pointer", border: "none",
                    background: active ? "var(--bg-raise)" : "transparent",
                    color: active ? "var(--fg)" : "var(--fg-muted)",
                    borderRadius: 6, padding: "6px 13px",
                    fontSize: 13, fontWeight: 500, fontFamily: "var(--sans)",
                    boxShadow: active ? "inset 0 0 0 1px var(--border)" : "none",
                    transition: "all .14s",
                  }}
                >
                  <span className="mono" style={{ fontSize: 10.5, color: active ? "var(--accent)" : "var(--fg-faint)" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {s.label}
                </button>
              </Link>
            );
          })}
        </nav>

        {/* Powered-by */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--fg-muted)" }}>
          <span className="live-dot" style={{ width: 7, height: 7, borderRadius: 999, background: "var(--green)" }} />
          <span style={{ color: "var(--fg)" }}>claude-sonnet-4-6</span>
          {cacheRate !== null && cacheRate > 0 && (
            <span style={{ color: "var(--accent)" }} title="Prompt cache hit rate">· {cacheRate.toFixed(0)}% cache</span>
          )}
          <span style={{ color: "var(--fg-faint)" }}>· Anthropic API</span>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
