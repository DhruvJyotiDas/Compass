"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
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
import { CASE_STATUSES, CASE_PRIORITIES, CASE_TYPES, CASE_SOURCES, opt, titleCase, STATUS_BADGE } from "@/lib/options";
import type { Case } from "@/lib/types";

const FIELDS: Field[] = [
  { name: "subject", label: "Subject", required: true, full: true },
  { name: "description", label: "Description", type: "textarea" },
  { name: "status", label: "Status", type: "select", options: opt(CASE_STATUSES) },
  { name: "priority", label: "Priority", type: "select", options: opt(CASE_PRIORITIES) },
  { name: "type", label: "Type", type: "select", options: opt(CASE_TYPES) },
  { name: "source", label: "Source", type: "select", options: opt(CASE_SOURCES) },
];

export default function CasesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [sort, setSort] = useState("-created_at");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["cases", { q, status, priority, sort, page }],
    queryFn: () => api.listCases({ q, status, priority, sort, page, per_page: 25 }),
  });

  const create = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.createCase(v as Partial<Case>),
    onSuccess: () => { toast.success("Case created"); qc.invalidateQueries({ queryKey: ["cases"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const columns: Column<Case>[] = [
    { key: "case_number", header: "Case #", render: (c) => <span className="font-mono text-xs font-medium">{c.case_number}</span> },
    { key: "subject", header: "Subject", render: (c) => <span className="font-medium">{c.subject}</span> },
    { key: "status", header: "Status", render: (c) => <Badge variant={STATUS_BADGE[c.status] ?? "secondary"}>{titleCase(c.status)}</Badge> },
    { key: "priority", header: "Priority", render: (c) => <Badge variant={STATUS_BADGE[c.priority] ?? "secondary"}>{titleCase(c.priority)}</Badge> },
    { key: "type", header: "Type", render: (c) => (c.type ? titleCase(c.type) : "—") },
    { key: "source", header: "Source", render: (c) => (c.source ? titleCase(c.source) : "—") },
    { key: "created_at", header: "Created", sortable: true, render: (c) => formatDate(c.created_at) },
  ];

  return (
    <div>
      <PageHeader
        title="Cases"
        subtitle={data ? `${data.total} cases` : undefined}
        actions={can(user, "create") && <Button onClick={() => setFormOpen(true)}><Plus /> New Case</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search cases…" className="pl-9" />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">All statuses</option>
          {CASE_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </select>
        <select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">All priorities</option>
          {CASE_PRIORITIES.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
        </select>
      </div>
      <DataTable
        columns={columns} rows={data?.items ?? []} loading={isLoading}
        total={data?.total ?? 0} page={page} perPage={25} sort={sort}
        onSortChange={setSort} onPageChange={setPage}
        onRowClick={(c) => router.push(`/cases/${c.id}`)}
        emptyMessage="No cases yet."
      />
      <RecordForm open={formOpen} onOpenChange={setFormOpen} title="New Case" fields={FIELDS}
        initial={{ status: "new", priority: "medium" }}
        onSubmit={async (v) => { await create.mutateAsync(v); }} />
    </div>
  );
}
