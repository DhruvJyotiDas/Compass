"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

export default function PriceBookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: pb, isLoading } = useQuery({ queryKey: ["price-book", id], queryFn: () => api.getPriceBook(id) });
  const { data: products } = useQuery({ queryKey: ["products", "all"], queryFn: () => api.listProducts({ per_page: 200 }) });

  const productMap = Object.fromEntries((products?.items ?? []).map((p) => [p.id, p]));

  if (isLoading || !pb) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={() => router.back()} className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{pb.name}</h1>
          {pb.description && <p className="mt-1 text-sm text-muted-foreground">{pb.description}</p>}
          <div className="mt-2 flex gap-2">
            {pb.is_default && <Badge variant="info">Default</Badge>}
            <Badge variant={pb.is_active ? "success" : "secondary"}>{pb.is_active ? "Active" : "Inactive"}</Badge>
          </div>
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>Products ({pb.items.length})</CardTitle></CardHeader>
        <CardContent>
          {pb.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items in this price book.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-right">Standard Price</th>
                  <th className="px-3 py-2 text-right">Book Price</th>
                </tr>
              </thead>
              <tbody>
                {pb.items.map((item) => {
                  const prod = productMap[item.product_id];
                  return (
                    <tr key={item.id} className="border-t">
                      <td className="px-3 py-2 font-medium">{prod?.name ?? item.product_id}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{prod ? formatCurrency(prod.unit_price, prod.currency) : "—"}</td>
                      <td className="px-3 py-2 text-right font-medium text-emerald-600">{formatCurrency(item.price, prod?.currency ?? "USD")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
