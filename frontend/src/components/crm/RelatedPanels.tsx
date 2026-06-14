"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, Circle, Clock, MessageSquarePlus, Phone, Users, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTime } from "@/lib/utils";
import type { Activity } from "@/lib/types";

// ── Notes ──────────────────────────────────────────────────────────────────
export function NotesPanel({ module, recordId }: { module: string; recordId: string }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const key = ["notes", module, recordId];
  const { data: notes = [] } = useQuery({ queryKey: key, queryFn: () => api.listNotes(module, recordId) });

  const create = useMutation({
    mutationFn: () => api.createNote({ related_module: module, related_id: recordId, body }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["timeline", module, recordId] });
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteNote(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a note…" className="min-h-[60px]" />
        <Button onClick={() => body.trim() && create.mutate()} disabled={!body.trim() || create.isPending}>
          <MessageSquarePlus /> Add
        </Button>
      </div>
      <div className="space-y-2">
        {notes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
        {notes.map((n) => (
          <div key={n.id} className="group flex items-start justify-between rounded-lg border bg-card p-3">
            <div>
              <p className="whitespace-pre-wrap text-sm">{n.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.created_at)}</p>
            </div>
            <button onClick={() => del.mutate(n.id)} className="opacity-0 transition-opacity group-hover:opacity-100">
              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Timeline ───────────────────────────────────────────────────────────────
const VERB_LABEL: Record<string, string> = {
  created: "created this record",
  updated: "updated this record",
  stage_changed: "changed the stage",
  converted: "converted the lead",
  noted: "added a note",
};
export function TimelinePanel({ module, recordId }: { module: string; recordId: string }) {
  const { data: events = [] } = useQuery({
    queryKey: ["timeline", module, recordId],
    queryFn: () => api.getTimeline(module, recordId),
  });
  if (events.length === 0) return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <div className="space-y-3">
      {events.map((e) => (
        <div key={e.id} className="flex gap-3">
          <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
          <div className="text-sm">
            <span className="font-medium">Someone</span>{" "}
            <span className="text-muted-foreground">
              {VERB_LABEL[e.verb] ?? e.verb}
              {e.verb === "stage_changed" && e.meta.stage_name ? ` → ${e.meta.stage_name as string}` : ""}
            </span>
            <div className="text-xs text-muted-foreground">{formatDateTime(e.created_at)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Activities ─────────────────────────────────────────────────────────────
const TYPE_ICON = { task: CheckCircle2, call: Phone, meeting: Users } as const;
export function ActivitiesPanel({ module, recordId }: { module: string; recordId: string }) {
  const qc = useQueryClient();
  const key = ["activities", module, recordId];
  const [subject, setSubject] = useState("");
  const [type, setType] = useState("task");
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => api.listActivities({ related_module: module, related_id: recordId, per_page: 100 }),
  });
  const activities = data?.items ?? [];

  const add = useMutation({
    mutationFn: () => api.createActivity({ subject, type: type as Activity["type"], related_module: module, related_id: recordId }),
    onSuccess: () => {
      setSubject("");
      qc.invalidateQueries({ queryKey: key });
    },
  });
  const toggle = useMutation({
    mutationFn: (a: Activity) => api.updateActivity(a.id, { status: a.status === "completed" ? "open" : "completed" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="task">Task</SelectItem>
            <SelectItem value="call">Call</SelectItem>
            <SelectItem value="meeting">Meeting</SelectItem>
          </SelectContent>
        </Select>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="New activity…" />
        <Button onClick={() => subject.trim() && add.mutate()} disabled={!subject.trim()}>
          Add
        </Button>
      </div>
      <div className="space-y-2">
        {activities.length === 0 && <p className="text-sm text-muted-foreground">No activities yet.</p>}
        {activities.map((a) => {
          const Icon = TYPE_ICON[a.type] ?? CheckCircle2;
          const done = a.status === "completed";
          return (
            <div key={a.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
              <button onClick={() => toggle.mutate(a)}>
                {done ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
              </button>
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span className={`flex-1 text-sm ${done ? "text-muted-foreground line-through" : ""}`}>{a.subject}</span>
              <Badge variant="secondary">{a.type}</Badge>
              {a.due_date && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" /> {formatDateTime(a.due_date)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
