"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { api } from "@/lib/api";
import { DetailShell, FieldGrid } from "@/components/crm/DetailShell";
import { RecordForm, type Field } from "@/components/crm/RecordForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { useAuth, can } from "@/lib/auth";
import { DEAL_TYPES, LEAD_SOURCES, opt, titleCase, STATUS_BADGE } from "@/lib/options";
import type { Deal } from "@/lib/types";

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);

  const { data: deal, isLoading } = useQuery({ queryKey: ["deal", id], queryFn: () => api.getDeal(id) });
  const { data: pipelines } = useQuery({ queryKey: ["pipelines"], queryFn: api.listPipelines });
  const { data: accounts } = useQuery({ queryKey: ["accounts", "all"], queryFn: () => api.listAccounts({ per_page: 200 }) });

  const pipeline = pipelines?.find((p) => p.id === deal?.pipeline_id);
  const stages = useMemo(() => [...(pipeline?.stages ?? [])].sort((a, b) => a.sort_order - b.sort_order), [pipeline]);
  const account = accounts?.items.find((a) => a.id === deal?.account_id);
  const currentIdx = stages.findIndex((s) => s.id === deal?.stage_id);

  const move = useMutation({
    mutationFn: (stageId: string) => api.moveDeal(id, stageId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["deal", id] }); qc.invalidateQueries({ queryKey: ["deals"] }); },
  });
  const update = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.updateDeal(id, v as Partial<Deal>),
    onSuccess: () => { toast.success("Deal updated"); qc.invalidateQueries({ queryKey: ["deal", id] }); },
  });
  const del = useMutation({
    mutationFn: () => api.deleteDeal(id),
    onSuccess: () => { toast.success("Deal deleted"); router.push("/deals"); },
  });

  if (isLoading || !deal) return <p className="text-muted-foreground">Loading…</p>;

  const fields: Field[] = [
    { name: "name", label: "Deal name", required: true, full: true },
    { name: "amount", label: "Amount", type: "number" },
    { name: "close_date", label: "Close date", type: "date" },
    { name: "type", label: "Type", type: "select", options: opt(DEAL_TYPES) },
    { name: "source", label: "Source", type: "select", options: opt(LEAD_SOURCES) },
    { name: "description", label: "Description", type: "textarea" },
  ];

  return (
    <>
      <DetailShell
        module="deal"
        recordId={id}
        title={deal.name}
        subtitle={account && <Link href={`/accounts/${account.id}`} className="text-primary hover:underline">{account.name}</Link>}
        badges={
          <>
            <Badge variant={STATUS_BADGE[deal.status] ?? "secondary"}>{titleCase(deal.status)}</Badge>
            <span className="text-lg font-bold text-emerald-600">{formatCurrency(deal.amount, deal.currency)}</span>
          </>
        }
        actions={
          <>
            {can(user, "edit") && <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil /> Edit</Button>}
            {can(user, "delete") && <Button variant="outline" onClick={() => del.mutate()}><Trash2 className="text-destructive" /></Button>}
          </>
        }
        overview={
          <div className="space-y-6">
            {/* Stage progress */}
            <div>
              <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Pipeline stage</div>
              <div className="flex flex-wrap gap-1">
                {stages.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => can(user, "edit") && move.mutate(s.id)}
                    disabled={!can(user, "edit")}
                    className={cn(
                      "relative flex-1 min-w-[90px] rounded-md px-3 py-2 text-xs font-medium transition-colors",
                      i <= currentIdx
                        ? s.type === "lost"
                          ? "bg-red-500 text-white"
                          : "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/70"
                    )}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
            <FieldGrid
              fields={[
                { label: "Amount", value: formatCurrency(deal.amount, deal.currency) },
                { label: "Probability", value: `${deal.probability ?? 0}%` },
                { label: "Close date", value: formatDate(deal.close_date) },
                { label: "Type", value: deal.type ? titleCase(deal.type) : null },
                { label: "Source", value: deal.source ? titleCase(deal.source) : null },
                { label: "Account", value: account?.name },
                { label: "Description", value: deal.description },
              ]}
            />
          </div>
        }
      />
      <RecordForm open={editOpen} onOpenChange={setEditOpen} title="Edit Deal" fields={fields} initial={deal as unknown as Record<string, unknown>} onSubmit={async (v) => { await update.mutateAsync(v); }} />
    </>
  );
}
