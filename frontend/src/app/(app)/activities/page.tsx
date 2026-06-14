"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Phone, Users, CheckSquare, Plus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/crm/PageHeader";
import { RecordForm, type Field } from "@/components/crm/RecordForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useAuth, can } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";
import { PRIORITIES, opt, titleCase, STATUS_BADGE } from "@/lib/options";
import type { Activity } from "@/lib/types";

const TYPE_ICON = { task: CheckSquare, call: Phone, meeting: Users } as const;
const FIELDS: Field[] = [
  { name: "subject", label: "Subject", required: true, full: true },
  { name: "type", label: "Type", type: "select", options: opt(["task", "call", "meeting"]) },
  { name: "priority", label: "Priority", type: "select", options: opt(PRIORITIES) },
  { name: "due_date", label: "Due date", type: "date" },
  { name: "description", label: "Description", type: "textarea" },
];

export default function ActivitiesPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [type, setType] = useState("");
  const [status, setStatus] = useState("open");
  const [formOpen, setFormOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["activities", { type, status }],
    queryFn: () => api.listActivities({ type, status, per_page: 100, sort: "due_date" }),
  });

  const toggle = useMutation({
    mutationFn: (a: Activity) => api.updateActivity(a.id, { status: a.status === "completed" ? "open" : "completed" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activities"] }),
  });
  const create = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.createActivity(v as Partial<Activity>),
    onSuccess: () => { toast.success("Activity created"); qc.invalidateQueries({ queryKey: ["activities"] }); },
  });

  const activities = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Activities"
        subtitle="Tasks, calls, and meetings across all your records."
        actions={can(user, "create") && <Button onClick={() => setFormOpen(true)}><Plus /> New Activity</Button>}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">All types</option>
          <option value="task">Tasks</option>
          <option value="call">Calls</option>
          <option value="meeting">Meetings</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">All</option>
          <option value="open">Open</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      <Card className="divide-y">
        {isLoading ? (
          <p className="p-6 text-muted-foreground">Loading…</p>
        ) : activities.length === 0 ? (
          <p className="p-6 text-muted-foreground">No activities.</p>
        ) : (
          activities.map((a) => {
            const Icon = TYPE_ICON[a.type] ?? CheckSquare;
            const done = a.status === "completed";
            return (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <button onClick={() => toggle.mutate(a)}>
                  {done ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                </button>
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className={`flex-1 text-sm ${done ? "text-muted-foreground line-through" : "font-medium"}`}>{a.subject}</span>
                {a.priority && a.priority !== "normal" && (
                  <Badge variant={a.priority === "high" ? "danger" : "secondary"}>{titleCase(a.priority)}</Badge>
                )}
                <Badge variant="secondary">{a.type}</Badge>
                {a.related_module && <span className="text-xs text-muted-foreground">{titleCase(a.related_module)}</span>}
                <span className="w-36 text-right text-xs text-muted-foreground">{a.due_date ? formatDateTime(a.due_date) : "—"}</span>
              </div>
            );
          })
        )}
      </Card>

      <RecordForm open={formOpen} onOpenChange={setFormOpen} title="New Activity" fields={FIELDS} initial={{ type: "task", priority: "normal" }} onSubmit={async (v) => { await create.mutateAsync(v); }} />
    </div>
  );
}
