"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Send, Sparkles, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import type { AiCampaign } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT: Record<string, "secondary" | "info" | "warning" | "success"> = {
  draft: "secondary",
  approved: "info",
  running: "warning",
  completed: "success",
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<AiCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listAiCampaigns().then(setCampaigns).catch(console.error).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Send className="h-6 w-6 text-primary" /> Campaigns
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">AI-built campaigns — review, launch and learn</p>
        </div>
        <Link href="/growth">
          <Button><Sparkles /> New with AI <ArrowRight /></Button>
        </Link>
      </div>

      {loading ? (
        <div className="py-10 text-center text-muted-foreground">Loading…</div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-primary/40" />
          <p className="mt-3 text-sm text-muted-foreground">No campaigns yet.</p>
          <Link href="/growth"><Button className="mt-4"><Sparkles /> Build your first campaign</Button></Link>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {campaigns.map((c) => (
            <Link key={c.id} href={`/campaigns/${c.id}`} className="card-lift rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold">{c.name || "Untitled campaign"}</h3>
                <Badge variant={STATUS_VARIANT[c.status] ?? "secondary"}>{c.status}</Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.goal_text}</p>
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                {c.audience_count != null && <span>{c.audience_count.toLocaleString()} recipients</span>}
                <span>{new Date(c.created_at).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
