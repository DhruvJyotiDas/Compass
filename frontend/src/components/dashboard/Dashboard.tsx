"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Campaign, CampaignStats, InsightsOutput } from "@/lib/api";
import { useSSE } from "@/lib/sse";
import { fmt, Icon, ML, ChannelIcon, useCountUp } from "@/components/ui";

interface LiveEvent {
  communication_id: string;
  event_type: string;
  customer_name: string;
  channel: string;
  timestamp: string;
  variant?: string;
}

const FUNNEL_STAGES = ["sent", "delivered", "opened", "clicked", "converted"] as const;

function FunnelBar({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  const animated = useCountUp(count);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12 }}>
        <span style={{ color: "var(--fg-dim)", textTransform: "capitalize" }}>{label}</span>
        <span className="num" style={{ color: "var(--fg)" }}>{fmt(animated)}</span>
      </div>
      <div style={{ height: 6, background: "var(--bg-inset)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width .6s cubic-bezier(.2,.7,.3,1)" }} />
      </div>
    </div>
  );
}

const EVENT_COLORS: Record<string, string> = {
  sent:      "var(--fg-muted)",
  delivered: "var(--green)",
  opened:    "var(--accent)",
  read:      "var(--accent-bright)",
  clicked:   "var(--amber)",
  failed:    "var(--red)",
  converted: "var(--green)",
  dup_rejected: "var(--fg-faint)",
};

export default function Dashboard({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<CampaignStats>({ sent: 0, delivered: 0, opened: 0, read: 0, clicked: 0, failed: 0, converted: 0, dlq_count: 0, total: 0 });
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [dupRejected, setDupRejected] = useState(0);
  const [insights, setInsights] = useState<InsightsOutput | null>(null);
  const [generatingInsights, setGeneratingInsights] = useState(false);

  const sseMessages = useSSE(campaignId);

  // Process SSE messages
  useEffect(() => {
    for (const msg of sseMessages.slice(0, 1)) {
      if (msg.type === "event") {
        const d = msg.data as LiveEvent;
        setLiveEvents(prev => [d, ...prev].slice(0, 100));
        setStats(prev => updateStats(prev, d.event_type));
      } else if (msg.type === "dup_rejected") {
        setDupRejected(prev => prev + 1);
      } else if (msg.type === "stats") {
        setStats(msg.data as CampaignStats);
      }
    }
  }, [sseMessages]);

  // Poll stats every 5s
  useEffect(() => {
    const poll = async () => {
      try {
        const s = await api.getCampaignStats(campaignId);
        setStats(s);
      } catch {}
    };
    poll();
    const iv = setInterval(poll, 5000);
    return () => clearInterval(iv);
  }, [campaignId]);

  useEffect(() => {
    api.getCampaign(campaignId).then(setCampaign).catch(() => {});
  }, [campaignId]);

  // Auto-generate insights when campaign settles (clicked > 0 and not yet generated)
  useEffect(() => {
    if (!insights && !generatingInsights && stats.clicked > 0 && stats.sent > 0) {
      const settled = stats.sent > 0 && (stats.delivered / stats.sent) > 0.5;
      if (settled) {
        setGeneratingInsights(true);
        api.generateInsights(campaignId).then(i => {
          setInsights(i);
          setGeneratingInsights(false);
        }).catch(() => setGeneratingInsights(false));
      }
    }
  }, [stats, campaignId, insights, generatingInsights]);

  const maxVal = stats.sent || 1;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ marginBottom: 24 }}>
        <ML>Live campaign</ML>
        <h1 style={{ margin: "8px 0 4px", fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>
          {campaign?.name || "Campaign Dashboard"}
        </h1>
        <p style={{ margin: 0, color: "var(--fg-dim)", fontSize: 13 }}>{campaign?.goal_text}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Funnel */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <ML>Delivery funnel</ML>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--green)" }}>
                <span className="live-dot" style={{ width: 6, height: 6, borderRadius: 999, background: "var(--green)" }} />
                live
              </div>
            </div>
            <FunnelBar label="Sent" count={stats.sent} max={maxVal} color="var(--fg-muted)" />
            <FunnelBar label="Delivered" count={stats.delivered} max={maxVal} color="var(--green)" />
            <FunnelBar label="Opened" count={stats.opened} max={maxVal} color="var(--accent)" />
            <FunnelBar label="Clicked" count={stats.clicked} max={maxVal} color="var(--amber)" />
            <FunnelBar label="Converted" count={stats.converted} max={maxVal} color="var(--green)" />
          </div>

          {/* Per-variant table */}
          {campaign?.plan?.variants && campaign.plan.variants.length > 0 && (
            <div className="card" style={{ padding: 20 }}>
              <ML style={{ marginBottom: 12 }}>Variant performance</ML>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ color: "var(--fg-muted)" }}>
                    {["Variant", "Channel", "Split", "Sent", "Delivered", "Opened"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "4px 8px", fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {campaign.plan.variants.map(v => {
                    const vSent = Math.round(stats.sent * v.split_pct / 100);
                    const vDel = Math.round(stats.delivered * v.split_pct / 100);
                    const vOpen = Math.round(stats.opened * v.split_pct / 100);
                    return (
                      <tr key={v.variant_id} style={{ borderTop: "1px solid var(--border-soft)" }}>
                        <td style={{ padding: "8px 8px" }}><strong>Variant {v.variant_id}</strong></td>
                        <td style={{ padding: "8px 8px" }}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><ChannelIcon channel={v.channel} />{v.channel}</div></td>
                        <td style={{ padding: "8px 8px" }} className="num">{v.split_pct}%</td>
                        <td style={{ padding: "8px 8px" }} className="num">{fmt(vSent)}</td>
                        <td style={{ padding: "8px 8px" }} className="num">{vDel > 0 ? `${Math.round(vDel / Math.max(vSent, 1) * 100)}%` : "–"}</td>
                        <td style={{ padding: "8px 8px" }} className="num">{vOpen > 0 ? `${Math.round(vOpen / Math.max(vSent, 1) * 100)}%` : "–"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* AI Insights */}
          {(insights || generatingInsights) && (
            <div className="card fade-up" style={{ padding: 20, borderColor: "var(--accent-line)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Icon.bolt style={{ color: "var(--accent)" }} />
                <ML>AI insights</ML>
                {generatingInsights && <Icon.spinner style={{ color: "var(--accent)" }} />}
              </div>
              {insights?.findings.map((f, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, fontSize: 13 }}>
                  <Icon.check style={{ color: "var(--green)", flexShrink: 0, marginTop: 2 }} />
                  <span style={{ color: "var(--fg-dim)" }}>{f}</span>
                </div>
              ))}
              {insights?.next_action && (
                <div style={{ marginTop: 16, padding: "12px 14px", background: "var(--accent-wash)", border: "1px solid var(--accent-line)", borderRadius: "var(--r)", fontSize: 13 }}>
                  <span style={{ color: "var(--accent-bright)", fontWeight: 500 }}>Next: </span>
                  <span style={{ color: "var(--fg)" }}>{insights.next_action}</span>
                </div>
              )}
              {insights?.next_goal && (
                <button
                  onClick={() => router.push(`/?goal=${encodeURIComponent(insights.next_goal)}`)}
                  className="btn btn-accent"
                  style={{ marginTop: 12, fontSize: 12 }}
                >
                  <Icon.arrow />
                  Launch follow-up campaign
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: counters + event stream */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Idempotency counters */}
          <div className="card" style={{ padding: 16 }}>
            <ML style={{ marginBottom: 12 }}>Idempotency stats</ML>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 8 }}>
              <span style={{ color: "var(--fg-muted)" }}>Duplicates rejected</span>
              <span className="num" style={{ color: "var(--amber)" }}>{fmt(dupRejected)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 8 }}>
              <span style={{ color: "var(--fg-muted)" }}>DLQ (failed after 5x)</span>
              <span className="num" style={{ color: stats.dlq_count > 0 ? "var(--red)" : "var(--fg-faint)" }}>{fmt(stats.dlq_count)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--fg-muted)" }}>Failed</span>
              <span className="num" style={{ color: stats.failed > 0 ? "var(--red)" : "var(--fg-faint)" }}>{fmt(stats.failed)}</span>
            </div>
          </div>

          {/* Event stream */}
          <div className="card" style={{ padding: 16, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span className="live-dot" style={{ width: 6, height: 6, borderRadius: 999, background: "var(--green)" }} />
              <ML>Event stream</ML>
            </div>
            <div style={{ maxHeight: 400, overflowY: "auto" }}>
              {liveEvents.length === 0 ? (
                <div style={{ color: "var(--fg-faint)", fontSize: 12, textAlign: "center", padding: "20px 0" }}>
                  Waiting for events…
                </div>
              ) : (
                liveEvents.map((e, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border-soft)", fontSize: 11 }}>
                    <ChannelIcon channel={e.channel} style={{ flexShrink: 0, width: 12, height: 12 }} />
                    <span style={{ color: EVENT_COLORS[e.event_type] || "var(--fg-muted)", fontWeight: 500, minWidth: 68 }}>{e.event_type}</span>
                    <span style={{ color: "var(--fg-dim)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.customer_name}</span>
                    <span style={{ color: "var(--fg-faint)", fontFamily: "var(--mono)", fontSize: 10 }}>
                      {new Date(e.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function updateStats(prev: CampaignStats, event_type: string): CampaignStats {
  const next = { ...prev };
  const rank: Record<string, number> = { sent: 1, delivered: 2, opened: 3, read: 4, clicked: 5 };
  if (event_type === "sent") next.sent++;
  else if (event_type === "delivered") next.delivered++;
  else if (event_type === "opened") next.opened++;
  else if (event_type === "read") next.read++;
  else if (event_type === "clicked") next.clicked++;
  else if (event_type === "failed") next.failed++;
  else if (event_type === "converted") next.converted++;
  return next;
}
