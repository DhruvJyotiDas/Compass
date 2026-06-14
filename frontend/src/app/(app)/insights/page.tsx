"use client";

import { useEffect, useState } from "react";
import { LineChart, Cpu, Sparkles, Clock } from "lucide-react";
import { api } from "@/lib/api";
import type { AiCampaign, AiMeta, AiRun, CampaignStats } from "@/lib/types";
import { ConversionFunnel, StatTile } from "@/components/ai/widgets";
import { Badge } from "@/components/ui/badge";

export default function InsightsPage() {
  const [meta, setMeta] = useState<AiMeta | null>(null);
  const [campaigns, setCampaigns] = useState<AiCampaign[]>([]);
  const [selected, setSelected] = useState<AiCampaign | null>(null);
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [runs, setRuns] = useState<AiRun[]>([]);

  useEffect(() => {
    api.aiMeta().then(setMeta).catch(() => {});
    api.listAiCampaigns().then((cs) => {
      setCampaigns(cs);
      const launched = cs.find((c) => c.status !== "draft") || cs[0] || null;
      setSelected(launched);
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    if (selected.status !== "draft") api.campaignStats(selected.id).then(setStats).catch(() => setStats(null));
    else setStats(null);
    if (selected.pipeline_id) api.pipelineRuns(selected.pipeline_id).then(setRuns).catch(() => setRuns([]));
  }, [selected]);

  const isMock = meta?.provider?.toLowerCase().includes("mock");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <LineChart className="h-6 w-6 text-primary" /> Analytics & Insights
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Campaign funnels and the AI decision trail</p>
      </div>

      {/* AI provider meta */}
      {meta && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-xl border bg-card p-4">
            <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
              {isMock ? <Cpu className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />} Provider
            </p>
            <p className="mt-1 text-sm font-bold">{meta.provider}</p>
            <p className="text-xs text-muted-foreground">{meta.model}</p>
          </div>
          <StatTile label="AI Calls" value={meta.total_ai_calls} />
          <StatTile label="Cache Hit Rate" value={`${meta.cache_hit_rate_pct}%`} />
          <StatTile label="Tokens Saved" value={meta.tokens_saved.toLocaleString()} />
        </div>
      )}

      {/* Campaign selector */}
      <div className="flex items-center gap-2">
        <select
          value={selected?.id || ""}
          onChange={(e) => setSelected(campaigns.find((c) => c.id === e.target.value) || null)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          {campaigns.length === 0 && <option value="">No campaigns</option>}
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name || "Untitled"} ({c.status})</option>)}
        </select>
      </div>

      {selected && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Conversion Funnel</h2>
            {stats ? (
              <ConversionFunnel stats={stats as unknown as Record<string, number>} />
            ) : (
              <p className="text-sm text-muted-foreground">No execution data — launch the campaign to populate the funnel.</p>
            )}
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4 text-primary" /> AI Decision History</h2>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No AI runs recorded for this campaign.</p>
            ) : (
              <div className="space-y-2">
                {runs.map((r, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                    <span className="font-medium">{r.step}</span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{r.latency_ms}ms</span>
                      <Badge variant={r.valid ? "success" : "warning"}>{r.valid ? "valid" : "fallback"}</Badge>
                      <span className="font-mono">{r.model}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
