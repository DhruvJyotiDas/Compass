"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Sparkles, ArrowRight, Check, Loader2, CircleDashed, ArrowUpRight,
  Mail, MessageSquare, Send, UserPlus, AlertCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import type { AiMeta } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ProviderPill } from "@/components/ai/widgets";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "Who are my most valuable customers?",
  "How many sneaker buyers can I reach?",
  "What's a good win-back strategy for lapsed customers?",
  "Build a win-back campaign for lapsed VIP customers",
];

function channelIcon(channel: string) {
  return channel === "email" ? <Mail className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />;
}

const RISK_COLOR: Record<string, string> = {
  low: "text-emerald-600 bg-emerald-500/10",
  medium: "text-amber-600 bg-amber-500/10",
  high: "text-red-600 bg-red-500/10",
};

// The 4 real campaign-pipeline steps (only shown when the user asks to build a campaign).
const TIMELINE: { key: string; label: string }[] = [
  { key: "intent", label: "Understanding the objective" },
  { key: "segment_dsl", label: "Finding the right audience" },
  { key: "campaign_plan", label: "Designing the campaign" },
  { key: "message_copy", label: "Generating personalized messages" },
];
const ORDER = TIMELINE.map((t) => t.key);

type StepState = "pending" | "running" | "done";

type Customer = {
  name: string;
  email: string | null;
  lifetime_spend: number;
  order_count: number;
  favorite_category: string | null;
  engagement_score: number;
};

type HistoryItem = {
  channel: string;
  subject: string | null;
  message: string;
  status: string;
  created_at: string | null;
  campaign_name: string | null;
};

type ProfileData = {
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    favorite_category: string | null;
    order_count: number;
    lifetime_spend: number;
    engagement_score: number;
    days_since_last: number | null;
    opted_out: boolean;
  };
  card: { summary: string; churn_risk: string; suggestions: { label: string; rationale: string }[] };
  draft: { channel: string; subject: string | null; body: string };
};

type Msg = {
  role: "user" | "assistant";
  text: string;
  mode?: "answer" | "campaign" | "list" | "history" | "add_customer" | "profile";
  states?: Record<string, StepState>;
  latencies?: Record<string, number>;
  campaignId?: string;
  campaignName?: string;
  customers?: Customer[];
  listCount?: number;
  unsupported?: boolean;
  // history
  historyItems?: HistoryItem[];
  historyCustomer?: string | null;
  // add_customer
  addedCustomer?: { id: string; name: string; email: string | null; phone: string | null };
  // profile + draft
  profile?: ProfileData;
  notFound?: boolean;
  done?: boolean;
  error?: string;
};

// Editable personalized draft with a one-click Send (goes through /customers/{id}/message → outbox).
function DraftCard({ profile }: { profile: ProfileData }) {
  const optedOut = profile.customer.opted_out;
  const [channel, setChannel] = useState(profile.draft.channel || "email");
  const [subject, setSubject] = useState(profile.draft.subject ?? "");
  const [body, setBody] = useState(profile.draft.body ?? "");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState("");

  async function sendIt() {
    if (!body.trim()) return;
    setStatus("sending");
    setErr("");
    try {
      await api.sendDirectMessage(profile.customer.id, {
        channel,
        subject: channel === "email" ? subject : undefined,
        body,
      });
      setStatus("sent");
    } catch (e) {
      setStatus("error");
      setErr(e instanceof Error ? e.message : "Failed to send");
    }
  }

  return (
    <div className="rounded-xl border bg-background p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" /> Suggested message
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          disabled={status === "sent"}
          className="ml-auto rounded-md border bg-background px-2 py-1 text-xs"
        >
          <option value="email">Email</option>
          <option value="sms">SMS</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
      </div>

      {channel === "email" && (
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={status === "sent"}
          placeholder="Subject"
          className="mb-2 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary/40"
        />
      )}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={status === "sent"}
        rows={6}
        className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary/40"
      />

      <div className="mt-2 flex items-center gap-2">
        {status === "sent" ? (
          <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
            <Check className="h-4 w-4" /> Sent to {profile.customer.name}
          </span>
        ) : (
          <Button size="sm" onClick={sendIt} disabled={optedOut || status === "sending" || !body.trim()}>
            {status === "sending" ? <Loader2 className="animate-spin" /> : <Send />}
            Send {channel === "email" ? "email" : channel === "sms" ? "SMS" : "WhatsApp"}
          </Button>
        )}
        {optedOut && <span className="text-xs text-muted-foreground">This customer has opted out.</span>}
        {status === "error" && <span className="text-xs text-destructive">{err}</span>}
      </div>
    </div>
  );
}

export default function GrowthAssistantPage() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [meta, setMeta] = useState<AiMeta | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api.aiMeta().then(setMeta).catch(() => {});
    return () => esRef.current?.close();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Deep-link from the Quick Demo tour: /growth?goal=...&run=1
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get("goal");
    if (g && params.get("run") === "1") setTimeout(() => send(g), 350);
    else if (g) setInput(g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Patch the most recent assistant message in place (it's the one currently streaming).
  function patchLast(patch: Partial<Msg> | ((m: Msg) => Partial<Msg>)) {
    setMessages((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === "assistant") {
          next[i] = { ...next[i], ...(typeof patch === "function" ? patch(next[i]) : patch) };
          break;
        }
      }
      return next;
    });
  }

  function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || busy) return;
    esRef.current?.close();
    setInput("");
    setBusy(true);

    // Recent turns for multi-turn context (so it remembers a campaign it's mid-way through setting up).
    const history = messages.slice(-6).map((mm) => ({
      role: mm.role,
      content:
        mm.text ||
        (mm.mode === "campaign"
          ? `Built campaign ${mm.campaignName ?? ""}`
          : mm.mode === "list"
            ? `Listed ${mm.listCount ?? ""} customers`
            : ""),
    }));

    setMessages((prev) => [...prev, { role: "user", text: msg }, { role: "assistant", text: "" }]);

    const es = new EventSource(api.assistantStreamUrl(msg, JSON.stringify(history)));
    esRef.current = es;
    let done = false;

    es.addEventListener("mode", (e) => {
      const { mode } = JSON.parse((e as MessageEvent).data);
      patchLast(mode === "campaign" ? { mode, states: { intent: "running" }, latencies: {} } : { mode });
    });

    // Typewriter: append each token as it streams in.
    es.addEventListener("token", (e) => {
      const { text: t } = JSON.parse((e as MessageEvent).data);
      patchLast((m) => ({ text: m.text + t }));
    });

    // Customer list result (e.g. "show me customers whose name starts with A").
    es.addEventListener("customers", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      patchLast({ customers: d.customers, listCount: d.count, unsupported: d.unsupported });
    });

    // Past messages already sent to one customer ("last 2 mails I sent to Rahul").
    es.addEventListener("history", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      patchLast({ historyItems: d.items ?? [], historyCustomer: d.customer_name, notFound: !!d.not_found });
    });

    // Customer added to the database.
    es.addEventListener("customer_added", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      patchLast({ addedCustomer: d });
    });

    // Customer profile + suggested personalized message.
    es.addEventListener("profile", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      patchLast({ profile: d.not_found ? undefined : d, notFound: !!d.not_found, historyCustomer: d.customer_name });
    });

    // Campaign progress: each step lands as the model finishes it.
    es.addEventListener("step", (e) => {
      const ev = JSON.parse((e as MessageEvent).data);
      const step: string = ev.step;
      const idx = ORDER.indexOf(step);
      patchLast((m) => ({
        latencies: { ...(m.latencies ?? {}), [step]: ev.meta?.latency_ms ?? 0 },
        states: {
          ...(m.states ?? {}),
          [step]: "done",
          ...(idx + 1 < ORDER.length ? { [ORDER[idx + 1]]: "running" } : {}),
        },
      }));
    });

    es.addEventListener("done", (e) => {
      done = true;
      const d = JSON.parse((e as MessageEvent).data);
      patchLast({
        done: true,
        ...(d.mode === "campaign"
          ? {
              states: Object.fromEntries(ORDER.map((k) => [k, "done"])) as Record<string, StepState>,
              campaignId: d.campaign_id,
              campaignName: d.campaign_name,
            }
          : {}),
      });
      es.close();
      setBusy(false);
    });

    es.addEventListener("error", (e) => {
      const data = (e as MessageEvent).data;
      done = true;
      patchLast({ done: true, error: data ? (JSON.parse(data).detail as string) : "Connection lost" });
      es.close();
      setBusy(false);
    });

    es.onerror = () => {
      if (done) return;
      patchLast({ done: true, error: "Assistant connection failed" });
      es.close();
      setBusy(false);
    };
  }

  const empty = messages.length === 0;

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col py-2">
      <div className="mb-3 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          <span className="gradient-text">Growth</span> Assistant
        </h1>
        {meta && (
          <div className="mt-1 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ProviderPill provider={meta.provider === "Mock (offline)" ? "mock" : "qwen"} />
            <span>{meta.model}</span>
          </div>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-1">
        {empty && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="ai-gradient mb-4 flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg shadow-indigo-500/30">
              <Sparkles className="h-7 w-7 text-white" />
            </div>
            <p className="max-w-md text-muted-foreground">
              Ask me anything about your customers, marketing or growth — build a campaign, look up a
              customer&apos;s profile and draft a personalized mail, review the last messages you sent
              someone, or add a new customer to the database.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => send(ex)}
                  className="rounded-full border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div className="w-full max-w-[90%] space-y-3">
                {m.mode === "campaign" && m.states && (
                  <div className="rounded-2xl border bg-card p-4">
                    <div className="mb-3 text-sm font-semibold">
                      {m.done ? "Campaign ready" : "Building your campaign…"}
                    </div>
                    <ol className="space-y-2">
                      {TIMELINE.map((t) => {
                        const st = m.states![t.key] ?? "pending";
                        const lat = m.latencies?.[t.key];
                        return (
                          <li key={t.key} className="flex items-center gap-3">
                            {st === "done" ? (
                              <Check className="h-4 w-4 text-emerald-500" />
                            ) : st === "running" ? (
                              <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            ) : (
                              <CircleDashed className="h-4 w-4 text-muted-foreground/40" />
                            )}
                            <span className={cn("flex-1 text-sm", st === "pending" && "text-muted-foreground/50")}>
                              {t.label}
                            </span>
                            {lat != null && (
                              <span className="tabular-nums text-xs text-muted-foreground">
                                {(lat / 1000).toFixed(1)}s
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                    {m.done && m.campaignId && (
                      <Link href={`/campaigns/${m.campaignId}`} className="mt-3 block">
                        <Button className="w-full">
                          Review &amp; launch {m.campaignName ? `“${m.campaignName}”` : "campaign"} <ArrowUpRight />
                        </Button>
                      </Link>
                    )}
                  </div>
                )}

                {m.mode === "list" &&
                  (!m.customers && !m.unsupported ? (
                    <div className="flex items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Finding matching customers…
                    </div>
                  ) : m.unsupported ? (
                    <div className="rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground">
                      I couldn&apos;t turn that into a customer filter. Try criteria like name, lifetime
                      spend, favorite category, engagement score, or order recency.
                    </div>
                  ) : (
                    <div className="rounded-2xl border bg-card p-4 text-sm">
                      <div className="mb-2 font-medium">
                        {m.listCount?.toLocaleString()} customers match
                        {m.customers && m.listCount && m.listCount > m.customers.length
                          ? ` · showing top ${m.customers.length}`
                          : ""}
                      </div>
                      <div className="max-h-80 divide-y overflow-y-auto">
                        {m.customers?.map((c, j) => (
                          <div key={j} className="flex items-center justify-between gap-3 py-1.5">
                            <span className="truncate">{c.name}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              ₹{c.lifetime_spend.toLocaleString()} · {c.favorite_category ?? "—"} · eng {c.engagement_score}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                {m.mode === "history" &&
                  (!m.historyItems && !m.notFound ? (
                    <div className="flex items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Looking up past messages…
                    </div>
                  ) : m.notFound ? (
                    <div className="rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground">
                      I couldn&apos;t find a customer matching{" "}
                      <span className="font-medium">“{m.historyCustomer ?? "that name"}”</span>. Try their full name.
                    </div>
                  ) : (
                    <div className="rounded-2xl border bg-card p-4 text-sm">
                      <div className="mb-2 font-medium">
                        {m.historyItems!.length > 0
                          ? `Last ${m.historyItems!.length} message${m.historyItems!.length > 1 ? "s" : ""} sent to ${m.historyCustomer}`
                          : `No messages have been sent to ${m.historyCustomer} yet.`}
                      </div>
                      <div className="space-y-2">
                        {m.historyItems!.map((h, j) => (
                          <div key={j} className="rounded-lg border bg-background p-3">
                            <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                              {channelIcon(h.channel)}
                              <span className="uppercase">{h.channel}</span> · {h.status}
                              {h.created_at && <> · {new Date(h.created_at).toLocaleDateString()}</>}
                              <span className="ml-auto truncate pl-2">{h.campaign_name}</span>
                            </div>
                            {h.subject && <div className="font-medium">{h.subject}</div>}
                            <p className="whitespace-pre-wrap text-muted-foreground">{h.message}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                {m.mode === "add_customer" && m.addedCustomer && (
                  <div className="rounded-2xl border bg-card p-4 text-sm">
                    <div className="flex items-center gap-2 font-medium text-emerald-600">
                      <UserPlus className="h-4 w-4" /> Added to your customer database
                    </div>
                    <div className="mt-2 space-y-0.5 text-muted-foreground">
                      <div>
                        <span className="text-foreground">{m.addedCustomer.name}</span>
                      </div>
                      {m.addedCustomer.email && <div>{m.addedCustomer.email}</div>}
                      {m.addedCustomer.phone && <div>{m.addedCustomer.phone}</div>}
                    </div>
                    <Link href={`/customers/${m.addedCustomer.id}`} className="mt-3 inline-block">
                      <Button size="sm" variant="outline">
                        View profile <ArrowUpRight />
                      </Button>
                    </Link>
                  </div>
                )}

                {m.mode === "profile" &&
                  (!m.profile && !m.notFound ? (
                    <div className="flex items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Pulling up the profile…
                    </div>
                  ) : m.notFound ? (
                    <div className="rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground">
                      I couldn&apos;t find a customer matching{" "}
                      <span className="font-medium">“{m.historyCustomer ?? "that name"}”</span>. Try their full name.
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Link href={`/customers/${m.profile!.customer.id}`} className="font-semibold hover:underline">
                            {m.profile!.customer.name}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {m.profile!.customer.email ?? "no email"} · {m.profile!.customer.favorite_category ?? "—"}
                          </div>
                        </div>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            RISK_COLOR[m.profile!.card.churn_risk] ?? "bg-muted text-muted-foreground",
                          )}
                        >
                          {m.profile!.card.churn_risk} churn risk
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-background p-2">
                          <div className="font-semibold">₹{m.profile!.customer.lifetime_spend.toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">lifetime</div>
                        </div>
                        <div className="rounded-lg bg-background p-2">
                          <div className="font-semibold">{m.profile!.customer.order_count}</div>
                          <div className="text-xs text-muted-foreground">orders</div>
                        </div>
                        <div className="rounded-lg bg-background p-2">
                          <div className="font-semibold">
                            {m.profile!.customer.days_since_last != null ? `${m.profile!.customer.days_since_last}d` : "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">since last</div>
                        </div>
                      </div>

                      <p className="text-muted-foreground">{m.profile!.card.summary}</p>

                      <DraftCard profile={m.profile!} />
                    </div>
                  ))}

                {(m.mode === "answer" || (!m.mode && m.text)) && (
                  <div className="rounded-2xl border bg-card px-4 py-3 text-sm">
                    <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                    {!m.done && (
                      <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-primary align-middle" />
                    )}
                  </div>
                )}

                {!m.mode && !m.text && !m.error && (
                  <div className="flex items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
                  </div>
                )}

                {m.error && (
                  <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {m.error}
                  </div>
                )}
              </div>
            </div>
          )
        )}
      </div>

      <div className="ai-surface mt-3 rounded-2xl border p-3 shadow-sm ring-1 ring-primary/5">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={busy}
            rows={1}
            placeholder="Ask anything, or say “build a campaign for…”"
            className="max-h-32 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 disabled:opacity-60"
          />
          <Button size="icon" onClick={() => send()} disabled={!input.trim() || busy}>
            {busy ? <Loader2 className="animate-spin" /> : <ArrowRight />}
          </Button>
        </div>
      </div>
    </div>
  );
}
