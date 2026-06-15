"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Users, Search, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { api } from "@/lib/api";
import type { Customer } from "@/lib/types";
import { EngagementBadge, formatINR } from "@/components/ai/widgets";
import { Badge } from "@/components/ui/badge";

function daysAgo(iso?: string | null): string {
  if (!iso) return "Never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d === 0 ? "Today" : `${d}d ago`;
}

type SortKey = "name" | "favorite_category" | "order_count" | "lifetime_spend" | "last_order_at" | "engagement_score";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; align: "left" | "right" | "center" }[] = [
  { key: "name", label: "Customer", align: "left" },
  { key: "favorite_category", label: "Category", align: "left" },
  { key: "order_count", label: "Orders", align: "right" },
  { key: "lifetime_spend", label: "Lifetime", align: "right" },
  { key: "last_order_at", label: "Last order", align: "left" },
  { key: "engagement_score", label: "Engagement", align: "center" },
];

function sortValue(c: Customer, key: SortKey): string | number {
  switch (key) {
    case "name": return c.name.toLowerCase();
    case "favorite_category": return (c.favorite_category ?? "").toLowerCase();
    case "order_count": return c.order_count;
    case "lifetime_spend": return c.lifetime_spend;
    case "engagement_score": return c.engagement_score;
    case "last_order_at": return c.last_order_at ? new Date(c.last_order_at).getTime() : 0;
  }
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  // Search server-side (debounced) so it spans ALL customers, not just a loaded page.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .listCustomers({ limit: 200, q: q.trim() || undefined })
        .then((rows) => { if (!cancelled) setCustomers(rows); })
        .catch(console.error)
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  }

  const sorted = useMemo(() => {
    if (!sort) return customers;
    const mult = sort.dir === "asc" ? 1 : -1;
    return [...customers].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * mult;
      return ((va as number) - (vb as number)) * mult;
    });
  }, [customers, sort]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Users className="h-6 w-6 text-primary" /> Customers
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Your shoppers, scored by engagement</p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search customers…"
            className="h-9 rounded-md border bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {COLUMNS.map((col) => {
                const active = sort?.key === col.key;
                const justify =
                  col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start";
                const thAlign =
                  col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "";
                return (
                  <th key={col.key} className={`px-4 py-3 font-medium ${thAlign}`}>
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      title={`Sort by ${col.label}`}
                      className={`inline-flex w-full items-center gap-1 uppercase tracking-wide transition-colors hover:text-foreground ${justify} ${active ? "text-foreground" : ""}`}
                    >
                      {col.label}
                      {active ? (
                        sort!.dir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Loading customers…</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                {q.trim() ? (
                  <>No customers match “{q.trim()}”.</>
                ) : (
                  <>No customers. Seed demo data with <code className="rounded bg-muted px-1">POST /admin/seed</code>.</>
                )}
              </td></tr>
            ) : (
              sorted.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link href={`/customers/${c.id}`} className="font-medium text-foreground hover:text-primary">
                      {c.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{c.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    {c.favorite_category ? <Badge variant="secondary">{c.favorite_category}</Badge> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.order_count}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{formatINR(c.lifetime_spend)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{daysAgo(c.last_order_at)}</td>
                  <td className="px-4 py-3 text-center"><EngagementBadge score={c.engagement_score} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
