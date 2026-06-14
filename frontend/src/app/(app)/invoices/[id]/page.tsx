"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { DetailShell, FieldGrid } from "@/components/crm/DetailShell";
import { RecordForm, type Field } from "@/components/crm/RecordForm";
import { LineItemsEditor } from "@/components/crm/LineItemsEditor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuth, can } from "@/lib/auth";
import { INVOICE_STATUSES, CURRENCIES, PAYMENT_TERMS, opt, titleCase, STATUS_BADGE } from "@/lib/options";
import type { Invoice, LineItem } from "@/lib/types";

const FIELDS: Field[] = [
  { name: "subject", label: "Subject", required: true, full: true },
  { name: "status", label: "Status", type: "select", options: opt(INVOICE_STATUSES) },
  { name: "due_date", label: "Due Date", type: "date" },
  { name: "currency", label: "Currency", type: "select", options: opt(CURRENCIES) },
  { name: "payment_terms", label: "Payment Terms", type: "select", options: opt(PAYMENT_TERMS) },
  { name: "discount_pct", label: "Discount %", type: "number" },
  { name: "tax_pct", label: "Tax %", type: "number" },
  { name: "notes", label: "Notes", type: "textarea" },
];

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [lineItemsEditing, setLineItemsEditing] = useState(false);
  const [pendingItems, setPendingItems] = useState<LineItem[]>([]);
  const [pendingDiscount, setPendingDiscount] = useState(0);
  const [pendingTax, setPendingTax] = useState(0);

  const { data: inv, isLoading } = useQuery({ queryKey: ["invoice", id], queryFn: () => api.getInvoice(id) });

  const update = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.updateInvoice(id, v as Partial<Invoice>),
    onSuccess: () => { toast.success("Invoice updated"); qc.invalidateQueries({ queryKey: ["invoice", id] }); },
  });
  const del = useMutation({
    mutationFn: () => api.deleteInvoice(id),
    onSuccess: () => { toast.success("Invoice deleted"); router.push("/invoices"); },
  });

  if (isLoading || !inv) return <p className="text-muted-foreground">Loading…</p>;

  function startEditItems() {
    setPendingItems(inv!.line_items ?? []);
    setPendingDiscount(inv!.discount_pct ?? 0);
    setPendingTax(inv!.tax_pct ?? 0);
    setLineItemsEditing(true);
  }

  async function saveItems() {
    await update.mutateAsync({ line_items: pendingItems, discount_pct: pendingDiscount, tax_pct: pendingTax });
    setLineItemsEditing(false);
  }

  const lineItemsTab = {
    value: "line-items",
    label: "Line Items",
    content: (
      <Card>
        <CardContent className="pt-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-medium">Line Items</h3>
            {can(user, "edit") && !lineItemsEditing && (
              <Button variant="outline" size="sm" onClick={startEditItems}><Pencil className="h-4 w-4" /> Edit</Button>
            )}
            {lineItemsEditing && (
              <div className="flex gap-2">
                <Button size="sm" onClick={saveItems} disabled={update.isPending}>Save</Button>
                <Button variant="outline" size="sm" onClick={() => setLineItemsEditing(false)}>Cancel</Button>
              </div>
            )}
          </div>
          {lineItemsEditing ? (
            <LineItemsEditor items={pendingItems} currency={inv.currency} discountPct={pendingDiscount} taxPct={pendingTax}
              onChange={(items, disc, tax) => { setPendingItems(items); setPendingDiscount(disc); setPendingTax(tax); }} />
          ) : (
            <LineItemsEditor items={inv.line_items ?? []} currency={inv.currency} discountPct={inv.discount_pct ?? 0} taxPct={inv.tax_pct ?? 0} readOnly />
          )}
        </CardContent>
      </Card>
    ),
  };

  return (
    <>
      <DetailShell
        module="invoice"
        recordId={id}
        title={`${inv.invoice_number} — ${inv.subject}`}
        badges={
          <>
            <Badge variant={STATUS_BADGE[inv.status] ?? "secondary"}>{titleCase(inv.status)}</Badge>
            <span className="text-lg font-bold text-emerald-600">{formatCurrency(inv.total, inv.currency)}</span>
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
            { label: "Invoice #", value: inv.invoice_number },
            { label: "Status", value: <Badge variant={STATUS_BADGE[inv.status] ?? "secondary"}>{titleCase(inv.status)}</Badge> },
            { label: "Due Date", value: formatDate(inv.due_date) },
            { label: "Subtotal", value: formatCurrency(inv.subtotal, inv.currency) },
            { label: "Discount", value: `${inv.discount_pct ?? 0}%` },
            { label: "Tax", value: `${inv.tax_pct ?? 0}%` },
            { label: "Total", value: <span className="font-bold text-emerald-600">{formatCurrency(inv.total, inv.currency)}</span> },
            { label: "Payment Terms", value: inv.payment_terms },
            { label: "Notes", value: inv.notes },
          ]} />
        }
        extraTabs={[lineItemsTab]}
      />
      <RecordForm open={editOpen} onOpenChange={setEditOpen} title="Edit Invoice" fields={FIELDS}
        initial={inv as unknown as Record<string, unknown>}
        onSubmit={async (v) => { await update.mutateAsync(v); }} />
    </>
  );
}
