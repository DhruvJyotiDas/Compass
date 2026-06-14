"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { DetailShell, FieldGrid } from "@/components/crm/DetailShell";
import { RecordForm, type Field } from "@/components/crm/RecordForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth, can } from "@/lib/auth";
import { fullName, formatCurrency } from "@/lib/utils";
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
  { name: "description", label: "Description", type: "textarea" },
];

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);

  const { data: lead, isLoading } = useQuery({ queryKey: ["lead", id], queryFn: () => api.getLead(id) });

  const update = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.updateLead(id, v as Partial<Lead>),
    onSuccess: () => { toast.success("Lead updated"); qc.invalidateQueries({ queryKey: ["lead", id] }); },
  });
  const del = useMutation({
    mutationFn: () => api.deleteLead(id),
    onSuccess: () => { toast.success("Lead deleted"); router.push("/leads"); },
  });
  const convert = useMutation({
    mutationFn: () => api.convertLead(id, { create_deal: true }),
    onSuccess: (res) => {
      toast.success("Lead converted to account, contact & deal");
      qc.invalidateQueries({ queryKey: ["lead", id] });
      setConvertOpen(false);
      if (res.deal_id) router.push(`/deals/${res.deal_id}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (isLoading || !lead) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <>
      <DetailShell
        module="lead"
        recordId={id}
        title={fullName(lead.first_name, lead.last_name)}
        subtitle={<>{lead.title}{lead.company ? ` · ${lead.company}` : ""}</>}
        badges={
          <>
            <Badge variant={STATUS_BADGE[lead.status] ?? "secondary"}>{titleCase(lead.status)}</Badge>
            {lead.rating && <Badge variant={STATUS_BADGE[lead.rating] ?? "secondary"}>{titleCase(lead.rating)} lead</Badge>}
            <Badge variant="outline">Score {lead.score}</Badge>
            {lead.converted && <Badge variant="success">Converted</Badge>}
          </>
        }
        actions={
          <>
            {!lead.converted && can(user, "create") && (
              <Button onClick={() => setConvertOpen(true)}><UserCheck /> Convert</Button>
            )}
            {can(user, "edit") && (
              <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil /> Edit</Button>
            )}
            {can(user, "delete") && (
              <Button variant="outline" onClick={() => del.mutate()}><Trash2 className="text-destructive" /></Button>
            )}
          </>
        }
        overview={
          <FieldGrid
            fields={[
              { label: "Email", value: lead.email },
              { label: "Phone", value: lead.phone },
              { label: "Company", value: lead.company },
              { label: "Title", value: lead.title },
              { label: "Industry", value: lead.industry },
              { label: "Source", value: lead.source ? titleCase(lead.source) : null },
              { label: "Annual revenue", value: lead.annual_revenue ? formatCurrency(lead.annual_revenue) : null },
              { label: "Employees", value: lead.no_of_employees },
              { label: "Location", value: [lead.city, lead.state, lead.country].filter(Boolean).join(", ") || null },
              { label: "Description", value: lead.description },
            ]}
          />
        }
      />

      <RecordForm
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit Lead"
        fields={FIELDS}
        initial={lead as unknown as Record<string, unknown>}
        onSubmit={async (v) => { await update.mutateAsync(v); }}
      />

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert lead</DialogTitle>
            <DialogDescription>
              This creates an <strong>Account</strong>, a <strong>Contact</strong>, and an open <strong>Deal</strong> from this lead. The lead will be marked converted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertOpen(false)}>Cancel</Button>
            <Button onClick={() => convert.mutate()} disabled={convert.isPending}>
              {convert.isPending ? "Converting…" : "Convert lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
