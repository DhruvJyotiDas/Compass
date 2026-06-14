"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import type { LineItem } from "@/lib/types";

interface Props {
  items: LineItem[];
  currency?: string;
  discountPct?: number;
  taxPct?: number;
  readOnly?: boolean;
  onChange?: (items: LineItem[], discountPct: number, taxPct: number) => void;
}

function emptyRow(): LineItem {
  return { name: "", qty: 1, unit_price: 0, discount_pct: 0, total: 0 };
}

function computeLineTotal(item: LineItem): number {
  return item.qty * item.unit_price * (1 - item.discount_pct / 100);
}

export function LineItemsEditor({ items, currency = "USD", discountPct = 0, taxPct = 0, readOnly = false, onChange }: Props) {
  const [rows, setRows] = useState<LineItem[]>(items.length ? items : readOnly ? [] : [emptyRow()]);
  const [docDiscount, setDocDiscount] = useState(discountPct);
  const [docTax, setDocTax] = useState(taxPct);

  const subtotal = rows.reduce((s, r) => s + computeLineTotal(r), 0);
  const total = subtotal * (1 - docDiscount / 100) * (1 + docTax / 100);

  function update(idx: number, patch: Partial<LineItem>) {
    const next = rows.map((r, i) => i === idx ? { ...r, ...patch } : r);
    setRows(next);
    onChange?.(next, docDiscount, docTax);
  }

  function addRow() {
    const next = [...rows, emptyRow()];
    setRows(next);
    onChange?.(next, docDiscount, docTax);
  }

  function removeRow(idx: number) {
    const next = rows.filter((_, i) => i !== idx);
    setRows(next);
    onChange?.(next, docDiscount, docTax);
  }

  function updateDocField(discount: number, tax: number) {
    setDocDiscount(discount);
    setDocTax(tax);
    onChange?.(rows, discount, tax);
  }

  if (readOnly && rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No line items.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Item</th>
              <th className="px-3 py-2 text-right font-medium w-20">Qty</th>
              <th className="px-3 py-2 text-right font-medium w-28">Unit Price</th>
              <th className="px-3 py-2 text-right font-medium w-24">Disc%</th>
              <th className="px-3 py-2 text-right font-medium w-28">Total</th>
              {!readOnly && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-2">
                  {readOnly ? (
                    <div>
                      <div className="font-medium">{row.name}</div>
                      {row.description && <div className="text-xs text-muted-foreground">{row.description}</div>}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Input value={row.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Item name" className="h-8" />
                      <Input value={row.description ?? ""} onChange={(e) => update(i, { description: e.target.value })} placeholder="Description (optional)" className="h-7 text-xs" />
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {readOnly ? row.qty : (
                    <Input type="number" min={0} value={row.qty} onChange={(e) => update(i, { qty: parseFloat(e.target.value) || 0 })} className="h-8 w-20 text-right ml-auto" />
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {readOnly ? formatCurrency(row.unit_price, currency) : (
                    <Input type="number" min={0} value={row.unit_price} onChange={(e) => update(i, { unit_price: parseFloat(e.target.value) || 0 })} className="h-8 w-28 text-right ml-auto" />
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {readOnly ? `${row.discount_pct}%` : (
                    <Input type="number" min={0} max={100} value={row.discount_pct} onChange={(e) => update(i, { discount_pct: parseFloat(e.target.value) || 0 })} className="h-8 w-20 text-right ml-auto" />
                  )}
                </td>
                <td className="px-3 py-2 text-right font-medium">{formatCurrency(computeLineTotal(row), currency)}</td>
                {!readOnly && (
                  <td className="px-2 py-2">
                    <button onClick={() => removeRow(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="h-4 w-4" /> Add Item
        </Button>
      )}

      <div className="ml-auto w-64 space-y-1.5 rounded-md border p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatCurrency(subtotal, currency)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Discount</span>
          {readOnly ? (
            <span>{docDiscount}%</span>
          ) : (
            <div className="flex items-center gap-1">
              <Input type="number" min={0} max={100} value={docDiscount} onChange={(e) => updateDocField(parseFloat(e.target.value) || 0, docTax)} className="h-7 w-20 text-right" />
              <span>%</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Tax</span>
          {readOnly ? (
            <span>{docTax}%</span>
          ) : (
            <div className="flex items-center gap-1">
              <Input type="number" min={0} max={100} value={docTax} onChange={(e) => updateDocField(docDiscount, parseFloat(e.target.value) || 0)} className="h-7 w-20 text-right" />
              <span>%</span>
            </div>
          )}
        </div>
        <div className="flex justify-between border-t pt-1.5 font-semibold">
          <span>Total</span>
          <span>{formatCurrency(total, currency)}</span>
        </div>
      </div>
    </div>
  );
}
