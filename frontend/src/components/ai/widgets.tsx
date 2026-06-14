"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Cpu, Sparkles } from "lucide-react";

export function formatINR(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

/** Engagement score 0–100 → colored chip. */
export function EngagementBadge({ score }: { score: number }) {
  const variant = score >= 66 ? "success" : score >= 33 ? "warning" : "danger";
  return <Badge variant={variant}>{score}</Badge>;
}

const CHURN_VARIANT: Record<string, "success" | "warning" | "danger"> = {
  low: "success",
  medium: "warning",
  high: "danger",
};

export function ChurnBadge({ risk }: { risk: string }) {
  return <Badge variant={CHURN_VARIANT[risk] ?? "secondary"}>{risk} risk</Badge>;
}

/** Shows which provider produced an AI response — never let mock pass as real. */
export function ProviderPill({ provider }: { provider?: string }) {
  const isMock = provider === "mock" || provider === "fallback";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        isMock ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
      )}
      title={isMock ? "Deterministic offline mock — no LLM endpoint configured" : "Live model inference"}
    >
      {isMock ? <Cpu className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
      {isMock ? "Mock" : provider || "AI"}
    </span>
  );
}

export function StatTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

const FUNNEL_STEPS: { key: string; label: string; color: string }[] = [
  { key: "sent", label: "Sent", color: "bg-indigo-500" },
  { key: "delivered", label: "Delivered", color: "bg-sky-500" },
  { key: "opened", label: "Opened", color: "bg-cyan-500" },
  { key: "clicked", label: "Clicked", color: "bg-emerald-500" },
  { key: "converted", label: "Purchased", color: "bg-amber-500" },
];

/** CSS conversion funnel — bar width proportional to the top of the funnel. */
export function ConversionFunnel({ stats }: { stats: Record<string, number> }) {
  const top = Math.max(stats.sent ?? 0, 1);
  return (
    <div className="space-y-2">
      {FUNNEL_STEPS.map((s) => {
        const val = stats[s.key] ?? 0;
        const pct = Math.round((val / top) * 100);
        const conv = top ? Math.round((val / top) * 100) : 0;
        return (
          <div key={s.key} className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">{s.label}</span>
            <div className="h-7 flex-1 overflow-hidden rounded bg-muted">
              <div
                className={cn("flex h-full items-center justify-end px-2 text-xs font-semibold text-white transition-all", s.color)}
                style={{ width: `${Math.max(pct, val > 0 ? 8 : 0)}%` }}
              >
                {val > 0 ? val.toLocaleString() : ""}
              </div>
            </div>
            <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">{conv}%</span>
          </div>
        );
      })}
    </div>
  );
}
