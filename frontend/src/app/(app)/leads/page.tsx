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
import { fullName } from "@/lib/utils";
import { LEAD_SOURCES, LEAD_STATUSES, RATINGS, INDUSTRIES, opt, titleCase, STATUS_BADGE } from "@/lib/options";
import type { Lead } from "@/lib/types";

const FIELDS: Field[] = [
  { name: "first_name", label: "First name" },
  { name: "last_name", label: "Last name", required: true },
  { name: "company", label: "Company" },
  { name: "title", label: "Title" },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Phone" },
  { name: "source", label: "Source", type: "select", options: opt(LEAD_SOURCES) },
  { name: "status", label: "Status", type: "select", options: opt(LEAD_STATUSES) },
  { name: "rating", label: "Rating", type: "select", options: opt(RATINGS) },
  { name: "industry", label: "Industry", type: "select", options: opt(INDUSTRIES) },
  { name: "annual_revenue", label: "Annual revenue", type: "number" },
  { name: "no_of_employees", label: "Employees", type: "number" },
  { name: "description", label: "Description", type: "textarea" },
];

export default function LeadsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("-created_at");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["leads", { q, status, sort, page }],
    queryFn: () => api.listLeads({ q, status, sort, page, per_page: 25 }),
  });

  const create = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.createLead(v as Partial<Lead>),
    onSuccess: () => {
      toast.success("Lead created");
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const columns: Column<Lead>[] = [
    { key: "name", header: "Name", sortable: false, render: (l) => <span className="font-medium">{fullName(l.first_name, l.last_name)}</span> },
    { key: "company", header: "Company", render: (l) => l.company ?? "—" },
    { key: "email", header: "Email", render: (l) => l.email ?? "—" },
    { key: "status", header: "Status", render: (l) => <Badge variant={STATUS_BADGE[l.status] ?? "secondary"}>{titleCase(l.status)}</Badge> },
    { key: "rating", header: "Rating", render: (l) => (l.rating ? <Badge variant={STATUS_BADGE[l.rating] ?? "secondary"}>{titleCase(l.rating)}</Badge> : "—") },
    { key: "score", header: "Score", sortable: true, render: (l) => l.score },
    { key: "source", header: "Source", render: (l) => (l.source ? titleCase(l.source) : "—") },
  ];

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle={data ? `${data.total} leads` : undefined}
        actions={
          can(user, "create") && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus /> New Lead
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search leads…" className="pl-9" />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>{titleCase(s)}</option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        loading={isLoading}
        total={data?.total ?? 0}
        page={page}
        perPage={25}
        sort={sort}
        onSortChange={setSort}
        onPageChange={setPage}
        onRowClick={(l) => router.push(`/leads/${l.id}`)}
        emptyMessage="No leads yet. Create your first lead."
      />

      <RecordForm
        open={formOpen}
        onOpenChange={setFormOpen}
        title="New Lead"
        fields={FIELDS}
        initial={{ status: "new" }}
        onSubmit={async (v) => { await create.mutateAsync(v); }}
      />
    </div>
  );
}
