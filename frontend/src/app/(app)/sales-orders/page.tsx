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
import { SO_STATUSES, CURRENCIES, PAYMENT_TERMS, opt, titleCase, STATUS_BADGE } from "@/lib/options";
import type { SalesOrder } from "@/lib/types";

const FIELDS: Field[] = [
  { name: "subject", label: "Subject", required: true, full: true },
  { name: "status", label: "Status", type: "select", options: opt(SO_STATUSES) },
  { name: "expected_ship_date", label: "Expected Ship Date", type: "date" },
  { name: "currency", label: "Currency", type: "select", options: opt(CURRENCIES) },
  { name: "payment_terms", label: "Payment Terms", type: "select", options: opt(PAYMENT_TERMS) },
  { name: "discount_pct", label: "Discount %", type: "number" },
  { name: "tax_pct", label: "Tax %", type: "number" },
  { name: "notes", label: "Notes", type: "textarea" },
];

export default function SalesOrdersPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("-created_at");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["sales-orders", { q, status, sort, page }],
    queryFn: () => api.listSalesOrders({ q, status, sort, page, per_page: 25 }),
  });

  const create = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.createSalesOrder(v as Partial<SalesOrder>),
    onSuccess: () => { toast.success("Sales order created"); qc.invalidateQueries({ queryKey: ["sales-orders"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const columns: Column<SalesOrder>[] = [
    { key: "so_number", header: "Number", render: (s) => <span className="font-mono text-xs font-medium">{s.so_number}</span> },
    { key: "subject", header: "Subject", render: (s) => <span className="font-medium">{s.subject}</span> },
    { key: "status", header: "Status", render: (s) => <Badge variant={STATUS_BADGE[s.status] ?? "secondary"}>{titleCase(s.status)}</Badge> },
    { key: "total", header: "Total", sortable: true, render: (s) => formatCurrency(s.total, s.currency) },
    { key: "expected_ship_date", header: "Ship Date", render: (s) => formatDate(s.expected_ship_date) },
    { key: "created_at", header: "Created", sortable: true, render: (s) => formatDate(s.created_at) },
  ];

  return (
    <div>
      <PageHeader
        title="Sales Orders"
        subtitle={data ? `${data.total} sales orders` : undefined}
        actions={can(user, "create") && <Button onClick={() => setFormOpen(true)}><Plus /> New Sales Order</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search sales orders…" className="pl-9" />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">All statuses</option>
          {SO_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </select>
      </div>
      <DataTable
        columns={columns} rows={data?.items ?? []} loading={isLoading}
        total={data?.total ?? 0} page={page} perPage={25} sort={sort}
        onSortChange={setSort} onPageChange={setPage}
        onRowClick={(s) => router.push(`/sales-orders/${s.id}`)}
        emptyMessage="No sales orders yet."
      />
      <RecordForm open={formOpen} onOpenChange={setFormOpen} title="New Sales Order" fields={FIELDS}
        initial={{ status: "pending", currency: "USD", discount_pct: 0, tax_pct: 0 }}
        onSubmit={async (v) => { await create.mutateAsync(v); }} />
    </div>
  );
}
