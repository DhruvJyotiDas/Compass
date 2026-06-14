"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Users, Search } from "lucide-react";
import { api } from "@/lib/api";
import type { Customer } from "@/lib/types";
import { EngagementBadge, formatINR } from "@/components/ai/widgets";
import { Badge } from "@/components/ui/badge";

function daysAgo(iso?: string | null): string {
  if (!iso) return "Never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d === 0 ? "Today" : `${d}d ago`;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.listCustomers({ limit: 200 }).then(setCustomers).catch(console.error).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const t = q.toLowerCase();
    return customers.filter((c) => c.name.toLowerCase().includes(t) || (c.email ?? "").toLowerCase().includes(t));
  }, [customers, q]);

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
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 text-right font-medium">Orders</th>
              <th className="px-4 py-3 text-right font-medium">Lifetime</th>
              <th className="px-4 py-3 font-medium">Last order</th>
              <th className="px-4 py-3 text-center font-medium">Engagement</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Loading customers…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                No customers. Seed demo data with <code className="rounded bg-muted px-1">POST /admin/seed</code>.
              </td></tr>
            ) : (
              filtered.map((c) => (
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
