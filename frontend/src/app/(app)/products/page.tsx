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
import { formatCurrency } from "@/lib/utils";
import { PRODUCT_CATEGORIES, CURRENCIES, opt, titleCase } from "@/lib/options";
import type { Product } from "@/lib/types";

const FIELDS: Field[] = [
  { name: "name", label: "Name", required: true },
  { name: "code", label: "Product Code" },
  { name: "category", label: "Category", type: "select", options: opt(PRODUCT_CATEGORIES) },
  { name: "unit_price", label: "Unit Price", type: "number" },
  { name: "tax_rate", label: "Tax Rate (%)", type: "number" },
  { name: "currency", label: "Currency", type: "select", options: opt(CURRENCIES) },
  { name: "description", label: "Description", type: "textarea" },
];

export default function ProductsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["products", { q, category, sort, page }],
    queryFn: () => api.listProducts({ q, category, sort, page, per_page: 25 }),
  });

  const create = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.createProduct(v as Partial<Product>),
    onSuccess: () => { toast.success("Product created"); qc.invalidateQueries({ queryKey: ["products"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const columns: Column<Product>[] = [
    { key: "name", header: "Name", sortable: true, render: (p) => <span className="font-medium">{p.name}</span> },
    { key: "code", header: "Code", render: (p) => p.code ?? "—" },
    { key: "category", header: "Category", render: (p) => (p.category ? titleCase(p.category) : "—") },
    { key: "unit_price", header: "Unit Price", sortable: true, render: (p) => formatCurrency(p.unit_price, p.currency) },
    { key: "tax_rate", header: "Tax %", render: (p) => `${p.tax_rate}%` },
    { key: "is_active", header: "Status", render: (p) => <Badge variant={p.is_active ? "success" : "secondary"}>{p.is_active ? "Active" : "Inactive"}</Badge> },
  ];

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={data ? `${data.total} products` : undefined}
        actions={can(user, "create") && <Button onClick={() => setFormOpen(true)}><Plus /> New Product</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search products…" className="pl-9" />
        </div>
        <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">All categories</option>
          {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <DataTable
        columns={columns} rows={data?.items ?? []} loading={isLoading}
        total={data?.total ?? 0} page={page} perPage={25} sort={sort}
        onSortChange={setSort} onPageChange={setPage}
        onRowClick={(p) => router.push(`/products/${p.id}`)}
        emptyMessage="No products yet."
      />
      <RecordForm open={formOpen} onOpenChange={setFormOpen} title="New Product" fields={FIELDS}
        initial={{ unit_price: 0, tax_rate: 0, currency: "USD", is_active: true }}
        onSubmit={async (v) => { await create.mutateAsync(v); }} />
    </div>
  );
}
