"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles, Users, Target, Send, MessagesSquare, LineChart, ArrowRight, ArrowLeft,
  Wand2, MousePointerClick, Heart, Rocket, Building2, Briefcase, Headphones, Check,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const SEEN_KEY = "compass_tour_seen";

const AI_TABS = [
  { icon: Sparkles, name: "Growth Assistant", desc: "Describe a goal — AI builds the audience, campaign & messages." },
  { icon: Users, name: "Customers", desc: "Every shopper, scored by engagement, with an AI customer card." },
  { icon: Target, name: "Segments", desc: "Build an audience by hand, or let AI compile one from a sentence." },
  { icon: Send, name: "Campaigns", desc: "Review the AI artifact, launch, and watch the live funnel." },
  { icon: MessagesSquare, name: "Communications", desc: "Per-customer delivery, retries and dead-letter monitoring." },
  { icon: LineChart, name: "Analytics & Insights", desc: "Conversion funnels + the AI decision trail that produced them." },
];

const CRM_TABS = [
  { icon: Building2, name: "Sales", desc: "Leads, Contacts, Accounts, Deals, Activities — the classic CRM." },
  { icon: Briefcase, name: "Revenue", desc: "Products, Quotes, Sales Orders, Invoices, Purchase Orders." },
  { icon: Headphones, name: "Support & Ops", desc: "Cases, Knowledge Base, Reports, Workflows and Data Tools." },
];

const DEMO_GOALS = [
  "Win back premium customers who haven't ordered in 90 days",
  "Increase repeat purchases from recent one-time buyers",
  "Reward our top 5% lifetime spenders with a VIP offer",
];

export function WelcomeTour() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(SEEN_KEY)) {
      const t = setTimeout(() => setOpen(true), 500);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setStep(0); setOpen(true); };
    window.addEventListener("compass:open-tour", handler);
    return () => window.removeEventListener("compass:open-tour", handler);
  }, []);

  const close = useCallback(() => {
    localStorage.setItem(SEEN_KEY, "1");
    setOpen(false);
  }, []);

  function runDemo(goal: string) {
    localStorage.setItem(SEEN_KEY, "1");
    setOpen(false);
    router.push(`/growth?goal=${encodeURIComponent(goal)}&run=1`);
  }

  const steps = [
    // 0 — Hero
    <div key="hero" className="space-y-5">
      <DialogTitle className="text-2xl font-bold">
        Meet <span className="gradient-text">Compass</span>
      </DialogTitle>
      <DialogDescription className="text-base">
        A customer-engagement CRM with an AI growth copilot. Two ways to work — your choice, every time.
      </DialogDescription>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <MousePointerClick className="h-4 w-4 text-muted-foreground" /> Manual mode
          </div>
          <p className="text-sm text-muted-foreground">
            Import customers, build segments, write campaigns and launch them yourself — full control.
          </p>
        </div>
        <div className="rounded-xl border border-primary/20 bg-accent/40 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Wand2 className="h-4 w-4 text-primary" /> AI mode
          </div>
          <p className="text-sm text-muted-foreground">
            Describe an outcome. AI analyzes your data and builds everything — you review &amp; launch.
          </p>
        </div>
      </div>
    </div>,

    // 1 — AI Engagement
    <div key="ai" className="space-y-4">
      <DialogTitle className="flex items-center gap-2 text-xl font-bold">
        <Sparkles className="h-5 w-5 text-primary" /> AI Engagement
      </DialogTitle>
      <DialogDescription>Your primary workspace — the AI-powered marketing layer.</DialogDescription>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {AI_TABS.map((t) => (
          <div key={t.name} className="flex items-start gap-2.5 rounded-lg border bg-card p-3">
            <div className="ai-gradient mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
              <t.icon className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold">{t.name}</p>
              <p className="text-xs text-muted-foreground">{t.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>,

    // 2 — CRM
    <div key="crm" className="space-y-4">
      <DialogTitle className="text-xl font-bold">Your full CRM, intact</DialogTitle>
      <DialogDescription>
        Every traditional CRM module is still here under the collapsible <b>CRM</b> section in the sidebar.
      </DialogDescription>
      <div className="space-y-2.5">
        {CRM_TABS.map((t) => (
          <div key={t.name} className="flex items-start gap-3 rounded-lg border bg-card p-3">
            <t.icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">{t.name}</p>
              <p className="text-xs text-muted-foreground">{t.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>,

    // 3 — Try it
    <div key="try" className="space-y-4">
      <DialogTitle className="flex items-center gap-2 text-xl font-bold">
        <Rocket className="h-5 w-5 text-primary" /> Try it now
      </DialogTitle>
      <DialogDescription>
        Pick a goal and watch the Growth Assistant build a full campaign in seconds.
      </DialogDescription>
      <div className="space-y-2">
        {DEMO_GOALS.map((g) => (
          <button
            key={g}
            onClick={() => runDemo(g)}
            className="group flex w-full items-center justify-between rounded-lg border bg-card p-3 text-left text-sm transition-all hover:border-primary/40 hover:bg-accent/40"
          >
            <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> {g}</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
          </button>
        ))}
      </div>
    </div>,
  ];

  const last = step === steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        {/* Gradient header band */}
        <div className="ai-surface border-b px-6 py-5">{steps[step]}</div>

        {/* Footer: progress + nav + credit */}
        <div className="flex items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            )}
            {!last ? (
              <>
                <Button variant="ghost" size="sm" onClick={close}>Skip</Button>
                <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                  Next <ArrowRight className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={close}>
                <Check className="h-4 w-4" /> Done
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-center gap-1 border-t bg-muted/30 py-2 text-[11px] text-muted-foreground">
          Made with <Heart className="h-3 w-3 fill-rose-500 text-rose-500" /> by
          <span className="font-semibold text-foreground/70">Dhruv Jyoti Das</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
