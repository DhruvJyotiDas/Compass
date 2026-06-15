"use client";

import { useCallback, useEffect, useState } from "react";
import { MessagesSquare, RefreshCw, X, Send, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { AiCampaign } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Comm = {
  id: string; customer_id: string; customer_name: string; channel: string;
  variant: string; status: string; job_status: string; attempts: number;
};
type CustomerComm = {
  id: string; channel: string; subject: string | null; message: string;
  status: string; created_at: string; campaign_name: string | null;
};

const STATUS_VARIANT: Record<string, "secondary" | "info" | "success" | "warning" | "danger"> = {
  pending: "secondary", sent: "info", delivered: "info", opened: "success",
  read: "success", clicked: "success", failed: "danger", queued: "secondary",
};

function CustomerDrawer({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const [history, setHistory] = useState<CustomerComm[] | null>(null);
  const [channel, setChannel] = useState("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    api.customerCommunications(id).then(setHistory).catch(() => setHistory([]));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function send() {
    if (!body.trim()) return;
    setSending(true);
    setNote(null);
    try {
      await api.sendDirectMessage(id, { channel, subject: subject || undefined, body });
      setBody(""); setSubject("");
      setNote(`Queued a ${channel} message — it'll dispatch shortly.`);
      setTimeout(load, 1200);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Send failed");
    } finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col border-l bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="font-semibold">{name}</h2>
            <p className="text-xs text-muted-foreground">Message history & direct outreach</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        {/* History */}
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {history === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages sent to this customer yet.</p>
          ) : (
            history.map((m) => (
              <div key={m.id} className="rounded-lg border p-3 text-sm">
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <Badge variant="secondary">{m.channel}</Badge>
                  <Badge variant={STATUS_VARIANT[m.status] ?? "secondary"}>{m.status}</Badge>
                  <span className="text-muted-foreground">{m.campaign_name ?? "Direct"}</span>
                  <span className="ml-auto text-muted-foreground">{new Date(m.created_at).toLocaleString()}</span>
                </div>
                {m.subject && <div className="font-medium">{m.subject}</div>}
                <p className="whitespace-pre-wrap text-muted-foreground">{m.message}</p>
              </div>
            ))
          )}
        </div>

        {/* Composer — direct mail / SMS */}
        <div className="space-y-2 border-t bg-muted/20 p-4">
          <div className="flex gap-2">
            {["email", "sms", "whatsapp"].map((ch) => (
              <button
                key={ch}
                onClick={() => setChannel(ch)}
                className={`rounded-md border px-3 py-1 text-xs capitalize ${channel === ch ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}
              >
                {ch}
              </button>
            ))}
          </div>
          {channel === "email" && (
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none"
            />
          )}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder={`Write a ${channel} message…`}
            className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none"
          />
          {note && <p className="text-xs text-muted-foreground">{note}</p>}
          <Button onClick={send} disabled={sending || !body.trim()} className="w-full">
            {sending ? <Loader2 className="animate-spin" /> : <Send />} Send {channel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function CommunicationsPage() {
  const [campaigns, setCampaigns] = useState<AiCampaign[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [comms, setComms] = useState<Comm[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawer, setDrawer] = useState<{ id: string; name: string } | null>(null);

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
          <p className="mt-0.5 text-sm text-muted-foreground">Click a customer to see their full history and message them directly</p>
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
                <tr
                  key={m.id}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => setDrawer({ id: m.customer_id, name: m.customer_name })}
                >
                  <td className="px-4 py-2.5 font-medium text-primary hover:underline">{m.customer_name}</td>
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

      {drawer && <CustomerDrawer id={drawer.id} name={drawer.name} onClose={() => setDrawer(null)} />}
    </div>
  );
}
