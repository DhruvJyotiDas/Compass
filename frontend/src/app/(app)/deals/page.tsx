"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, LayoutGrid, List } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/crm/PageHeader";
import { DataTable, type Column } from "@/components/crm/DataTable";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { RecordForm, type Field } from "@/components/crm/RecordForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth, can } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DEAL_TYPES, LEAD_SOURCES, opt, titleCase, STATUS_BADGE } from "@/lib/options";
import type { Deal } from "@/lib/types";

export default function DealsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [view, setView] = useState<"board" | "list">("board");
  const [formOpen, setFormOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("-created_at");

  const { data: pipelines } = useQuery({ queryKey: ["pipelines"], queryFn: api.listPipelines });
  const pipeline = pipelines?.find((p) => p.is_default) ?? pipelines?.[0];
  const stages = useMemo(() => [...(pipeline?.stages ?? [])].sort((a, b) => a.sort_order - b.sort_order), [pipeline]);

  const { data: boardData } = useQuery({
    queryKey: ["deals", "board"],
    queryFn: () => api.listDeals({ per_page: 200, sort: "-created_at" }),
    enabled: view === "board",
  });
  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ["deals", "list", { page, sort }],
    queryFn: () => api.listDeals({ per_page: 25, page, sort }),
    enabled: view === "list",
  });
  const { data: accounts } = useQuery({ queryKey: ["accounts", "all"], queryFn: () => api.listAccounts({ per_page: 200 }) });

  const move = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) => api.moveDeal(id, stage),
    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey: ["deals", "board"] });
      const prev = qc.getQueryData<{ items: Deal[]; total: number; page: number; per_page: number }>(["deals", "board"]);
      if (prev) {
        qc.setQueryData(["deals", "board"], {
          ...prev,
          items: prev.items.map((d) => (d.id === id ? { ...d, stage_id: stage } : d)),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["deals", "board"], ctx.prev);
      toast.error("Could not move deal");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["deals"] }),
  });

  const create = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.createDeal({ ...v, pipeline_id: pipeline?.id } as Partial<Deal>),
    onSuccess: () => { toast.success("Deal created"); qc.invalidateQueries({ queryKey: ["deals"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const stageName = (sid: string) => stages.find((s) => s.id === sid)?.name ?? "—";

  const fields: Field[] = [
    { name: "name", label: "Deal name", required: true, full: true },
    { name: "account_id", label: "Account", type: "select", options: (accounts?.items ?? []).map((a) => ({ value: a.id, label: a.name })) },
    { name: "amount", label: "Amount", type: "number" },
    { name: "stage_id", label: "Stage", type: "select", options: stages.map((s) => ({ value: s.id, label: s.name })) },
    { name: "close_date", label: "Close date", type: "date" },
    { name: "type", label: "Type", type: "select", options: opt(DEAL_TYPES) },
    { name: "source", label: "Source", type: "select", options: opt(LEAD_SOURCES) },
    { name: "description", label: "Description", type: "textarea" },
  ];

  const columns: Column<Deal>[] = [
    { key: "name", header: "Deal", render: (d) => <span className="font-medium">{d.name}</span> },
    { key: "amount", header: "Amount", sortable: true, render: (d) => formatCurrency(d.amount, d.currency) },
    { key: "stage", header: "Stage", render: (d) => stageName(d.stage_id) },
    { key: "status", header: "Status", render: (d) => <Badge variant={STATUS_BADGE[d.status] ?? "secondary"}>{titleCase(d.status)}</Badge> },
    { key: "probability", header: "Prob.", render: (d) => `${d.probability ?? 0}%` },
    { key: "close_date", header: "Close date", sortable: true, render: (d) => formatDate(d.close_date) },
  ];

  return (
    <div>
      <PageHeader
        title="Deals"
        subtitle="Drag deals across stages to update your pipeline."
        actions={
          <>
            <div className="flex rounded-md border p-0.5">
              <Button variant={view === "board" ? "secondary" : "ghost"} size="sm" onClick={() => setView("board")}>
                <LayoutGrid /> Board
              </Button>
              <Button variant={view === "list" ? "secondary" : "ghost"} size="sm" onClick={() => setView("list")}>
                <List /> List
              </Button>
            </div>
            {can(user, "create") && <Button onClick={() => setFormOpen(true)}><Plus /> New Deal</Button>}
          </>
        }
      />

      {view === "board" ? (
        stages.length === 0 ? (
          <p className="text-muted-foreground">No pipeline configured.</p>
        ) : (
          <KanbanBoard
            stages={stages}
            deals={boardData?.items ?? []}
            onMove={(id, stage) => move.mutate({ id, stage })}
          />
        )
      ) : (
        <DataTable
          columns={columns}
          rows={listData?.items ?? []}
          loading={listLoading}
          total={listData?.total ?? 0}
          page={page}
          perPage={25}
          sort={sort}
          onSortChange={setSort}
          onPageChange={setPage}
          onRowClick={(d) => router.push(`/deals/${d.id}`)}
        />
      )}

      <RecordForm
        open={formOpen}
        onOpenChange={setFormOpen}
        title="New Deal"
        fields={fields}
        initial={{ stage_id: stages[0]?.id }}
        onSubmit={async (v) => { await create.mutateAsync(v); }}
      />
    </div>
  );
}
