"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { api } from "@/lib/api";
import { DetailShell, FieldGrid } from "@/components/crm/DetailShell";
import { RecordForm, type Field } from "@/components/crm/RecordForm";
import { Button } from "@/components/ui/button";
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
  { name: "description", label: "Description", type: "textarea" },
];

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);

  const { data: account, isLoading } = useQuery({ queryKey: ["account", id], queryFn: () => api.getAccount(id) });
  const { data: contacts } = useQuery({ queryKey: ["contacts", { account_id: id }], queryFn: () => api.listContacts({ account_id: id, per_page: 100 }) });
  const { data: deals } = useQuery({ queryKey: ["deals", { account_id: id }], queryFn: () => api.listDeals({ per_page: 100 }) });

  const update = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.updateAccount(id, v as Partial<Account>),
    onSuccess: () => { toast.success("Account updated"); qc.invalidateQueries({ queryKey: ["account", id] }); },
  });
  const del = useMutation({
    mutationFn: () => api.deleteAccount(id),
    onSuccess: () => { toast.success("Account deleted"); router.push("/accounts"); },
  });

  if (isLoading || !account) return <p className="text-muted-foreground">Loading…</p>;
  const accountDeals = (deals?.items ?? []).filter((d) => d.account_id === id);

  return (
    <>
      <DetailShell
        module="account"
        recordId={id}
        title={account.name}
        subtitle={<>{account.industry}{account.website ? ` · ${account.website}` : ""}</>}
        badges={account.type && <Badge variant="secondary">{titleCase(account.type)}</Badge>}
        actions={
          <>
            {can(user, "edit") && <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil /> Edit</Button>}
            {can(user, "delete") && <Button variant="outline" onClick={() => del.mutate()}><Trash2 className="text-destructive" /></Button>}
          </>
        }
        overview={
          <FieldGrid
            fields={[
              { label: "Phone", value: account.phone },
              { label: "Email", value: account.email },
              { label: "Website", value: account.website },
              { label: "Revenue", value: account.annual_revenue ? formatCurrency(account.annual_revenue) : null },
              { label: "Employees", value: account.no_of_employees },
              { label: "Location", value: [account.billing_city, account.billing_country].filter(Boolean).join(", ") || null },
              { label: "Description", value: account.description },
            ]}
          />
        }
        extraTabs={[
          {
            value: "related",
            label: `Contacts & Deals`,
            content: (
              <div className="space-y-6">
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Contacts ({contacts?.items.length ?? 0})</h3>
                  <div className="space-y-1">
                    {(contacts?.items ?? []).map((c) => (
                      <Link key={c.id} href={`/contacts/${c.id}`} className="block rounded-lg border bg-card px-3 py-2 text-sm hover:bg-accent">
                        {c.first_name} {c.last_name} <span className="text-muted-foreground">· {c.title ?? ""}</span>
                      </Link>
                    ))}
                    {(contacts?.items.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No contacts.</p>}
                  </div>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Deals ({accountDeals.length})</h3>
                  <div className="space-y-1">
                    {accountDeals.map((d) => (
                      <Link key={d.id} href={`/deals/${d.id}`} className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm hover:bg-accent">
                        <span>{d.name}</span>
                        <span className="font-medium">{formatCurrency(d.amount, d.currency)}</span>
                      </Link>
                    ))}
                    {accountDeals.length === 0 && <p className="text-sm text-muted-foreground">No deals.</p>}
                  </div>
                </div>
              </div>
            ),
          },
        ]}
      />
      <RecordForm open={editOpen} onOpenChange={setEditOpen} title="Edit Account" fields={FIELDS} initial={account as unknown as Record<string, unknown>} onSubmit={async (v) => { await update.mutateAsync(v); }} />
    </>
  );
}
