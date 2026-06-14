"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { DetailShell, FieldGrid } from "@/components/crm/DetailShell";
import { RecordForm, type Field } from "@/components/crm/RecordForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { useAuth, can } from "@/lib/auth";
import { CASE_STATUSES, CASE_PRIORITIES, CASE_TYPES, CASE_SOURCES, opt, titleCase, STATUS_BADGE } from "@/lib/options";
import type { Case } from "@/lib/types";

const FIELDS: Field[] = [
  { name: "subject", label: "Subject", required: true, full: true },
  { name: "description", label: "Description", type: "textarea" },
  { name: "status", label: "Status", type: "select", options: opt(CASE_STATUSES) },
  { name: "priority", label: "Priority", type: "select", options: opt(CASE_PRIORITIES) },
  { name: "type", label: "Type", type: "select", options: opt(CASE_TYPES) },
  { name: "source", label: "Source", type: "select", options: opt(CASE_SOURCES) },
  { name: "resolution", label: "Resolution", type: "textarea" },
];

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);

  const { data: c, isLoading } = useQuery({ queryKey: ["case", id], queryFn: () => api.getCase(id) });

  const update = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.updateCase(id, v as Partial<Case>),
    onSuccess: () => { toast.success("Case updated"); qc.invalidateQueries({ queryKey: ["case", id] }); },
  });
  const del = useMutation({
    mutationFn: () => api.deleteCase(id),
    onSuccess: () => { toast.success("Case deleted"); router.push("/cases"); },
  });

  if (isLoading || !c) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <>
      <DetailShell
        module="case"
        recordId={id}
        title={`${c.case_number} — ${c.subject}`}
        badges={
          <>
            <Badge variant={STATUS_BADGE[c.status] ?? "secondary"}>{titleCase(c.status)}</Badge>
            <Badge variant={STATUS_BADGE[c.priority] ?? "secondary"}>{titleCase(c.priority)}</Badge>
          </>
        }
        actions={
          <>
            {can(user, "edit") && <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil /> Edit</Button>}
            {can(user, "delete") && <Button variant="outline" onClick={() => del.mutate()}><Trash2 className="text-destructive" /></Button>}
          </>
        }
        overview={
          <FieldGrid fields={[
            { label: "Case #", value: c.case_number },
            { label: "Status", value: <Badge variant={STATUS_BADGE[c.status] ?? "secondary"}>{titleCase(c.status)}</Badge> },
            { label: "Priority", value: <Badge variant={STATUS_BADGE[c.priority] ?? "secondary"}>{titleCase(c.priority)}</Badge> },
            { label: "Type", value: c.type ? titleCase(c.type) : null },
            { label: "Source", value: c.source ? titleCase(c.source) : null },
            { label: "Opened", value: formatDate(c.created_at) },
            { label: "Closed", value: formatDate(c.closed_at) },
            { label: "First Responded", value: formatDate(c.first_responded_at) },
            { label: "SLA Response Due", value: formatDate(c.sla_first_response_due) },
            { label: "SLA Resolution Due", value: formatDate(c.sla_resolution_due) },
            { label: "Description", value: c.description },
            { label: "Resolution", value: c.resolution },
          ]} />
        }
      />
      <RecordForm open={editOpen} onOpenChange={setEditOpen} title="Edit Case" fields={FIELDS}
        initial={c as unknown as Record<string, unknown>}
        onSubmit={async (v) => { await update.mutateAsync(v); }} />
    </>
  );
}
