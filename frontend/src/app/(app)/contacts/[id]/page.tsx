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
import { useAuth, can } from "@/lib/auth";
import { fullName } from "@/lib/utils";
import { LEAD_SOURCES, opt } from "@/lib/options";
import type { Contact } from "@/lib/types";

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);

  const { data: contact, isLoading } = useQuery({ queryKey: ["contact", id], queryFn: () => api.getContact(id) });
  const { data: accounts } = useQuery({ queryKey: ["accounts", "all"], queryFn: () => api.listAccounts({ per_page: 200 }) });
  const account = accounts?.items.find((a) => a.id === contact?.account_id);

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

  const update = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.updateContact(id, v as Partial<Contact>),
    onSuccess: () => { toast.success("Contact updated"); qc.invalidateQueries({ queryKey: ["contact", id] }); },
  });
  const del = useMutation({
    mutationFn: () => api.deleteContact(id),
    onSuccess: () => { toast.success("Contact deleted"); router.push("/contacts"); },
  });

  if (isLoading || !contact) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <>
      <DetailShell
        module="contact"
        recordId={id}
        title={fullName(contact.first_name, contact.last_name)}
        subtitle={
          <>
            {contact.title}
            {account && <> · <Link href={`/accounts/${account.id}`} className="text-primary hover:underline">{account.name}</Link></>}
          </>
        }
        actions={
          <>
            {can(user, "edit") && <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil /> Edit</Button>}
            {can(user, "delete") && <Button variant="outline" onClick={() => del.mutate()}><Trash2 className="text-destructive" /></Button>}
          </>
        }
        overview={
          <FieldGrid
            fields={[
              { label: "Email", value: contact.email },
              { label: "Phone", value: contact.phone },
              { label: "Mobile", value: contact.mobile },
              { label: "Title", value: contact.title },
              { label: "Department", value: contact.department },
              { label: "Account", value: account?.name },
              { label: "Description", value: contact.description },
            ]}
          />
        }
      />
      <RecordForm open={editOpen} onOpenChange={setEditOpen} title="Edit Contact" fields={fields} initial={contact as unknown as Record<string, unknown>} onSubmit={async (v) => { await update.mutateAsync(v); }} />
    </>
  );
}
