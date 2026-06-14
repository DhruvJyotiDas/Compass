"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight, Check, Loader2, CircleDashed } from "lucide-react";
import { api } from "@/lib/api";
import type { AiMeta, PipelineResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ProviderPill } from "@/components/ai/widgets";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "Win back premium customers who haven't ordered in 90 days",
  "Increase repeat purchases from recent one-time buyers",
  "Reward our top 5% lifetime spenders with a VIP offer",
  "Re-engage customers who lapsed over the last 60 days",
];

// Display timeline — maps the 4 backend steps onto a human reasoning narrative.
const TIMELINE: { key: string; label: string }[] = [
  { key: "intent", label: "Understanding the objective" },
  { key: "analyze", label: "Analyzing customer behavior" },
  { key: "segment_dsl", label: "Finding the right audience" },
  { key: "campaign_plan", label: "Designing the campaign" },
  { key: "message_copy", label: "Generating personalized messages" },
];

type StepState = "pending" | "running" | "done";

export default function GrowthAssistantPage() {
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, StepState>>({});
  const [provider, setProvider] = useState<string>();
  const [meta, setMeta] = useState<AiMeta | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    api.aiMeta().then(setMeta).catch(() => {});
    return () => timers.current.forEach(clearTimeout);
  }, []);

  // Deep-link from the Quick Demo tour: /growth?goal=...&run=1
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get("goal");
    if (g) {
      setGoal(g);
      if (params.get("run") === "1") setTimeout(() => run(g), 350);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(goalArg?: string) {
    const g = (goalArg ?? goal).trim();
    if (!g || running) return;
    setGoal(g);
    setRunning(true);
    setError(null);
    setStates({ intent: "running" });

    // Animate the narrative while the (synchronous) pipeline runs server-side.
    const order = TIMELINE.map((t) => t.key);
    order.forEach((key, i) => {
      timers.current.push(
        setTimeout(() => {
          setStates((prev) => ({
            ...prev,
            [key]: "running",
            ...(i > 0 ? { [order[i - 1]]: "done" } : {}),
          }));
        }, i * 700)
      );
    });

    try {
      const result: PipelineResult = await api.runPipeline(g);
      const prov = result.steps?.intent?.meta?.provider;
      setProvider(prov);
      // Settle the timeline complete, then jump to the editable artifact.
      setStates(Object.fromEntries(TIMELINE.map((t) => [t.key, "done"])));
      timers.current.push(
        setTimeout(() => router.push(`/campaigns/${result.campaign_id}`), 600)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pipeline failed");
      setRunning(false);
      setStates({});
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-6 animate-fade-in-up">
      <div className="text-center">
        <div className="ai-gradient mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg shadow-indigo-500/30">
          <Sparkles className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight">
          <span className="gradient-text">Growth</span> Assistant
        </h1>
        <p className="mt-2 text-muted-foreground">
          Describe a business outcome. The AI analyzes your customers and builds the audience,
          campaign and messages — you review and launch.
        </p>
        {meta && (
          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ProviderPill provider={meta.provider === "Mock (offline)" ? "mock" : "qwen"} />
            <span>{meta.model}</span>
          </div>
        )}
      </div>

      <div className="ai-surface rounded-2xl border p-4 shadow-sm ring-1 ring-primary/5">
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
          }}
          disabled={running}
          rows={3}
          placeholder="e.g. Increase repeat purchases from inactive premium customers"
          className="w-full resize-none bg-transparent text-lg outline-none placeholder:text-muted-foreground/60 disabled:opacity-60"
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">⌘/Ctrl + Enter to run</span>
          <Button onClick={() => run()} disabled={!goal.trim() || running}>
            {running ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {running ? "Thinking…" : "Build campaign"}
            {!running && <ArrowRight />}
          </Button>
        </div>
      </div>

      {!running && (
        <div className="flex flex-wrap justify-center gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setGoal(ex)}
              className="rounded-full border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {running && (
        <div className="rounded-2xl border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">AI reasoning</h2>
            {provider && <ProviderPill provider={provider} />}
          </div>
          <ol className="space-y-3">
            {TIMELINE.map((t) => {
              const st = states[t.key] ?? "pending";
              return (
                <li key={t.key} className="flex items-center gap-3">
                  {st === "done" ? (
                    <Check className="h-5 w-5 text-emerald-500" />
                  ) : st === "running" ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ) : (
                    <CircleDashed className="h-5 w-5 text-muted-foreground/40" />
                  )}
                  <span
                    className={cn(
                      "text-sm",
                      st === "pending" ? "text-muted-foreground/50" : "text-foreground"
                    )}
                  >
                    {t.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
