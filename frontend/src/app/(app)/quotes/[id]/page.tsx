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
import { QUOTE_STATUSES, CURRENCIES, PAYMENT_TERMS, opt, titleCase, STATUS_BADGE } from "@/lib/options";
import type { LineItem, Quote } from "@/lib/types";

const FIELDS: Field[] = [
  { name: "subject", label: "Subject", required: true, full: true },
  { name: "status", label: "Status", type: "select", options: opt(QUOTE_STATUSES) },
  { name: "valid_until", label: "Valid Until", type: "date" },
  { name: "currency", label: "Currency", type: "select", options: opt(CURRENCIES) },
  { name: "payment_terms", label: "Payment Terms", type: "select", options: opt(PAYMENT_TERMS) },
  { name: "discount_pct", label: "Discount %", type: "number" },
  { name: "tax_pct", label: "Tax %", type: "number" },
  { name: "notes", label: "Notes", type: "textarea" },
  { name: "terms_and_conditions", label: "Terms & Conditions", type: "textarea" },
];

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [lineItemsEditing, setLineItemsEditing] = useState(false);
  const [pendingItems, setPendingItems] = useState<LineItem[]>([]);
  const [pendingDiscount, setPendingDiscount] = useState(0);
  const [pendingTax, setPendingTax] = useState(0);

  const { data: quote, isLoading } = useQuery({ queryKey: ["quote", id], queryFn: () => api.getQuote(id) });

  const update = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.updateQuote(id, v as Partial<Quote>),
    onSuccess: () => { toast.success("Quote updated"); qc.invalidateQueries({ queryKey: ["quote", id] }); },
  });
  const del = useMutation({
    mutationFn: () => api.deleteQuote(id),
    onSuccess: () => { toast.success("Quote deleted"); router.push("/quotes"); },
  });

  if (isLoading || !quote) return <p className="text-muted-foreground">Loading…</p>;

  function startEditItems() {
    setPendingItems(quote!.line_items ?? []);
    setPendingDiscount(quote!.discount_pct ?? 0);
    setPendingTax(quote!.tax_pct ?? 0);
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
            <LineItemsEditor
              items={pendingItems}
              currency={quote.currency}
              discountPct={pendingDiscount}
              taxPct={pendingTax}
              onChange={(items, disc, tax) => { setPendingItems(items); setPendingDiscount(disc); setPendingTax(tax); }}
            />
          ) : (
            <LineItemsEditor
              items={quote.line_items ?? []}
              currency={quote.currency}
              discountPct={quote.discount_pct ?? 0}
              taxPct={quote.tax_pct ?? 0}
              readOnly
            />
          )}
        </CardContent>
      </Card>
    ),
  };

  return (
    <>
      <DetailShell
        module="quote"
        recordId={id}
        title={`${quote.quote_number} — ${quote.subject}`}
        badges={
          <>
            <Badge variant={STATUS_BADGE[quote.status] ?? "secondary"}>{titleCase(quote.status)}</Badge>
            <span className="text-lg font-bold text-emerald-600">{formatCurrency(quote.total, quote.currency)}</span>
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
            { label: "Quote #", value: quote.quote_number },
            { label: "Status", value: <Badge variant={STATUS_BADGE[quote.status] ?? "secondary"}>{titleCase(quote.status)}</Badge> },
            { label: "Valid Until", value: formatDate(quote.valid_until) },
            { label: "Subtotal", value: formatCurrency(quote.subtotal, quote.currency) },
            { label: "Discount", value: `${quote.discount_pct ?? 0}%` },
            { label: "Tax", value: `${quote.tax_pct ?? 0}%` },
            { label: "Total", value: <span className="font-bold text-emerald-600">{formatCurrency(quote.total, quote.currency)}</span> },
            { label: "Payment Terms", value: quote.payment_terms },
            { label: "Notes", value: quote.notes },
          ]} />
        }
        extraTabs={[lineItemsTab]}
      />
      <RecordForm open={editOpen} onOpenChange={setEditOpen} title="Edit Quote" fields={FIELDS}
        initial={quote as unknown as Record<string, unknown>}
        onSubmit={async (v) => { await update.mutateAsync(v); }} />
    </>
  );
}
