"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/crm/PageHeader";
import { RecordForm, type Field } from "@/components/crm/RecordForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth, can } from "@/lib/auth";
import { formatDate } from "@/lib/utils";

const FIELDS: Field[] = [
  { name: "name", label: "Name", required: true },
  { name: "description", label: "Description", type: "textarea" },
  { name: "is_default", label: "Default", type: "select", options: [{ value: "true", label: "Yes" }, { value: "false", label: "No" }] },
];

export default function PriceBooksPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [formOpen, setFormOpen] = useState(false);

  const { data: books, isLoading } = useQuery({ queryKey: ["price-books"], queryFn: api.listPriceBooks });

  const create = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.createPriceBook(v),
    onSuccess: () => { toast.success("Price book created"); qc.invalidateQueries({ queryKey: ["price-books"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.deletePriceBook(id),
    onSuccess: () => { toast.success("Price book deleted"); qc.invalidateQueries({ queryKey: ["price-books"] }); },
  });

  return (
    <div>
      <PageHeader
        title="Price Books"
        subtitle={books ? `${books.length} price books` : undefined}
        actions={can(user, "create") && <Button onClick={() => setFormOpen(true)}><Plus /> New Price Book</Button>}
      />

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {books?.map((pb) => (
          <Card key={pb.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{pb.name}</CardTitle>
                <div className="flex gap-1">
                  {pb.is_default && <Badge variant="info">Default</Badge>}
                  <Badge variant={pb.is_active ? "success" : "secondary"}>{pb.is_active ? "Active" : "Inactive"}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {pb.description && <p className="text-sm text-muted-foreground mb-2">{pb.description}</p>}
              <p className="text-xs text-muted-foreground">{pb.items.length} items · Created {formatDate(pb.created_at)}</p>
              {can(user, "delete") && (
                <Button variant="ghost" size="sm" className="mt-2 text-destructive hover:text-destructive" onClick={() => del.mutate(pb.id)}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {books?.length === 0 && !isLoading && (
        <p className="mt-8 text-center text-muted-foreground">No price books yet. Create your first one.</p>
      )}

      <RecordForm open={formOpen} onOpenChange={setFormOpen} title="New Price Book" fields={FIELDS}
        initial={{ is_default: false, is_active: true }}
        onSubmit={async (v) => { await create.mutateAsync(v); }} />
    </div>
  );
}
