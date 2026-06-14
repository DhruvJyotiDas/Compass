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
import { ACCOUNT_TYPES, INDUSTRIES, opt, titleCase } from "@/lib/options";
import type { Account } from "@/lib/types";

const FIELDS: Field[] = [
  { name: "name", label: "Account name", required: true, full: true },
  { name: "industry", label: "Industry", type: "select", options: opt(INDUSTRIES) },
  { name: "type", label: "Type", type: "select", options: opt(ACCOUNT_TYPES) },
  { name: "website", label: "Website" },
  { name: "phone", label: "Phone" },
  { name: "email", label: "Email", type: "email" },
  { name: "annual_revenue", label: "Annual revenue", type: "number" },
  { name: "no_of_employees", label: "Employees", type: "number" },
  { name: "billing_city", label: "City" },
  { name: "billing_country", label: "Country" },
  { name: "description", label: "Description", type: "textarea" },
];

export default function AccountsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("-created_at");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["accounts", { q, sort, page }],
    queryFn: () => api.listAccounts({ q, sort, page, per_page: 25 }),
  });
  const create = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.createAccount(v as Partial<Account>),
    onSuccess: () => { toast.success("Account created"); qc.invalidateQueries({ queryKey: ["accounts"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const columns: Column<Account>[] = [
    { key: "name", header: "Account", sortable: true, render: (a) => <span className="font-medium">{a.name}</span> },
    { key: "industry", header: "Industry", render: (a) => a.industry ?? "—" },
    { key: "type", header: "Type", render: (a) => (a.type ? <Badge variant="secondary">{titleCase(a.type)}</Badge> : "—") },
    { key: "annual_revenue", header: "Revenue", sortable: true, render: (a) => formatCurrency(a.annual_revenue) },
    { key: "no_of_employees", header: "Employees", render: (a) => a.no_of_employees ?? "—" },
    { key: "phone", header: "Phone", render: (a) => a.phone ?? "—" },
  ];

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle={data ? `${data.total} accounts` : undefined}
        actions={can(user, "create") && <Button onClick={() => setFormOpen(true)}><Plus /> New Account</Button>}
      />
      <div className="mb-4 flex items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search accounts…" className="pl-9" />
        </div>
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
        onRowClick={(a) => router.push(`/accounts/${a.id}`)}
        emptyMessage="No accounts yet."
      />
      <RecordForm open={formOpen} onOpenChange={setFormOpen} title="New Account" fields={FIELDS} onSubmit={async (v) => { await create.mutateAsync(v); }} />
    </div>
  );
}
