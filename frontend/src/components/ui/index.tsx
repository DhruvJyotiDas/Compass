"use client";
import { useEffect, useRef, useState } from "react";

// ── cx helper ─────────────────────────────────────────────────────────────────
export const cx = (...a: (string | undefined | false | null)[]) => a.filter(Boolean).join(" ");
export const fmt = (n: number) => n.toLocaleString("en-IN");
export const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

// ── Icons ─────────────────────────────────────────────────────────────────────
type SvgProps = React.SVGProps<SVGSVGElement>;

export const Icon = {
  mic: (p: SvgProps) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  ),
  check: (p: SvgProps) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 6 9 17l-5-5"/></svg>
  ),
  arrow: (p: SvgProps) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M13 6l6 6-6 6"/></svg>
  ),
  spinner: (p: SvgProps) => (
    <svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" {...p}><path d="M12 3a9 9 0 1 0 9 9" opacity="0.9"/></svg>
  ),
  chevron: (p: SvgProps) => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m6 9 6 6 6-6"/></svg>
  ),
  edit: (p: SvgProps) => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
  ),
  x: (p: SvgProps) => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><path d="M18 6 6 18M6 6l12 12"/></svg>
  ),
  lock: (p: SvgProps) => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
  ),
  whatsapp: (p: SvgProps) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.8 14.04c-.24.68-1.4 1.3-1.94 1.34-.5.05-1.13.07-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.79-4.17-4.94-4.36-.14-.19-1.18-1.57-1.18-2.99s.75-2.12 1.01-2.41c.27-.29.58-.36.78-.36.19 0 .39 0 .56.01.18.01.42-.07.66.5.24.59.82 2.03.89 2.18.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.16-.29.37-.42.49-.14.14-.28.29-.12.57.16.28.71 1.17 1.53 1.9 1.05.93 1.94 1.22 2.22 1.36.28.14.44.12.6-.07.16-.19.69-.81.88-1.09.18-.28.37-.23.62-.14.25.09 1.6.76 1.87.9.28.14.46.21.53.32.07.12.07.66-.17 1.34Z"/></svg>
  ),
  mail: (p: SvgProps) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="2.5" y="4.5" width="19" height="15" rx="2.2"/><path d="m3 6 9 6.5L21 6"/></svg>
  ),
  bolt: (p: SvgProps) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>
  ),
  retry: (p: SvgProps) => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
  ),
  compass: (p: SvgProps) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...p}><circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="1.5"/><path d="M15.6 8.4 13.4 13.4 8.4 15.6 10.6 10.6Z" fill="currentColor"/></svg>
  ),
  sms: (p: SvgProps) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
  ),
};

// ── Micro-label ───────────────────────────────────────────────────────────────
export function ML({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className="ml" style={style}>{children}</div>;
}

// ── TokenText — renders {{token}} patterns highlighted ─────────────────────
export function TokenText({ text }: { text: string }) {
  const parts = String(text).split(/(\{\{[^}]+\}\})/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\{\{.*\}\}$/.test(p) ? <span key={i} className="token">{p}</span> : <span key={i}>{p}</span>
      )}
    </>
  );
}

// ── Animated counter ──────────────────────────────────────────────────────────
export function useCountUp(target: number, dur = 650) {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const t0 = performance.now();
    cancelAnimationFrame(rafRef.current);
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setVal(Math.round(from + (target - from) * e));
      if (k < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, dur]);

  return val;
}

// ── Channel icon helper ───────────────────────────────────────────────────────
export function ChannelIcon({ channel, style }: { channel: string; style?: React.CSSProperties }) {
  const color =
    channel === "whatsapp" ? "#25d366" :
    channel === "email" ? "var(--accent)" :
    "var(--fg-dim)";

  const props: SvgProps = { style: { color, ...style } };
  if (channel === "whatsapp") return <Icon.whatsapp {...props} />;
  if (channel === "email") return <Icon.mail {...props} />;
  return <Icon.sms {...props} />;
}
