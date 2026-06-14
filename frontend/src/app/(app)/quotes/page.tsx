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
import { formatCurrency, formatDate } from "@/lib/utils";
import { QUOTE_STATUSES, CURRENCIES, PAYMENT_TERMS, opt, titleCase, STATUS_BADGE } from "@/lib/options";
import type { Quote } from "@/lib/types";

const FIELDS: Field[] = [
  { name: "subject", label: "Subject", required: true, full: true },
  { name: "status", label: "Status", type: "select", options: opt(QUOTE_STATUSES) },
  { name: "valid_until", label: "Valid Until", type: "date" },
  { name: "currency", label: "Currency", type: "select", options: opt(CURRENCIES) },
  { name: "payment_terms", label: "Payment Terms", type: "select", options: opt(PAYMENT_TERMS) },
  { name: "discount_pct", label: "Discount %", type: "number" },
  { name: "tax_pct", label: "Tax %", type: "number" },
  { name: "notes", label: "Notes", type: "textarea" },
];

export default function QuotesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("-created_at");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["quotes", { q, status, sort, page }],
    queryFn: () => api.listQuotes({ q, status, sort, page, per_page: 25 }),
  });

  const create = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.createQuote(v as Partial<Quote>),
    onSuccess: () => { toast.success("Quote created"); qc.invalidateQueries({ queryKey: ["quotes"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const columns: Column<Quote>[] = [
    { key: "quote_number", header: "Number", render: (q) => <span className="font-mono text-xs font-medium">{q.quote_number}</span> },
    { key: "subject", header: "Subject", render: (q) => <span className="font-medium">{q.subject}</span> },
    { key: "status", header: "Status", render: (q) => <Badge variant={STATUS_BADGE[q.status] ?? "secondary"}>{titleCase(q.status)}</Badge> },
    { key: "total", header: "Total", sortable: true, render: (q) => formatCurrency(q.total, q.currency) },
    { key: "valid_until", header: "Valid Until", render: (q) => formatDate(q.valid_until) },
    { key: "created_at", header: "Created", sortable: true, render: (q) => formatDate(q.created_at) },
  ];

  return (
    <div>
      <PageHeader
        title="Quotes"
        subtitle={data ? `${data.total} quotes` : undefined}
        actions={can(user, "create") && <Button onClick={() => setFormOpen(true)}><Plus /> New Quote</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search quotes…" className="pl-9" />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">All statuses</option>
          {QUOTE_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </select>
      </div>
      <DataTable
        columns={columns} rows={data?.items ?? []} loading={isLoading}
        total={data?.total ?? 0} page={page} perPage={25} sort={sort}
        onSortChange={setSort} onPageChange={setPage}
        onRowClick={(q) => router.push(`/quotes/${q.id}`)}
        emptyMessage="No quotes yet."
      />
      <RecordForm open={formOpen} onOpenChange={setFormOpen} title="New Quote" fields={FIELDS}
        initial={{ status: "draft", currency: "USD", discount_pct: 0, tax_pct: 0 }}
        onSubmit={async (v) => { await create.mutateAsync(v); }} />
    </div>
  );
}
