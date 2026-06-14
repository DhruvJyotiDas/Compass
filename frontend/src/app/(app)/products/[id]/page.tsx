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
import { formatCurrency } from "@/lib/utils";
import { useAuth, can } from "@/lib/auth";
import { PRODUCT_CATEGORIES, CURRENCIES, opt, titleCase } from "@/lib/options";
import type { Product } from "@/lib/types";

const FIELDS: Field[] = [
  { name: "name", label: "Name", required: true },
  { name: "code", label: "Product Code" },
  { name: "category", label: "Category", type: "select", options: opt(PRODUCT_CATEGORIES) },
  { name: "unit_price", label: "Unit Price", type: "number" },
  { name: "tax_rate", label: "Tax Rate (%)", type: "number" },
  { name: "currency", label: "Currency", type: "select", options: opt(CURRENCIES) },
  { name: "is_active", label: "Active", type: "select", options: [{ value: "true", label: "Yes" }, { value: "false", label: "No" }] },
  { name: "description", label: "Description", type: "textarea" },
];

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);

  const { data: product, isLoading } = useQuery({ queryKey: ["product", id], queryFn: () => api.getProduct(id) });

  const update = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.updateProduct(id, v as Partial<Product>),
    onSuccess: () => { toast.success("Product updated"); qc.invalidateQueries({ queryKey: ["product", id] }); },
  });
  const del = useMutation({
    mutationFn: () => api.deleteProduct(id),
    onSuccess: () => { toast.success("Product deleted"); router.push("/products"); },
  });

  if (isLoading || !product) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <>
      <DetailShell
        module="product"
        recordId={id}
        title={product.name}
        subtitle={product.code ? `SKU: ${product.code}` : undefined}
        badges={
          <>
            <Badge variant={product.is_active ? "success" : "secondary"}>{product.is_active ? "Active" : "Inactive"}</Badge>
            <span className="text-lg font-bold text-emerald-600">{formatCurrency(product.unit_price, product.currency)}</span>
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
            { label: "Category", value: product.category ? titleCase(product.category) : null },
            { label: "Unit Price", value: formatCurrency(product.unit_price, product.currency) },
            { label: "Tax Rate", value: `${product.tax_rate}%` },
            { label: "Currency", value: product.currency },
            { label: "Description", value: product.description },
          ]} />
        }
      />
      <RecordForm open={editOpen} onOpenChange={setEditOpen} title="Edit Product" fields={FIELDS}
        initial={product as unknown as Record<string, unknown>}
        onSubmit={async (v) => { await update.mutateAsync(v); }} />
    </>
  );
}
