"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useGlobalEventStream } from "@/lib/sse";
import { fmt, Icon, ML } from "@/components/ui";

const PROFILES = [
  {
    name: "calm",
    label: "Calm",
    desc: "0% dup, 0% reorder, 0% fail — baseline",
    dup: 0, reorder: 0, fail: 0,
  },
  {
    name: "realistic",
    label: "Realistic",
    desc: "3% dup, 8% reorder, 2% fail — production jitter",
    dup: 3, reorder: 8, fail: 2,
  },
  {
    name: "hostile",
    label: "Hostile",
    desc: "25% dup, 40% reorder, 18% fail — adversarial",
    dup: 25, reorder: 40, fail: 18,
  },
];

interface LogLine {
  timestamp: string;
  status: number;
  event: string;
  comm_id: string;
  note?: string;
  color: string;
}

export default function Chaos() {
  const [active, setActive] = useState("calm");
  const [updating, setUpdating] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [dupCount, setDupCount] = useState(0);
  const [reorderCount, setReorderCount] = useState(0);
  const [failCount, setFailCount] = useState(0);
  const realEvents = useGlobalEventStream(true);
  const [lastEventCount, setLastEventCount] = useState(0);

  useEffect(() => {
    api.getChaosProfile()
      .then(r => { if (r.current) setActive(Object.keys(PROFILES.find(p => p.name === r.current) || {})[0] || "calm"); })
      .catch(() => {});
  }, []);

  const setProfile = async (name: string) => {
    setUpdating(true);
    try {
      await api.setChaosProfile(name);
      setActive(name);
      const now = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setLog(prev => [{
        timestamp: now,
        status: 200,
        event: "profile_changed",
        comm_id: "–",
        note: `→ ${name}`,
        color: "var(--accent)",
      }, ...prev]);
    } catch (e: unknown) {
      console.error(e);
    }
    setUpdating(false);
  };

  // Consume real receipt events from the global SSE feed
  useEffect(() => {
    if (realEvents.length <= lastEventCount) return;
    const newEvents = realEvents.slice(0, realEvents.length - lastEventCount);
    setLastEventCount(realEvents.length);

    const newLines: LogLine[] = newEvents.map(msg => {
      const isDup = msg.type === "dup_rejected";
      const data = msg.data as Record<string, unknown>;
      const event = isDup ? "dup_rejected" : String(data.event_type || msg.type);
      const isFail = event === "failed";
      const color = isDup ? "var(--fg-faint)" : isFail ? "var(--red)" : event === "clicked" ? "var(--amber)" : "var(--green)";

      if (isDup) setDupCount(n => n + 1);
      if (isFail) setFailCount(n => n + 1);

      return {
        timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        status: 200,
        event,
        comm_id: String(data.communication_id || "").slice(0, 8),
        note: isDup ? "duplicate · constraint-deduped" : undefined,
        color,
      };
    });

    setLog(prev => [...newLines, ...prev].slice(0, 60));
  }, [realEvents, lastEventCount]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ marginBottom: 28 }}>
        <ML>Chaos control</ML>
        <h1 style={{ margin: "8px 0 4px", fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>
          Fault injection panel
        </h1>
        <p style={{ margin: 0, color: "var(--fg-dim)", fontSize: 13 }}>
          Toggle chaos profiles to see how the CRM handles duplicates, reordering, and failures in real-time.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 20 }}>
        {/* Profile selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {PROFILES.map(p => {
            const isActive = active === p.name;
            return (
              <button
                key={p.name}
                onClick={() => setProfile(p.name)}
                disabled={updating}
                style={{
                  background: isActive ? "var(--bg-raise)" : "var(--bg-card)",
                  border: `1px solid ${isActive ? "var(--accent-line)" : "var(--border)"}`,
                  borderRadius: "var(--r-lg)", padding: "14px 16px",
                  textAlign: "left", cursor: "pointer", transition: "all .14s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: isActive ? "var(--fg)" : "var(--fg-dim)" }}>
                    {p.label}
                  </span>
                  {isActive && <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--green)", display: "block" }} className="live-dot" />}
                </div>
                <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 10 }}>{p.desc}</div>
                <div style={{ display: "flex", gap: 12 }}>
                  {[
                    { label: "dup", val: p.dup, color: "var(--amber)" },
                    { label: "reorder", val: p.reorder, color: "var(--accent)" },
                    { label: "fail", val: p.fail, color: "var(--red)" },
                  ].map(m => (
                    <div key={m.label} style={{ textAlign: "center" }}>
                      <div className="num" style={{ fontSize: 15, fontWeight: 600, color: m.color }}>{m.val}%</div>
                      <div style={{ fontSize: 10, color: "var(--fg-faint)" }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              </button>
            );
          })}

          {/* Live counters */}
          <div className="card" style={{ padding: 16, marginTop: 4 }}>
            <ML style={{ marginBottom: 12 }}>Live counters</ML>
            {[
              { label: "Duplicates rejected", val: dupCount, color: "var(--amber)" },
              { label: "Reorders resolved", val: reorderCount, color: "var(--accent)" },
              { label: "Failures", val: failCount, color: "var(--red)" },
            ].map(c => (
              <div key={c.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: "var(--fg-muted)" }}>{c.label}</span>
                <span className="num" style={{ color: c.color, fontWeight: 600 }}>{fmt(c.val)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Event log */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span className="live-dot" style={{ width: 6, height: 6, borderRadius: 999, background: "var(--green)" }} />
            <ML>Receipt log · POST /receipts</ML>
          </div>
          <div style={{ maxHeight: 520, overflowY: "auto", fontFamily: "var(--mono)", fontSize: 11 }}>
            {log.length === 0 && (
              <div style={{ color: "var(--fg-faint)", padding: "20px 0", textAlign: "center" }}>
                Waiting for events…
              </div>
            )}
            {log.map((l, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "4px 0", borderBottom: "1px solid var(--border-soft)", alignItems: "baseline" }}>
                <span style={{ color: "var(--fg-faint)", minWidth: 60 }}>{l.timestamp}</span>
                <span style={{ color: "var(--fg-muted)" }}>POST /receipts</span>
                <span style={{ color: l.status === 200 ? "var(--green)" : "var(--red)" }}>{l.status}</span>
                <span style={{ color: l.color, minWidth: 120 }}>evt={l.event}</span>
                <span style={{ color: "var(--fg-faint)" }}>comm={l.comm_id}</span>
                {l.note && <span style={{ color: "var(--fg-faint)", opacity: 0.7 }}>[{l.note}]</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Explanation */}
      <div style={{ marginTop: 24, padding: "16px 20px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", fontSize: 13, color: "var(--fg-dim)", lineHeight: 1.7 }}>
        <strong style={{ color: "var(--fg)" }}>How idempotency works: </strong>
        Duplicates are rejected via a <code style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--accent)" }}>UNIQUE(communication_id, event_type)</code> constraint — the database enforces deduplication, not application code.
        Out-of-order events (e.g. "delivered" before "sent") are resolved by a precedence rank: <code style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--accent)" }}>sent &lt; delivered &lt; opened &lt; read &lt; clicked</code>.
        Failed callbacks are retried with exponential backoff (2ⁿ seconds, max 5 attempts), then moved to the dead-letter queue.
      </div>
    </div>
  );
}
