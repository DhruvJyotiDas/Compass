"use client";

import { useState } from "react";
import { Target, Sparkles, Plus, X, Loader2, Play, Check } from "lucide-react";
import { api } from "@/lib/api";
import type { CompileResponse, SegmentFilter } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProviderPill, formatINR } from "@/components/ai/widgets";

// Allow-listed fields mirror the backend FIELD_REGISTRY — the only safe segment surface.
const FIELDS: Record<string, { label: string; ops: { value: string; label: string }[]; unit: string }> = {
  last_order_at: {
    label: "Last order",
    ops: [
      { value: "days_ago_gt", label: "more than (days ago)" },
      { value: "days_ago_lt", label: "less than (days ago)" },
    ],
    unit: "days",
  },
  lifetime_spend: {
    label: "Lifetime spend",
    ops: [
      { value: "gte", label: "≥" },
      { value: "lte", label: "≤" },
    ],
    unit: "₹",
  },
  order_count: {
    label: "Order count",
    ops: [
      { value: "gte", label: "≥" },
      { value: "lte", label: "≤" },
    ],
    unit: "orders",
  },
};

const DEFAULT_FILTERS: SegmentFilter[] = [{ field: "last_order_at", op: "days_ago_gt", value: 60 }];

export default function SegmentsPage() {
  const [filters, setFilters] = useState<SegmentFilter[]>(DEFAULT_FILTERS);
  const [logic, setLogic] = useState<"AND" | "OR">("AND");
  const [result, setResult] = useState<CompileResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [goal, setGoal] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [provider, setProvider] = useState<string>();
  const [description, setDescription] = useState<string>();

  function update(i: number, patch: Partial<SegmentFilter>) {
    setFilters((f) => f.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function addFilter() {
    setFilters((f) => [...f, { field: "lifetime_spend", op: "gte", value: 10000 }]);
  }
  function removeFilter(i: number) {
    setFilters((f) => f.filter((_, idx) => idx !== i));
  }

  async function compile() {
    setLoading(true);
    try {
      setResult(await api.compileSegment(filters.map((f) => ({ ...f, value: Number(f.value) })), logic));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function generate() {
    if (!goal.trim()) return;
    setAiLoading(true);
    try {
      const r = await api.generateSegment(goal.trim());
      setFilters(r.dsl.filters);
      setLogic((r.dsl.logic as "AND" | "OR") || "AND");
      setProvider(r.provider);
      setDescription(r.audience_description);
      setResult({ count: r.count, sql_preview: r.sql_preview, sample: r.sample });
    } catch (e) {
      console.error(e);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Target className="h-6 w-6 text-primary" /> Segments
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Build an audience manually, or describe it and let AI compile it</p>
        </div>
        <Button variant={aiOpen ? "secondary" : "default"} onClick={() => setAiOpen((v) => !v)}>
          <Sparkles /> Generate with AI
        </Button>
      </div>

      {aiOpen && (
        <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-transparent p-4">
          <label className="text-sm font-medium">Describe the audience</label>
          <div className="mt-2 flex gap-2">
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generate()}
              placeholder="e.g. Loyal customers who are becoming inactive"
              className="h-9 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <Button onClick={generate} disabled={aiLoading || !goal.trim()}>
              {aiLoading ? <Loader2 className="animate-spin" /> : <Sparkles />} Generate
            </Button>
          </div>
          {description && (
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Check className="h-4 w-4 text-emerald-500" /> {description} {provider && <ProviderPill provider={provider} />}
            </p>
          )}
        </div>
      )}

      {/* Filter builder */}
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold">Filters</h2>
          <select
            value={logic}
            onChange={(e) => setLogic(e.target.value as "AND" | "OR")}
            className="h-7 rounded border bg-background px-2 text-xs"
          >
            <option value="AND">Match ALL (AND)</option>
            <option value="OR">Match ANY (OR)</option>
          </select>
        </div>
        <div className="space-y-2">
          {filters.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={f.field}
                onChange={(e) => {
                  const field = e.target.value;
                  update(i, { field, op: FIELDS[field].ops[0].value });
                }}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                {Object.entries(FIELDS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <select
                value={f.op}
                onChange={(e) => update(i, { op: e.target.value })}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                {FIELDS[f.field].ops.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input
                type="number"
                value={f.value}
                onChange={(e) => update(i, { value: e.target.value })}
                className="h-9 w-32 rounded-md border bg-background px-2 text-sm"
              />
              <span className="w-14 text-xs text-muted-foreground">{FIELDS[f.field].unit}</span>
              <button onClick={() => removeFilter(i)} className="text-muted-foreground hover:text-destructive">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={addFilter}><Plus /> Add filter</Button>
          <Button size="sm" onClick={compile} disabled={loading || filters.length === 0}>
            {loading ? <Loader2 className="animate-spin" /> : <Play />} Preview audience
          </Button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold">{result.count.toLocaleString()}</span>
            <span className="text-sm text-muted-foreground">customers match</span>
          </div>
          <code className="block overflow-x-auto rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            {result.sql_preview}
          </code>
          <div className="rounded-xl border bg-card">
            <h3 className="border-b px-4 py-3 text-sm font-semibold">Sample matches & reasoning</h3>
            <div className="divide-y">
              {result.sample.map((s) => (
                <div key={s.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-sm text-muted-foreground">{formatINR(s.lifetime_spend)} · {s.order_count} orders</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.match_trace.map((t, i) => (
                      <Badge key={i} variant={t.matched ? "success" : "secondary"}>
                        {t.field} {t.op} {String(t.value)} → {String(t.actual)}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
