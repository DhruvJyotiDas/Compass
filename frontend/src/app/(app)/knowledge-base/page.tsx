"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, ThumbsUp, Eye } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/crm/PageHeader";
import { DataTable, type Column } from "@/components/crm/DataTable";
import { RecordForm, type Field } from "@/components/crm/RecordForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth, can } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { SOLUTION_STATUSES, SOLUTION_CATEGORIES, opt, titleCase, STATUS_BADGE } from "@/lib/options";
import type { Solution } from "@/lib/types";

const FIELDS: Field[] = [
  { name: "title", label: "Title", required: true, full: true },
  { name: "body", label: "Body", type: "textarea", required: true },
  { name: "category", label: "Category", type: "select", options: opt(SOLUTION_CATEGORIES) },
  { name: "status", label: "Status", type: "select", options: opt(SOLUTION_STATUSES) },
];

export default function KnowledgeBasePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("published");
  const [sort, setSort] = useState("-created_at");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["solutions", { q, status, sort, page }],
    queryFn: () => api.listSolutions({ q, status, sort, page, per_page: 25 }),
  });

  const create = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.createSolution(v as Partial<Solution>),
    onSuccess: () => { toast.success("Solution created"); qc.invalidateQueries({ queryKey: ["solutions"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const columns: Column<Solution>[] = [
    { key: "title", header: "Title", render: (s) => <span className="font-medium">{s.title}</span> },
    { key: "category", header: "Category", render: (s) => (s.category ? titleCase(s.category) : "—") },
    { key: "status", header: "Status", render: (s) => <Badge variant={STATUS_BADGE[s.status] ?? "secondary"}>{titleCase(s.status)}</Badge> },
    { key: "views", header: "Views", render: (s) => <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{s.views}</span> },
    { key: "helpful_votes", header: "Helpful", render: (s) => <span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" />{s.helpful_votes}</span> },
    { key: "created_at", header: "Created", sortable: true, render: (s) => formatDate(s.created_at) },
  ];

  return (
    <div>
      <PageHeader
        title="Knowledge Base"
        subtitle={data ? `${data.total} solutions` : undefined}
        actions={can(user, "create") && <Button onClick={() => setFormOpen(true)}><Plus /> New Solution</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search solutions…" className="pl-9" />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">All</option>
          {SOLUTION_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </select>
      </div>
      <DataTable
        columns={columns} rows={data?.items ?? []} loading={isLoading}
        total={data?.total ?? 0} page={page} perPage={25} sort={sort}
        onSortChange={setSort} onPageChange={setPage}
        onRowClick={(s) => router.push(`/knowledge-base/${s.id}`)}
        emptyMessage="No solutions yet. Start building your knowledge base."
      />
      <RecordForm open={formOpen} onOpenChange={setFormOpen} title="New Solution" fields={FIELDS}
        initial={{ status: "draft" }}
        onSubmit={async (v) => { await create.mutateAsync(v); }} />
    </div>
  );
}
