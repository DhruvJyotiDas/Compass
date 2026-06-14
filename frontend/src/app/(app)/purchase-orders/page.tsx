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
import { PO_STATUSES, CURRENCIES, PAYMENT_TERMS, opt, titleCase, STATUS_BADGE } from "@/lib/options";
import type { PurchaseOrder } from "@/lib/types";

const FIELDS: Field[] = [
  { name: "subject", label: "Subject", required: true, full: true },
  { name: "vendor_name", label: "Vendor Name" },
  { name: "vendor_email", label: "Vendor Email", type: "email" },
  { name: "vendor_phone", label: "Vendor Phone" },
  { name: "status", label: "Status", type: "select", options: opt(PO_STATUSES) },
  { name: "expected_delivery", label: "Expected Delivery", type: "date" },
  { name: "currency", label: "Currency", type: "select", options: opt(CURRENCIES) },
  { name: "payment_terms", label: "Payment Terms", type: "select", options: opt(PAYMENT_TERMS) },
  { name: "discount_pct", label: "Discount %", type: "number" },
  { name: "tax_pct", label: "Tax %", type: "number" },
  { name: "notes", label: "Notes", type: "textarea" },
];

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("-created_at");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["purchase-orders", { q, status, sort, page }],
    queryFn: () => api.listPurchaseOrders({ q, status, sort, page, per_page: 25 }),
  });

  const create = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.createPurchaseOrder(v as Partial<PurchaseOrder>),
    onSuccess: () => { toast.success("Purchase order created"); qc.invalidateQueries({ queryKey: ["purchase-orders"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const columns: Column<PurchaseOrder>[] = [
    { key: "po_number", header: "Number", render: (p) => <span className="font-mono text-xs font-medium">{p.po_number}</span> },
    { key: "subject", header: "Subject", render: (p) => <span className="font-medium">{p.subject}</span> },
    { key: "vendor_name", header: "Vendor", render: (p) => p.vendor_name ?? "—" },
    { key: "status", header: "Status", render: (p) => <Badge variant={STATUS_BADGE[p.status] ?? "secondary"}>{titleCase(p.status)}</Badge> },
    { key: "total", header: "Total", sortable: true, render: (p) => formatCurrency(p.total, p.currency) },
    { key: "expected_delivery", header: "Delivery", render: (p) => formatDate(p.expected_delivery) },
  ];

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        subtitle={data ? `${data.total} purchase orders` : undefined}
        actions={can(user, "create") && <Button onClick={() => setFormOpen(true)}><Plus /> New Purchase Order</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search purchase orders…" className="pl-9" />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">All statuses</option>
          {PO_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </select>
      </div>
      <DataTable
        columns={columns} rows={data?.items ?? []} loading={isLoading}
        total={data?.total ?? 0} page={page} perPage={25} sort={sort}
        onSortChange={setSort} onPageChange={setPage}
        onRowClick={(p) => router.push(`/purchase-orders/${p.id}`)}
        emptyMessage="No purchase orders yet."
      />
      <RecordForm open={formOpen} onOpenChange={setFormOpen} title="New Purchase Order" fields={FIELDS}
        initial={{ status: "draft", currency: "USD", discount_pct: 0, tax_pct: 0 }}
        onSubmit={async (v) => { await create.mutateAsync(v); }} />
    </div>
  );
}
