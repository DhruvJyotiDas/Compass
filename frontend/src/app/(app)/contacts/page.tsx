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
import { useAuth, can } from "@/lib/auth";
import { fullName } from "@/lib/utils";
import { LEAD_SOURCES, opt } from "@/lib/options";
import type { Contact } from "@/lib/types";

export default function ContactsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("-created_at");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["contacts", { q, sort, page }],
    queryFn: () => api.listContacts({ q, sort, page, per_page: 25 }),
  });
  const { data: accounts } = useQuery({ queryKey: ["accounts", "all"], queryFn: () => api.listAccounts({ per_page: 200 }) });

  const fields: Field[] = [
    { name: "first_name", label: "First name" },
    { name: "last_name", label: "Last name", required: true },
    { name: "account_id", label: "Account", type: "select", options: (accounts?.items ?? []).map((a) => ({ value: a.id, label: a.name })) },
    { name: "title", label: "Title" },
    { name: "department", label: "Department" },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone" },
    { name: "mobile", label: "Mobile" },
    { name: "source", label: "Source", type: "select", options: opt(LEAD_SOURCES) },
    { name: "description", label: "Description", type: "textarea" },
  ];

  const create = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.createContact(v as Partial<Contact>),
    onSuccess: () => { toast.success("Contact created"); qc.invalidateQueries({ queryKey: ["contacts"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const accName = (aid?: string | null) => accounts?.items.find((a) => a.id === aid)?.name ?? "—";

  const columns: Column<Contact>[] = [
    { key: "name", header: "Name", render: (c) => <span className="font-medium">{fullName(c.first_name, c.last_name)}</span> },
    { key: "title", header: "Title", render: (c) => c.title ?? "—" },
    { key: "account", header: "Account", render: (c) => accName(c.account_id) },
    { key: "email", header: "Email", render: (c) => c.email ?? "—" },
    { key: "phone", header: "Phone", render: (c) => c.phone ?? "—" },
  ];

  return (
    <div>
      <PageHeader
        title="Contacts"
        subtitle={data ? `${data.total} contacts` : undefined}
        actions={can(user, "create") && <Button onClick={() => setFormOpen(true)}><Plus /> New Contact</Button>}
      />
      <div className="mb-4 flex items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search contacts…" className="pl-9" />
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
        onRowClick={(c) => router.push(`/contacts/${c.id}`)}
        emptyMessage="No contacts yet."
      />
      <RecordForm open={formOpen} onOpenChange={setFormOpen} title="New Contact" fields={fields} onSubmit={async (v) => { await create.mutateAsync(v); }} />
    </div>
  );
}
