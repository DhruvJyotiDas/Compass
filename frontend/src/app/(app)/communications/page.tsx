"use client";

import { useEffect, useState } from "react";
import { MessagesSquare, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import type { AiCampaign } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Comm = { id: string; customer_name: string; channel: string; variant: string; status: string; job_status: string; attempts: number };

const STATUS_VARIANT: Record<string, "secondary" | "info" | "success" | "warning" | "danger"> = {
  pending: "secondary", sent: "info", delivered: "info", opened: "success",
  read: "success", clicked: "success", failed: "danger",
};

export default function CommunicationsPage() {
  const [campaigns, setCampaigns] = useState<AiCampaign[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [comms, setComms] = useState<Comm[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.listAiCampaigns().then((cs) => {
      const launched = cs.filter((c) => c.status !== "draft");
      setCampaigns(launched);
      if (launched[0]) setSelected(launched[0].id);
    });
  }, []);

  const refresh = (cid: string) => {
    if (!cid) return;
    setLoading(true);
    api.campaignCommunications(cid).then(setComms).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { refresh(selected); }, [selected]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <MessagesSquare className="h-6 w-6 text-primary" /> Communications
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Per-customer delivery, retries and dead-letter state</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            {campaigns.length === 0 && <option value="">No launched campaigns</option>}
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name || "Untitled"}</option>)}
          </select>
          <Button variant="outline" size="icon" onClick={() => refresh(selected)} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Channel</th>
              <th className="px-4 py-3 font-medium">Variant</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Job</th>
              <th className="px-4 py-3 text-right font-medium">Attempts</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {comms.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                {loading ? "Loading…" : "No communications yet for this campaign."}
              </td></tr>
            ) : (
              comms.map((m) => (
                <tr key={m.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-medium">{m.customer_name}</td>
                  <td className="px-4 py-2.5">{m.channel}</td>
                  <td className="px-4 py-2.5">{m.variant}</td>
                  <td className="px-4 py-2.5"><Badge variant={STATUS_VARIANT[m.status] ?? "secondary"}>{m.status}</Badge></td>
                  <td className="px-4 py-2.5">
                    <Badge variant={m.job_status === "dead" ? "danger" : m.job_status === "done" ? "success" : "secondary"}>{m.job_status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{m.attempts}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
