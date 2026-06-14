"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, ThumbsUp, Eye } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { RecordForm, type Field } from "@/components/crm/RecordForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useAuth, can } from "@/lib/auth";
import { SOLUTION_STATUSES, SOLUTION_CATEGORIES, opt, titleCase, STATUS_BADGE } from "@/lib/options";
import type { Solution } from "@/lib/types";

const FIELDS: Field[] = [
  { name: "title", label: "Title", required: true, full: true },
  { name: "body", label: "Body", type: "textarea", required: true },
  { name: "category", label: "Category", type: "select", options: opt(SOLUTION_CATEGORIES) },
  { name: "status", label: "Status", type: "select", options: opt(SOLUTION_STATUSES) },
];

export default function SolutionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);

  const { data: sol, isLoading } = useQuery({ queryKey: ["solution", id], queryFn: () => api.getSolution(id) });

  const update = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.updateSolution(id, v as Partial<Solution>),
    onSuccess: () => { toast.success("Solution updated"); qc.invalidateQueries({ queryKey: ["solution", id] }); },
  });
  const del = useMutation({
    mutationFn: () => api.deleteSolution(id),
    onSuccess: () => { toast.success("Solution deleted"); router.push("/knowledge-base"); },
  });
  const helpful = useMutation({
    mutationFn: () => api.markSolutionHelpful(id),
    onSuccess: () => { toast.success("Marked as helpful!"); qc.invalidateQueries({ queryKey: ["solution", id] }); },
  });

  if (isLoading || !sol) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <>
      <div className="mx-auto max-w-3xl">
        <button onClick={() => router.back()} className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{sol.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={STATUS_BADGE[sol.status] ?? "secondary"}>{titleCase(sol.status)}</Badge>
              {sol.category && <Badge variant="secondary">{titleCase(sol.category)}</Badge>}
              <span className="flex items-center gap-1 text-sm text-muted-foreground"><Eye className="h-4 w-4" /> {sol.views} views</span>
              <span className="flex items-center gap-1 text-sm text-muted-foreground"><ThumbsUp className="h-4 w-4" /> {sol.helpful_votes} helpful</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Created {formatDate(sol.created_at)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => helpful.mutate()}><ThumbsUp className="h-4 w-4" /> Helpful</Button>
            {can(user, "edit") && <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" /> Edit</Button>}
            {can(user, "delete") && <Button variant="outline" size="sm" onClick={() => del.mutate()}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
          </div>
        </div>
        <Card>
          <CardContent className="pt-5 prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed">
            {sol.body}
          </CardContent>
        </Card>
      </div>
      <RecordForm open={editOpen} onOpenChange={setEditOpen} title="Edit Solution" fields={FIELDS}
        initial={sol as unknown as Record<string, unknown>}
        onSubmit={async (v) => { await update.mutateAsync(v); }} />
    </>
  );
}
