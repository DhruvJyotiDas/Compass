"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Campaign, CompileResponse, CustomerPreview, DSLFilter, SegmentDSL } from "@/lib/api";
import { cx, fmt, inr, Icon, ML, TokenText, ChannelIcon, useCountUp } from "@/components/ui";

const OP_LABELS: Record<string, string> = {
  days_ago_gt: "days ago >",
  days_ago_lt: "days ago <",
  gte: "≥",
  lte: "≤",
};

const FIELD_LABELS: Record<string, string> = {
  last_order_at: "Last order",
  lifetime_spend: "Lifetime spend",
  order_count: "Order count",
};

function FilterChip({
  filter,
  index,
  onChange,
  locked,
}: {
  filter: DSLFilter;
  index: number;
  onChange: (idx: number, value: number | string) => void;
  locked?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (locked) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: "var(--bg-inset)", border: "1px solid var(--border-soft)", borderRadius: "var(--r)", opacity: 0.6 }}>
        <Icon.lock style={{ color: "var(--fg-faint)" }} />
        <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--fg-muted)" }}>opted_out = false</span>
        <span style={{ fontSize: 11, color: "var(--fg-faint)" }}>always enforced</span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 12px",
        background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: "var(--r)", cursor: locked ? "default" : "pointer",
        transition: "border-color .14s",
      }}
      onMouseEnter={e => !locked && ((e.currentTarget as HTMLElement).style.borderColor = "var(--accent-line)")}
      onMouseLeave={e => !locked && ((e.currentTarget as HTMLElement).style.borderColor = "var(--border)")}
    >
      <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--fg-dim)" }}>
        {FIELD_LABELS[filter.field] || filter.field}
      </span>
      <span style={{ fontSize: 11, color: "var(--accent)" }}>{OP_LABELS[filter.op] || filter.op}</span>
      {editing ? (
        <input
          ref={inputRef}
          defaultValue={String(filter.value)}
          onBlur={e => { onChange(index, Number(e.target.value) || e.target.value); setEditing(false); }}
          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          style={{ width: 60, background: "var(--bg-inset)", border: "1px solid var(--accent-line)", borderRadius: 4, padding: "2px 6px", fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent-bright)", outline: "none" }}
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent-bright)", background: "var(--accent-wash)", border: "1px solid var(--accent-line)", borderRadius: 4, padding: "2px 8px", cursor: "pointer" }}
        >
          {filter.field === "lifetime_spend" ? `₹${filter.value}` : String(filter.value)}
          <Icon.edit style={{ marginLeft: 4, verticalAlign: "middle", color: "var(--accent-dim)" }} />
        </button>
      )}
    </div>
  );
}

function MatchTracePopup({ customer }: { customer: CustomerPreview }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-dim)", fontSize: 12, fontFamily: "var(--sans)", padding: 0, textDecoration: "underline dotted" }}
      >
        {customer.name}
      </button>
      {show && (
        <div style={{
          position: "absolute", left: 0, top: "100%", zIndex: 100, marginTop: 4,
          background: "var(--bg-raise)", border: "1px solid var(--border-strong)",
          borderRadius: "var(--r-lg)", padding: 12, minWidth: 280,
          boxShadow: "var(--shadow)",
        }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--fg-muted)", marginBottom: 8 }}>why matched</div>
          {customer.match_trace.map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, fontSize: 12 }}>
              <Icon.check style={{ color: t.matched ? "var(--green)" : "var(--red)", flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--mono)", color: "var(--fg-dim)" }}>{t.field}</span>
              <span style={{ color: "var(--fg-faint)" }}>→</span>
              <span style={{ color: "var(--fg)" }}>{String(t.actual)}</span>
              <span style={{ color: "var(--fg-faint)" }}>{String(t.op)}</span>
              <span style={{ color: "var(--accent)" }}>{String(t.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SegmentPlan({ campaign }: { campaign: Campaign }) {
  const router = useRouter();
  const [filters, setFilters] = useState<DSLFilter[]>(
    campaign.segment_dsl?.filters || []
  );
  const [compile, setCompile] = useState<CompileResponse | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [approving, setApproving] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animCount = useCountUp(compile?.count ?? campaign.audience_count ?? 0);

  const recompile = useCallback(async (f: DSLFilter[]) => {
    if (!f.length) return;
    setCompiling(true);
    try {
      const dsl: SegmentDSL = { filters: f, logic: campaign.segment_dsl?.logic || "AND" };
      const res = await api.compileSegment(dsl);
      setCompile(res);
    } catch {}
    setCompiling(false);
  }, [campaign.segment_dsl?.logic]);

  useEffect(() => { recompile(filters); }, []); // eslint-disable-line

  const handleFilterChange = (idx: number, value: number | string) => {
    const next = filters.map((f, i) => i === idx ? { ...f, value } : f);
    setFilters(next);
    recompile(next);
  };

  const startHold = () => {
    setHoldProgress(0);
    holdRef.current = setInterval(() => {
      setHoldProgress(p => {
        if (p >= 100) {
          clearInterval(holdRef.current!);
          doApprove();
          return 100;
        }
        return p + 5;
      });
    }, 80);
  };

  const releaseHold = () => {
    clearInterval(holdRef.current!);
    if (holdProgress < 100) setHoldProgress(0);
  };

  const doApprove = async () => {
    if (approving) return;
    setApproving(true);
    try {
      const dsl: SegmentDSL = { filters, logic: campaign.segment_dsl?.logic || "AND" };
      await api.approveCampaign(campaign.id, dsl);
      router.push(`/dashboard?campaignId=${campaign.id}`);
    } catch (e) {
      console.error(e);
      setApproving(false);
      setHoldProgress(0);
    }
  };

  const variants = campaign.message_variants || [];
  const planVariants = campaign.plan?.variants || [];

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px 100px" }}>
      <div style={{ marginBottom: 24 }}>
        <ML>Campaign plan</ML>
        <h1 style={{ margin: "8px 0 4px", fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>
          {campaign.name || "New Campaign"}
        </h1>
        <p style={{ margin: 0, color: "var(--fg-dim)", fontSize: 13 }}>{campaign.goal_text}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr 1fr", gap: 16 }}>
        {/* ── Left: Audience stats ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="card" style={{ padding: 16 }}>
            <ML style={{ marginBottom: 8 }}>Audience</ML>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span className="num" style={{ fontSize: 36, fontWeight: 700, color: "var(--fg)" }}>
                {fmt(animCount)}
              </span>
              {compiling && <Icon.spinner style={{ color: "var(--accent)" }} />}
            </div>
            <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>customers matched</div>
          </div>

          {/* Sample customers */}
          <div className="card" style={{ padding: 16 }}>
            <ML style={{ marginBottom: 10 }}>Sample (top 5 by spend)</ML>
            {compile?.sample.map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 12 }}>
                <MatchTracePopup customer={c} />
                <div style={{ textAlign: "right" }}>
                  <div className="num" style={{ color: "var(--fg-dim)", fontSize: 11 }}>{inr(c.lifetime_spend)}</div>
                  <div style={{ color: "var(--fg-faint)", fontSize: 10 }}>
                    {c.last_order_at
                      ? `${Math.floor((Date.now() - new Date(c.last_order_at).getTime()) / 86400000)}d ago`
                      : "no orders"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Center: Segment DSL editor ── */}
        <div>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <ML>Segment filters</ML>
              {compile && (
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--fg-faint)" }}>
                  {compile.count} matched
                </span>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filters.map((f, i) => (
                <FilterChip key={i} filter={f} index={i} onChange={handleFilterChange} />
              ))}
              <FilterChip filter={{ field: "opted_out", op: "eq", value: false }} index={-1} onChange={() => {}} locked />
            </div>

            {/* SQL preview */}
            {compile?.sql_preview && (
              <div style={{ marginTop: 16 }}>
                <ML style={{ marginBottom: 6 }}>Compiled SQL</ML>
                <pre style={{ margin: 0, fontFamily: "var(--mono)", fontSize: 10, color: "var(--fg-faint)", background: "var(--bg-inset)", padding: 10, borderRadius: "var(--r)", overflow: "auto", whiteSpace: "pre-wrap" }}>
                  {compile.sql_preview}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Message variants ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {planVariants.map((pv, i) => {
            const mv = variants.find(v => v.variant_id === pv.variant_id) || variants[i];
            if (!mv) return null;
            return (
              <div key={pv.variant_id} className="card" style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <ChannelIcon channel={pv.channel} />
                    <span style={{ fontWeight: 500, fontSize: 13 }}>Variant {pv.variant_id}</span>
                    <span className="mono" style={{ fontSize: 11, color: "var(--fg-faint)" }}>{pv.split_pct}%</span>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--fg-muted)", textTransform: "capitalize" }}>{pv.channel}</span>
                </div>
                {mv.subject && (
                  <div style={{ marginBottom: 8, fontSize: 12, color: "var(--fg-muted)" }}>
                    <span style={{ color: "var(--fg-faint)" }}>Subject: </span>
                    <TokenText text={mv.subject} />
                  </div>
                )}
                <div style={{ background: "var(--bg-inset)", borderRadius: "var(--r)", padding: "10px 12px", fontSize: 13, lineHeight: 1.6 }}>
                  <TokenText text={mv.body} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fixed approval bar */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "var(--bg-panel)", borderTop: "1px solid var(--border)",
        padding: "16px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        zIndex: 40,
      }}>
        <div style={{ fontSize: 13, color: "var(--fg-dim)" }}>
          <strong style={{ color: "var(--fg)" }}>{fmt(compile?.count ?? campaign.audience_count ?? 0)}</strong> customers will receive this campaign
          <span style={{ marginLeft: 16, color: "var(--fg-faint)", fontSize: 12 }}>
            · quiet hours 09:00–21:00 IST · cap 5,000/day · opt-outs enforced
          </span>
        </div>

        <div style={{ position: "relative", overflow: "hidden", borderRadius: "var(--r)" }}>
          {holdProgress > 0 && holdProgress < 100 && (
            <div style={{
              position: "absolute", left: 0, top: 0, bottom: 0,
              width: `${holdProgress}%`, background: "var(--accent-dim)", transition: "width .08s linear",
              opacity: 0.3,
            }} />
          )}
          <button
            onMouseDown={startHold}
            onMouseUp={releaseHold}
            onMouseLeave={releaseHold}
            onTouchStart={startHold}
            onTouchEnd={releaseHold}
            disabled={approving}
            className="btn btn-accent"
            style={{ fontSize: 13, padding: "10px 20px", position: "relative" }}
          >
            {approving ? <Icon.spinner /> : <Icon.check />}
            {approving ? "Dispatching…" : holdProgress > 0 ? "Hold to confirm…" : "Hold to approve & send"}
          </button>
        </div>
      </div>
    </div>
  );
}
