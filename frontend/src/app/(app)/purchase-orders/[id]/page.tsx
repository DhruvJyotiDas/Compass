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
import { PO_STATUSES, CURRENCIES, PAYMENT_TERMS, opt, titleCase, STATUS_BADGE } from "@/lib/options";
import type { LineItem, PurchaseOrder } from "@/lib/types";

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

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [lineItemsEditing, setLineItemsEditing] = useState(false);
  const [pendingItems, setPendingItems] = useState<LineItem[]>([]);
  const [pendingDiscount, setPendingDiscount] = useState(0);
  const [pendingTax, setPendingTax] = useState(0);

  const { data: po, isLoading } = useQuery({ queryKey: ["purchase-order", id], queryFn: () => api.getPurchaseOrder(id) });

  const update = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.updatePurchaseOrder(id, v as Partial<PurchaseOrder>),
    onSuccess: () => { toast.success("Purchase order updated"); qc.invalidateQueries({ queryKey: ["purchase-order", id] }); },
  });
  const del = useMutation({
    mutationFn: () => api.deletePurchaseOrder(id),
    onSuccess: () => { toast.success("Purchase order deleted"); router.push("/purchase-orders"); },
  });

  if (isLoading || !po) return <p className="text-muted-foreground">Loading…</p>;

  function startEditItems() {
    setPendingItems(po!.line_items ?? []);
    setPendingDiscount(po!.discount_pct ?? 0);
    setPendingTax(po!.tax_pct ?? 0);
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
            <LineItemsEditor items={pendingItems} currency={po.currency} discountPct={pendingDiscount} taxPct={pendingTax}
              onChange={(items, disc, tax) => { setPendingItems(items); setPendingDiscount(disc); setPendingTax(tax); }} />
          ) : (
            <LineItemsEditor items={po.line_items ?? []} currency={po.currency} discountPct={po.discount_pct ?? 0} taxPct={po.tax_pct ?? 0} readOnly />
          )}
        </CardContent>
      </Card>
    ),
  };

  return (
    <>
      <DetailShell
        module="purchase_order"
        recordId={id}
        title={`${po.po_number} — ${po.subject}`}
        badges={
          <>
            <Badge variant={STATUS_BADGE[po.status] ?? "secondary"}>{titleCase(po.status)}</Badge>
            <span className="text-lg font-bold text-emerald-600">{formatCurrency(po.total, po.currency)}</span>
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
            { label: "PO #", value: po.po_number },
            { label: "Vendor", value: po.vendor_name },
            { label: "Vendor Email", value: po.vendor_email },
            { label: "Vendor Phone", value: po.vendor_phone },
            { label: "Status", value: <Badge variant={STATUS_BADGE[po.status] ?? "secondary"}>{titleCase(po.status)}</Badge> },
            { label: "Expected Delivery", value: formatDate(po.expected_delivery) },
            { label: "Subtotal", value: formatCurrency(po.subtotal, po.currency) },
            { label: "Total", value: <span className="font-bold text-emerald-600">{formatCurrency(po.total, po.currency)}</span> },
            { label: "Payment Terms", value: po.payment_terms },
          ]} />
        }
        extraTabs={[lineItemsTab]}
      />
      <RecordForm open={editOpen} onOpenChange={setEditOpen} title="Edit Purchase Order" fields={FIELDS}
        initial={po as unknown as Record<string, unknown>}
        onSubmit={async (v) => { await update.mutateAsync(v); }} />
    </>
  );
}
