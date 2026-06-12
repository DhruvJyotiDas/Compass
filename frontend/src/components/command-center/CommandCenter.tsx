"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Icon, ML } from "@/components/ui";

const EXAMPLE_GOALS = [
  "Win back customers who haven't ordered in 60 days",
  "Reward our top 5% lifetime spenders with a VIP offer",
  "Re-engage cart abandoners from last week",
];

const STEP_LABELS: Record<string, string> = {
  intent:        "Classifying intent",
  segment_dsl:   "Compiling segment DSL",
  campaign_plan: "Designing campaign plan",
  message_copy:  "Writing message copy",
  done:          "Pipeline complete",
};

interface StepDisplay {
  step: string;
  label: string;
  latency_ms: number;
  valid: boolean;
  output: unknown;
  status: "done" | "running" | "pending";
  expanded: boolean;
}

export default function CommandCenter({
  initialGoal,
  onCampaignCreated,
}: {
  initialGoal?: string;
  onCampaignCreated?: (campaignId: string) => void;
}) {
  const router = useRouter();
  const [goal, setGoal] = useState(initialGoal || EXAMPLE_GOALS[0]);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<StepDisplay[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    if (initialGoal) setGoal(initialGoal);
  }, [initialGoal]);

  useEffect(() => {
    setSpeechAvailable(!!(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  const handleMic = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const rec = new SR();
    rec.lang = "en-IN";
    rec.continuous = false;
    rec.interimResults = false;
    recognitionRef.current = rec;

    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setGoal(transcript);
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);

    rec.start();
    setListening(true);
  }, [listening]);

  const runPipeline = useCallback(async () => {
    if (!goal.trim() || running) return;
    setRunning(true);
    setError(null);
    setSteps([
      { step: "intent",        label: STEP_LABELS["intent"],        latency_ms: 0, valid: true, output: null, status: "running",  expanded: false },
      { step: "segment_dsl",   label: STEP_LABELS["segment_dsl"],   latency_ms: 0, valid: true, output: null, status: "pending", expanded: false },
      { step: "campaign_plan", label: STEP_LABELS["campaign_plan"], latency_ms: 0, valid: true, output: null, status: "pending", expanded: false },
      { step: "message_copy",  label: STEP_LABELS["message_copy"],  latency_ms: 0, valid: true, output: null, status: "pending", expanded: false },
    ]);

    try {
      const result = await api.runPipeline(goal);
      const stepsData = result.steps as Record<string, { output: unknown; latency_ms: number; valid: boolean }>;

      // Animate steps completing one by one
      const stepOrder = ["intent", "segment_dsl", "campaign_plan", "message_copy"];
      for (let i = 0; i < stepOrder.length; i++) {
        const s = stepOrder[i];
        const data = stepsData[s];
        if (!data) continue;
        await new Promise(r => setTimeout(r, 200 + i * 100)); // brief stagger for UX
        setSteps(prev => prev.map((st, idx) => {
          if (st.step === s) return { ...st, status: "done", latency_ms: data.latency_ms, valid: data.valid, output: data.output };
          if (idx === i + 1) return { ...st, status: "running" };
          return st;
        }));
      }

      await new Promise(r => setTimeout(r, 300));
      router.push(`/segment?campaignId=${result.campaign_id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Pipeline failed");
      setRunning(false);
      setSteps(prev => prev.map(s => s.status === "running" ? { ...s, status: "pending" } : s));
    }
  }, [goal, running, router]);

  const toggleExpand = (step: string) => {
    setSteps(prev => prev.map(s => s.step === step ? { ...s, expanded: !s.expanded } : s));
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <ML>Campaign goal</ML>
        <h1 style={{ margin: "8px 0 4px", fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>
          What do you want to achieve?
        </h1>
        <p style={{ margin: 0, color: "var(--fg-dim)", fontSize: 13 }}>
          Describe your campaign goal in plain language. AI will plan the entire campaign.
        </p>
      </div>

      {/* Goal input */}
      <div style={{ position: "relative", marginBottom: 16 }}>
        <textarea
          value={goal}
          onChange={e => setGoal(e.target.value)}
          placeholder="e.g. Win back customers who haven't ordered in 60 days…"
          disabled={running}
          rows={3}
          style={{
            width: "100%", resize: "none", padding: "14px 52px 14px 16px",
            background: "var(--bg-card)", border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)", color: "var(--fg)", fontFamily: "var(--sans)",
            fontSize: 15, lineHeight: 1.5, outline: "none",
            transition: "border-color .14s",
          }}
          onFocus={e => { e.target.style.borderColor = "var(--accent-line)"; }}
          onBlur={e => { e.target.style.borderColor = "var(--border)"; }}
        />
        {/* Mic button */}
        {speechAvailable && (
          <button
            onClick={handleMic}
            title={listening ? "Stop recording" : "Speak your goal"}
            style={{
              position: "absolute", right: 12, top: 12,
              background: listening ? "var(--accent-wash)" : "transparent",
              border: `1px solid ${listening ? "var(--accent-line)" : "transparent"}`,
              borderRadius: "var(--r)", padding: 8, cursor: "pointer",
              color: listening ? "var(--accent)" : "var(--fg-muted)",
              display: "flex", alignItems: "center", transition: "all .14s",
            }}
          >
            {listening ? <Icon.spinner /> : <Icon.mic />}
          </button>
        )}
      </div>

      {/* Example goals */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        {EXAMPLE_GOALS.map(eg => (
          <button
            key={eg}
            onClick={() => !running && setGoal(eg)}
            className="btn btn-ghost"
            style={{ fontSize: 12 }}
          >
            {eg}
          </button>
        ))}
      </div>

      {/* Run button */}
      <button
        onClick={runPipeline}
        disabled={running || !goal.trim()}
        className="btn btn-accent"
        style={{ fontSize: 14, padding: "10px 24px", opacity: (!goal.trim() || running) ? 0.5 : 1 }}
      >
        {running ? <Icon.spinner /> : <Icon.bolt />}
        {running ? "Running pipeline…" : "Run AI pipeline"}
        {!running && <Icon.arrow />}
      </button>

      {error && (
        <div style={{ marginTop: 16, padding: "10px 14px", background: "var(--red-wash)", border: "1px solid var(--red)", borderRadius: "var(--r)", color: "var(--red)", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Reasoning timeline */}
      {steps.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <ML style={{ marginBottom: 12 }}>AI reasoning timeline</ML>
          <div className="well" style={{ padding: "4px 0", overflow: "hidden" }}>
            {steps.map((s, i) => (
              <div key={s.step}>
                <div
                  onClick={() => s.status === "done" && toggleExpand(s.step)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 16px", cursor: s.status === "done" ? "pointer" : "default",
                    borderBottom: i < steps.length - 1 ? "1px solid var(--border-soft)" : "none",
                    background: s.status === "running" ? "var(--accent-wash2)" : "transparent",
                    transition: "background .14s",
                  }}
                >
                  {/* Status glyph */}
                  <div style={{ width: 20, display: "flex", justifyContent: "center", flexShrink: 0 }}>
                    {s.status === "done" ? (
                      <Icon.check style={{ color: s.valid ? "var(--green)" : "var(--amber)" }} />
                    ) : s.status === "running" ? (
                      <Icon.spinner style={{ color: "var(--accent)" }} />
                    ) : (
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--fg-faint)", display: "block", margin: "auto" }} />
                    )}
                  </div>

                  {/* Step info */}
                  <div style={{ flex: 1 }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: s.status === "done" ? "var(--fg)" : "var(--fg-muted)" }}>
                      {s.step}
                    </span>
                    <span style={{ color: "var(--fg-muted)", marginLeft: 8, fontSize: 12 }}>
                      {s.label}
                    </span>
                  </div>

                  {/* Latency */}
                  {s.status === "done" && (
                    <span className="num" style={{ fontSize: 11, color: "var(--fg-faint)" }}>
                      {s.latency_ms}ms
                    </span>
                  )}
                  {s.status === "running" && (
                    <span style={{ fontSize: 11, color: "var(--accent)" }}>running…<span className="cursor" /></span>
                  )}

                  {/* Expand chevron */}
                  {s.status === "done" && (
                    <Icon.chevron style={{ color: "var(--fg-faint)", transform: s.expanded ? "rotate(180deg)" : "none", transition: "transform .14s" }} />
                  )}
                </div>

                {/* Expanded output */}
                {s.expanded && s.output && (
                  <div style={{ padding: "12px 16px 12px 48px", borderBottom: i < steps.length - 1 ? "1px solid var(--border-soft)" : "none", background: "var(--bg-inset)" }}>
                    <pre style={{ margin: 0, fontFamily: "var(--mono)", fontSize: 11, color: "var(--fg-dim)", overflowX: "auto", whiteSpace: "pre-wrap" }}>
                      {JSON.stringify(s.output, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
