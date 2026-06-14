"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Sparkles, Loader2, Rocket, Save, Wand2, Target, MessageSquare,
  TrendingUp, Lightbulb, ArrowRight, Users,
} from "lucide-react";
import { api } from "@/lib/api";
import type { AiCampaign, AiInsights, CampaignStats, MessageVariant } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConversionFunnel, ProviderPill } from "@/components/ai/widgets";

const STATUS_VARIANT: Record<string, "secondary" | "info" | "warning" | "success"> = {
  draft: "secondary", approved: "info", running: "warning", completed: "success",
};

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [c, setC] = useState<AiCampaign | null>(null);
  const [name, setName] = useState("");
  const [messages, setMessages] = useState<MessageVariant[]>([]);
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [insights, setInsights] = useState<AiInsights | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isDraft = c?.status === "draft";

  const load = useCallback(async () => {
    if (!id) return;
    const data = await api.getAiCampaign(id);
    setC(data);
    setName(data.name || "");
    setMessages(data.message_variants || []);
    setInsights(data.insights || null);
    if (data.status !== "draft") setStats(await api.campaignStats(id).catch(() => null));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Live funnel polling while the campaign is dispatching.
  useEffect(() => {
    if (c && (c.status === "approved" || c.status === "running")) {
      pollRef.current = setInterval(() => {
        api.campaignStats(c.id).then(setStats).catch(() => {});
      }, 3000);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
  }, [c]);

  async function save() {
    if (!c) return;
    setBusy("save");
    try {
      await api.updateAiCampaign(c.id, { name, message_variants: messages });
      await load();
    } finally { setBusy(null); }
  }

  async function improve() {
    if (!c) return;
    setBusy("improve");
    try {
      const r = await api.improveCopy(c.id);
      setMessages(r.variants || []);
    } finally { setBusy(null); }
  }

  async function approve() {
    if (!c) return;
    setBusy("approve");
    try {
      await api.updateAiCampaign(c.id, { name, message_variants: messages }).catch(() => {});
      await api.approveAiCampaign(c.id);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Approve failed");
    } finally { setBusy(null); }
  }

  async function genInsights() {
    if (!c) return;
    setBusy("insights");
    try { setInsights(await api.campaignInsights(c.id)); await load(); }
    finally { setBusy(null); }
  }

  async function generateNext() {
    if (!insights) return;
    setBusy("next");
    try {
      const r = await api.runPipeline(insights.next_goal);
      router.push(`/campaigns/${r.campaign_id}`);
    } finally { setBusy(null); }
  }

  if (!c) return <div className="py-10 text-center text-muted-foreground">Loading…</div>;

  const filters = c.segment_dsl?.filters || [];
  const planVariants = (c.plan?.variants as { variant_id: string; channel: string; split_pct: number }[]) || [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/campaigns" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Campaigns
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          {isDraft ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-transparent text-2xl font-bold outline-none"
            />
          ) : (
            <h1 className="text-2xl font-bold">{c.name}</h1>
          )}
          <p className="mt-1 text-sm text-muted-foreground">{c.goal_text}</p>
        </div>
        <Badge variant={STATUS_VARIANT[c.status] ?? "secondary"}>{c.status}</Badge>
      </div>

      {/* Audience */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4 text-primary" /> Audience</h2>
        {c.segment_dsl?.audience_description && (
          <p className="mb-2 text-sm text-muted-foreground">{c.segment_dsl.audience_description}</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f, i) => (
            <Badge key={i} variant="secondary">{f.field} {f.op} {String(f.value)}</Badge>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
          {c.audience_count != null && <span className="flex items-center gap-1"><Users className="h-4 w-4" /> {c.audience_count.toLocaleString()} recipients</span>}
          {isDraft && <Link href="/segments" className="text-primary hover:underline">Refine in Segments →</Link>}
        </div>
      </section>

      {/* Plan */}
      {planVariants.length > 0 && (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Campaign Plan</h2>
          <div className="flex flex-wrap gap-2">
            {planVariants.map((v) => (
              <div key={v.variant_id} className="rounded-lg border px-3 py-2 text-sm">
                <span className="font-medium">Variant {v.variant_id}</span> · {v.channel} · {v.split_pct}%
              </div>
            ))}
          </div>
          {typeof c.plan?.rationale === "string" && (
            <p className="mt-2 text-xs text-muted-foreground">{c.plan.rationale as string}</p>
          )}
        </section>
      )}

      {/* Messages */}
      <section className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><MessageSquare className="h-4 w-4 text-primary" /> Messages</h2>
          {isDraft && (
            <Button size="sm" variant="outline" onClick={improve} disabled={busy === "improve"}>
              {busy === "improve" ? <Loader2 className="animate-spin" /> : <Wand2 />} Improve with AI
            </Button>
          )}
        </div>
        <div className="space-y-3">
          {messages.map((m, i) => (
            <div key={i} className="rounded-lg border p-3">
              <div className="mb-2 flex items-center gap-2 text-xs">
                <Badge variant="info">Variant {m.variant_id}</Badge>
                <Badge variant="secondary">{m.channel}</Badge>
              </div>
              {m.channel === "email" && (
                <input
                  value={m.subject || ""}
                  onChange={(e) => setMessages((p) => p.map((x, idx) => idx === i ? { ...x, subject: e.target.value } : x))}
                  readOnly={!isDraft}
                  placeholder="Subject"
                  className="mb-2 w-full rounded border bg-background px-2 py-1.5 text-sm font-medium outline-none"
                />
              )}
              <textarea
                value={m.body}
                onChange={(e) => setMessages((p) => p.map((x, idx) => idx === i ? { ...x, body: e.target.value } : x))}
                readOnly={!isDraft}
                rows={m.channel === "email" ? 5 : 3}
                className="w-full resize-none rounded border bg-background px-2 py-1.5 text-sm outline-none"
              />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Tokens: {"{{first_name}}"}, {"{{last_order}}"}, {"{{discount}}"}, {"{{expiry}}"}, {"{{brand_name}}"}
        </p>
      </section>

      {/* Draft actions */}
      {isDraft && (
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={save} disabled={busy === "save"}>
            {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />} Save draft
          </Button>
          <Button onClick={approve} disabled={busy === "approve"}>
            {busy === "approve" ? <Loader2 className="animate-spin" /> : <Rocket />} Approve & Launch
          </Button>
        </div>
      )}

      {/* Live funnel */}
      {!isDraft && stats && (
        <section className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-primary" /> Live Funnel</h2>
            <Link href="/communications" className="text-xs text-primary hover:underline">Execution monitor →</Link>
          </div>
          <ConversionFunnel stats={stats as unknown as Record<string, number>} />
          {stats.failed > 0 && <p className="mt-2 text-xs text-red-500">{stats.failed} failed · {stats.dlq_count} in dead-letter queue</p>}
        </section>
      )}

      {/* Insights loop */}
      {!isDraft && (
        <section className="rounded-xl border bg-gradient-to-br from-primary/5 to-transparent p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> AI Insights</h2>
            {!insights && (
              <Button size="sm" onClick={genInsights} disabled={busy === "insights"}>
                {busy === "insights" ? <Loader2 className="animate-spin" /> : <Sparkles />} Analyze results
              </Button>
            )}
          </div>
          {insights ? (
            <div className="space-y-3">
              <ul className="space-y-1.5">
                {insights.findings.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> {f}
                  </li>
                ))}
              </ul>
              <div className="rounded-lg border bg-card p-3 text-sm">
                <p className="font-medium">Recommended next action</p>
                <p className="text-muted-foreground">{insights.next_action}</p>
              </div>
              <div className="flex items-center justify-between rounded-lg border bg-card p-3">
                <div className="text-sm">
                  <p className="font-medium">Next campaign</p>
                  <p className="text-muted-foreground">{insights.next_goal}</p>
                </div>
                <Button size="sm" onClick={generateNext} disabled={busy === "next"}>
                  {busy === "next" ? <Loader2 className="animate-spin" /> : <ArrowRight />} Generate Next Campaign
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Analyze the campaign to close the learning loop.</p>
          )}
        </section>
      )}
    </div>
  );
}
