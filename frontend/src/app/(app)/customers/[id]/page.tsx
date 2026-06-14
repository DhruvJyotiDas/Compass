"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles, Loader2, Lightbulb } from "lucide-react";
import { api } from "@/lib/api";
import type { CustomerCard, CustomerDetail } from "@/lib/types";
import { ChurnBadge, EngagementBadge, ProviderPill, StatTile, formatINR } from "@/components/ai/widgets";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [cust, setCust] = useState<CustomerDetail | null>(null);
  const [card, setCard] = useState<CustomerCard | null>(null);
  const [cardLoading, setCardLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.getCustomer(id).then(setCust).catch(console.error);
    api.customerAiCard(id).then(setCard).catch(console.error).finally(() => setCardLoading(false));
  }, [id]);

  if (!cust) return <div className="py-10 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Customers
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{cust.name}</h1>
          <p className="text-sm text-muted-foreground">{cust.email} · {cust.phone}</p>
          {cust.favorite_category && <Badge variant="secondary" className="mt-2">{cust.favorite_category}</Badge>}
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Engagement</p>
          <div className="mt-1"><EngagementBadge score={cust.engagement_score} /></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Lifetime Value" value={formatINR(cust.lifetime_spend)} />
        <StatTile label="Orders" value={cust.order_count} />
        <StatTile label="Last Purchase" value={cust.days_since_last != null ? `${cust.days_since_last}d ago` : "Never"} />
        <StatTile label="Engagement" value={cust.engagement_score} sub="0–100 RFM" />
      </div>

      {/* AI Customer Card */}
      <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-transparent p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" /> AI Customer Card
          </h2>
          {card && <div className="flex items-center gap-2"><ChurnBadge risk={card.churn_risk} /><ProviderPill provider={card.provider} /></div>}
        </div>
        {cardLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Generating intelligence…
          </div>
        ) : card ? (
          <>
            <p className="text-sm leading-relaxed text-foreground">{card.summary}</p>
            <div className="mt-4 space-y-2">
              {card.suggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border bg-card p-3">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <div>
                    <p className="text-sm font-medium">{s.label}</p>
                    <p className="text-xs text-muted-foreground">{s.rationale}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Could not generate the AI card.</p>
        )}
      </div>

      {/* Recent orders */}
      <div className="rounded-xl border bg-card">
        <h2 className="border-b px-5 py-3 text-sm font-semibold">Recent Orders</h2>
        {cust.recent_orders.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">No orders yet.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {cust.recent_orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-5 py-2.5 font-mono text-xs text-muted-foreground">{o.external_id}</td>
                  <td className="px-5 py-2.5">{new Date(o.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-2.5"><Badge variant="secondary">{o.status}</Badge></td>
                  <td className="px-5 py-2.5 text-right font-medium tabular-nums">{formatINR(o.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
