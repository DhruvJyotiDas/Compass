"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Zap, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/crm/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RecordForm, type Field } from "@/components/crm/RecordForm";
import { useAuth, can } from "@/lib/auth";
import { titleCase } from "@/lib/options";
import type { WorkflowRule, WorkflowCondition, WorkflowAction, AssignmentRule, ScoringRule } from "@/lib/types";

const ROLE_LABEL: Record<string, string> = { admin: "Admin", manager: "Manager", sales_rep: "Sales Rep" };

// ── Workflow Automation constants ────────────────────────────────────────────

const MODULES = [
  { value: "lead", label: "Lead" },
  { value: "contact", label: "Contact" },
  { value: "account", label: "Account" },
  { value: "deal", label: "Deal" },
  { value: "case", label: "Case" },
];

const TRIGGERS = [
  { value: "on_create", label: "Record Created" },
  { value: "on_update", label: "Record Updated" },
];

const OPERATORS = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "is_empty", label: "is empty" },
  { value: "not_empty", label: "is not empty" },
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
  { value: "gte", label: ">=" },
  { value: "lte", label: "<=" },
];

const MODULE_FIELDS: Record<string, { value: string; label: string }[]> = {
  lead: [
    { value: "first_name", label: "First Name" },
    { value: "last_name", label: "Last Name" },
    { value: "company", label: "Company" },
    { value: "email", label: "Email" },
    { value: "status", label: "Status" },
    { value: "rating", label: "Rating" },
    { value: "source", label: "Source" },
    { value: "score", label: "Score" },
    { value: "industry", label: "Industry" },
  ],
  contact: [
    { value: "first_name", label: "First Name" },
    { value: "last_name", label: "Last Name" },
    { value: "email", label: "Email" },
    { value: "title", label: "Title" },
    { value: "source", label: "Source" },
    { value: "department", label: "Department" },
  ],
  account: [
    { value: "name", label: "Name" },
    { value: "industry", label: "Industry" },
    { value: "type", label: "Type" },
    { value: "annual_revenue", label: "Annual Revenue" },
    { value: "no_of_employees", label: "Employees" },
  ],
  deal: [
    { value: "name", label: "Name" },
    { value: "status", label: "Status" },
    { value: "amount", label: "Amount" },
    { value: "probability", label: "Probability %" },
    { value: "source", label: "Source" },
    { value: "type", label: "Type" },
  ],
  case: [
    { value: "subject", label: "Subject" },
    { value: "status", label: "Status" },
    { value: "priority", label: "Priority" },
    { value: "type", label: "Type" },
    { value: "source", label: "Source" },
  ],
};

const ACTION_TYPES = [
  { value: "field_update", label: "Update Field" },
  { value: "create_task", label: "Create Task" },
  { value: "webhook", label: "Webhook" },
];

// ── Condition row ────────────────────────────────────────────────────────────

function ConditionRow({
  cond,
  module,
  onChange,
  onRemove,
}: {
  cond: WorkflowCondition;
  module: string;
  onChange: (c: WorkflowCondition) => void;
  onRemove: () => void;
}) {
  const fields = MODULE_FIELDS[module] || [];
  const noValue = ["is_empty", "not_empty"].includes(cond.op);
  return (
    <div className="flex items-center gap-2">
      <Select value={cond.field} onValueChange={(v) => onChange({ ...cond, field: v })}>
        <SelectTrigger className="w-36"><SelectValue placeholder="Field" /></SelectTrigger>
        <SelectContent>{fields.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={cond.op} onValueChange={(v) => onChange({ ...cond, op: v })}>
        <SelectTrigger className="w-36"><SelectValue placeholder="Operator" /></SelectTrigger>
        <SelectContent>{OPERATORS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
      {!noValue && (
        <Input
          className="w-40"
          value={cond.value ?? ""}
          onChange={(e) => onChange({ ...cond, value: e.target.value })}
          placeholder="Value"
        />
      )}
      <Button variant="ghost" size="icon" onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
    </div>
  );
}

// ── Action row ───────────────────────────────────────────────────────────────

function ActionRow({
  action,
  module,
  onChange,
  onRemove,
}: {
  action: WorkflowAction & { _key?: number };
  module: string;
  onChange: (a: WorkflowAction) => void;
  onRemove: () => void;
}) {
  const fields = MODULE_FIELDS[module] || [];
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <Select value={action.action_type} onValueChange={(v) => onChange({ ...action, action_type: v, config: {} })}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Action type" /></SelectTrigger>
          <SelectContent>{ACTION_TYPES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
      </div>
      {action.action_type === "field_update" && (
        <div className="flex items-center gap-2">
          <Select
            value={action.config.field ?? ""}
            onValueChange={(v) => onChange({ ...action, config: { ...action.config, field: v } })}
          >
            <SelectTrigger className="w-36"><SelectValue placeholder="Field" /></SelectTrigger>
            <SelectContent>{fields.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
          </Select>
          <Input
            className="w-48"
            placeholder="New value"
            value={action.config.value ?? ""}
            onChange={(e) => onChange({ ...action, config: { ...action.config, value: e.target.value } })}
          />
        </div>
      )}
      {action.action_type === "create_task" && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="w-48"
            placeholder="Task subject"
            value={action.config.subject ?? ""}
            onChange={(e) => onChange({ ...action, config: { ...action.config, subject: e.target.value } })}
          />
          <Select
            value={action.config.priority ?? "normal"}
            onValueChange={(v) => onChange({ ...action, config: { ...action.config, priority: v } })}
          >
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Input
              className="w-20"
              type="number"
              min={0}
              placeholder="Days"
              value={action.config.due_days ?? 1}
              onChange={(e) => onChange({ ...action, config: { ...action.config, due_days: Number(e.target.value) } })}
            />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
        </div>
      )}
      {action.action_type === "webhook" && (
        <div className="flex items-center gap-2">
          <Select
            value={action.config.method ?? "POST"}
            onValueChange={(v) => onChange({ ...action, config: { ...action.config, method: v } })}
          >
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="POST">POST</SelectItem>
              <SelectItem value="GET">GET</SelectItem>
              <SelectItem value="PUT">PUT</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="flex-1"
            placeholder="https://example.com/webhook"
            value={action.config.url ?? ""}
            onChange={(e) => onChange({ ...action, config: { ...action.config, url: e.target.value } })}
          />
        </div>
      )}
    </div>
  );
}

// ── Workflow builder dialog ───────────────────────────────────────────────────

function WorkflowDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: WorkflowRule | null;
}) {
  const qc = useQueryClient();
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [module, setModule] = useState(initial?.module ?? "lead");
  const [trigger, setTrigger] = useState(initial?.trigger ?? "on_create");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [conditions, setConditions] = useState<WorkflowCondition[]>(initial?.conditions ?? []);
  const [actions, setActions] = useState<(WorkflowAction & { _key: number })[]>(
    (initial?.actions ?? []).map((a, i) => ({ ...a, _key: i }))
  );
  const [nextKey, setNextKey] = useState(100);

  const save = useMutation({
    mutationFn: (payload: unknown) =>
      isEdit
        ? api.updateWorkflowRule(initial!.id, payload as never)
        : api.createWorkflowRule(payload as never),
    onSuccess: () => {
      toast.success(isEdit ? "Workflow updated" : "Workflow created");
      qc.invalidateQueries({ queryKey: ["workflow-rules"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  function addCondition() {
    const fields = MODULE_FIELDS[module] || [];
    setConditions([...conditions, { field: fields[0]?.value ?? "", op: "eq", value: "" }]);
  }

  function addAction() {
    setActions([...actions, { id: "", rule_id: "", sort_order: actions.length, action_type: "field_update", config: {}, _key: nextKey }]);
    setNextKey((k) => k + 1);
  }

  function handleSubmit() {
    if (!name.trim()) { toast.error("Name is required"); return; }
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      module,
      trigger,
      is_active: isActive,
      conditions,
      actions: actions.map((a, i) => ({
        sort_order: i,
        action_type: a.action_type,
        config: a.config,
      })),
    };
    save.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Workflow" : "New Workflow Rule"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Qualify hot leads" />
            </div>
            <div className="space-y-1.5">
              <Label>Module</Label>
              <Select value={module} onValueChange={(v) => { setModule(v); setConditions([]); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MODULES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Trigger</Label>
              <Select value={trigger} onValueChange={setTrigger}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TRIGGERS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional description" />
            </div>
            <div className="col-span-2 flex items-center gap-3">
              <Label>Active</Label>
              <button type="button" onClick={() => setIsActive((v) => !v)}>
                {isActive
                  ? <ToggleRight className="h-6 w-6 text-primary" />
                  : <ToggleLeft className="h-6 w-6 text-muted-foreground" />}
              </button>
            </div>
          </div>

          {/* Conditions */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold">Conditions (all must match)</h4>
              <Button size="sm" variant="outline" onClick={addCondition}><Plus className="mr-1 h-3 w-3" />Add condition</Button>
            </div>
            <div className="space-y-2">
              {conditions.length === 0 && <p className="text-sm text-muted-foreground">No conditions — rule fires on every {trigger.replace("on_", "")}.</p>}
              {conditions.map((c, i) => (
                <ConditionRow
                  key={i}
                  cond={c}
                  module={module}
                  onChange={(nc) => setConditions(conditions.map((x, j) => (j === i ? nc : x)))}
                  onRemove={() => setConditions(conditions.filter((_, j) => j !== i))}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold">Actions (run in order)</h4>
              <Button size="sm" variant="outline" onClick={addAction}><Plus className="mr-1 h-3 w-3" />Add action</Button>
            </div>
            <div className="space-y-2">
              {actions.length === 0 && <p className="text-sm text-muted-foreground">Add at least one action.</p>}
              {actions.map((a, i) => (
                <ActionRow
                  key={a._key}
                  action={a}
                  module={module}
                  onChange={(na) => setActions(actions.map((x, j) => (j === i ? { ...na, _key: a._key } : x)))}
                  onRemove={() => setActions(actions.filter((_, j) => j !== i))}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={save.isPending}>
            {save.isPending ? "Saving…" : isEdit ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Workflows tab ────────────────────────────────────────────────────────────

function WorkflowsTab() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WorkflowRule | null>(null);

  const { data: rules = [] } = useQuery({ queryKey: ["workflow-rules"], queryFn: () => api.listWorkflowRules() });

  const toggle = useMutation({
    mutationFn: (id: string) => api.toggleWorkflowRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflow-rules"] }),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteWorkflowRule(id),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["workflow-rules"] }); },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="mr-1 h-4 w-4" />New workflow</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Conditions</TableHead>
                <TableHead>Actions</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No workflow rules yet.</TableCell></TableRow>
              )}
              {rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell><Badge variant="secondary">{titleCase(r.module)}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.trigger.replace("on_", "On ").replace("_", " ")}</TableCell>
                  <TableCell className="text-sm">{r.conditions.length || "Always"}</TableCell>
                  <TableCell className="text-sm">{r.actions.length}</TableCell>
                  <TableCell>
                    {r.is_active
                      ? <Badge variant="success">Active</Badge>
                      : <Badge variant="secondary">Inactive</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => toggle.mutate(r.id)}>
                        {r.is_active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(r); setDialogOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => del.mutate(r.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {dialogOpen && (
        <WorkflowDialog
          key={editing?.id ?? "new"}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          initial={editing}
        />
      )}
    </div>
  );
}

// ── Assignment Rules tab ─────────────────────────────────────────────────────

const ASSIGNMENT_MODULES = [
  { value: "lead", label: "Lead" },
  { value: "deal", label: "Deal" },
  { value: "case", label: "Case" },
  { value: "contact", label: "Contact" },
];

function AssignmentRulesTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AssignmentRule | null>(null);

  const { data: rules = [] } = useQuery({ queryKey: ["assignment-rules"], queryFn: () => api.listAssignmentRules() });
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: api.listUsers });

  const [form, setForm] = useState({ name: "", module: "lead", strategy: "round_robin", assignees: [] as string[], is_active: true });

  const save = useMutation({
    mutationFn: (b: Partial<AssignmentRule>) =>
      editing ? api.updateAssignmentRule(editing.id, b) : api.createAssignmentRule(b),
    onSuccess: () => {
      toast.success(editing ? "Updated" : "Created");
      qc.invalidateQueries({ queryKey: ["assignment-rules"] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.deleteAssignmentRule(id),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["assignment-rules"] }); },
  });

  const toggle = useMutation({
    mutationFn: (id: string) => api.toggleAssignmentRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assignment-rules"] }),
  });

  function openNew() {
    setEditing(null);
    setForm({ name: "", module: "lead", strategy: "round_robin", assignees: [], is_active: true });
    setOpen(true);
  }

  function openEdit(r: AssignmentRule) {
    setEditing(r);
    setForm({ name: r.name, module: r.module, strategy: r.strategy, assignees: r.assignees, is_active: r.is_active });
    setOpen(true);
  }

  function handleSubmit() {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    save.mutate(form);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />New rule</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Strategy</TableHead>
                <TableHead>Assignees</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No assignment rules yet.</TableCell></TableRow>
              )}
              {rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell><Badge variant="secondary">{titleCase(r.module)}</Badge></TableCell>
                  <TableCell className="text-sm">{r.strategy === "round_robin" ? "Round Robin" : "Criteria"}</TableCell>
                  <TableCell className="text-sm">{r.assignees.length} user{r.assignees.length !== 1 ? "s" : ""}</TableCell>
                  <TableCell>{r.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => toggle.mutate(r.id)}>
                        {r.is_active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => del.mutate(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Assignment Rule" : "New Assignment Rule"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Module</Label>
                <Select value={form.module} onValueChange={(v) => setForm({ ...form, module: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ASSIGNMENT_MODULES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Strategy</Label>
                <Select value={form.strategy} onValueChange={(v) => setForm({ ...form, strategy: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="round_robin">Round Robin</SelectItem>
                    <SelectItem value="criteria">Criteria</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Assignees (assigned in round-robin order)</Label>
              <div className="space-y-1 max-h-40 overflow-y-auto rounded border p-2">
                {users.filter((u) => u.is_active).map((u) => (
                  <label key={u.id} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={form.assignees.includes(u.id)}
                      onChange={(e) => {
                        setForm({
                          ...form,
                          assignees: e.target.checked
                            ? [...form.assignees, u.id]
                            : form.assignees.filter((id) => id !== u.id),
                        });
                      }}
                    />
                    {u.name} <span className="text-muted-foreground">({ROLE_LABEL[u.role]})</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={save.isPending}>{save.isPending ? "Saving…" : editing ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Scoring Rules tab ────────────────────────────────────────────────────────

const SCORING_MODULES = [
  { value: "lead", label: "Lead" },
  { value: "deal", label: "Deal" },
];

function ScoringRulesTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ScoringRule | null>(null);
  const [name, setName] = useState("");
  const [module, setModule] = useState("lead");
  const [criteria, setCriteria] = useState<(WorkflowCondition & { score: number })[]>([]);

  const { data: rules = [] } = useQuery({ queryKey: ["scoring-rules"], queryFn: () => api.listScoringRules() });

  const save = useMutation({
    mutationFn: (b: Partial<ScoringRule>) =>
      editing ? api.updateScoringRule(editing.id, b) : api.createScoringRule(b),
    onSuccess: () => {
      toast.success(editing ? "Updated" : "Created");
      qc.invalidateQueries({ queryKey: ["scoring-rules"] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.deleteScoringRule(id),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["scoring-rules"] }); },
  });

  const toggle = useMutation({
    mutationFn: (id: string) => api.toggleScoringRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scoring-rules"] }),
  });

  function openNew() {
    setEditing(null); setName(""); setModule("lead"); setCriteria([]);
    setOpen(true);
  }

  function openEdit(r: ScoringRule) {
    setEditing(r); setName(r.name); setModule(r.module); setCriteria(r.criteria);
    setOpen(true);
  }

  function addCriterion() {
    const fields = MODULE_FIELDS[module] || [];
    setCriteria([...criteria, { field: fields[0]?.value ?? "", op: "eq", value: "", score: 10 }]);
  }

  function handleSubmit() {
    if (!name.trim()) { toast.error("Name required"); return; }
    save.mutate({ name, module, criteria, is_active: true });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />New rule</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Criteria</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No scoring rules yet.</TableCell></TableRow>
              )}
              {rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell><Badge variant="secondary">{titleCase(r.module)}</Badge></TableCell>
                  <TableCell className="text-sm">{r.criteria.length} criterion{r.criteria.length !== 1 ? "a" : ""}</TableCell>
                  <TableCell>{r.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => toggle.mutate(r.id)}>
                        {r.is_active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => del.mutate(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Scoring Rule" : "New Scoring Rule"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Module</Label>
                <Select value={module} onValueChange={(v) => { setModule(v); setCriteria([]); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SCORING_MODULES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold">Scoring criteria</h4>
                <Button size="sm" variant="outline" onClick={addCriterion}><Plus className="mr-1 h-3 w-3" />Add</Button>
              </div>
              <div className="space-y-2">
                {criteria.length === 0 && <p className="text-sm text-muted-foreground">No criteria added.</p>}
                {criteria.map((c, i) => {
                  const fields = MODULE_FIELDS[module] || [];
                  const noValue = ["is_empty", "not_empty"].includes(c.op);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <Select value={c.field} onValueChange={(v) => setCriteria(criteria.map((x, j) => j === i ? { ...x, field: v } : x))}>
                        <SelectTrigger className="w-32"><SelectValue placeholder="Field" /></SelectTrigger>
                        <SelectContent>{fields.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                      </Select>
                      <Select value={c.op} onValueChange={(v) => setCriteria(criteria.map((x, j) => j === i ? { ...x, op: v } : x))}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>{OPERATORS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                      </Select>
                      {!noValue && (
                        <Input
                          className="w-32"
                          value={c.value ?? ""}
                          onChange={(e) => setCriteria(criteria.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                          placeholder="Value"
                        />
                      )}
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium">±</span>
                        <Input
                          className="w-20"
                          type="number"
                          value={c.score}
                          onChange={(e) => setCriteria(criteria.map((x, j) => j === i ? { ...x, score: Number(e.target.value) } : x))}
                          placeholder="Score"
                        />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => setCriteria(criteria.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={save.isPending}>{save.isPending ? "Saving…" : editing ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Existing tabs ─────────────────────────────────────────────────────────────

function UsersTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: api.listUsers });
  const create = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.createUser(v as never),
    onSuccess: () => { toast.success("User invited"); qc.invalidateQueries({ queryKey: ["users"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const fields: Field[] = [
    { name: "name", label: "Name", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "password", label: "Temp password", required: true },
    { name: "role", label: "Role", type: "select", options: [
      { value: "sales_rep", label: "Sales Rep" }, { value: "manager", label: "Manager" }, { value: "admin", label: "Admin" }] },
    { name: "title", label: "Title" },
  ];
  return (
    <Card>
      <CardContent className="pt-5">
        {can(user, "manage_users") && (
          <div className="mb-4 flex justify-end">
            <Button onClick={() => setOpen(true)}><Plus /> Invite user</Button>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell><Badge variant="secondary">{ROLE_LABEL[u.role] ?? u.role}</Badge></TableCell>
                <TableCell>{u.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Inactive</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <RecordForm open={open} onOpenChange={setOpen} title="Invite user" fields={fields} initial={{ role: "sales_rep" }} onSubmit={async (v) => { await create.mutateAsync(v); }} />
      </CardContent>
    </Card>
  );
}

function PipelinesTab() {
  const { data: pipelines = [] } = useQuery({ queryKey: ["pipelines"], queryFn: api.listPipelines });
  return (
    <div className="space-y-4">
      {pipelines.map((p) => (
        <Card key={p.id}>
          <CardContent className="pt-5">
            <div className="mb-3 flex items-center gap-2">
              <h3 className="font-semibold">{p.name}</h3>
              {p.is_default && <Badge>Default</Badge>}
            </div>
            <div className="flex flex-wrap gap-2">
              {[...p.stages].sort((a, b) => a.sort_order - b.sort_order).map((s) => (
                <div key={s.id} className="rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
                  {s.name} <span className="text-muted-foreground">· {s.probability}%</span>
                  {s.type !== "open" && <Badge variant={s.type === "won" ? "success" : "danger"} className="ml-2">{titleCase(s.type)}</Badge>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TagsTab() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: api.listTags });
  const create = useMutation({
    mutationFn: () => api.createTag({ name }),
    onSuccess: () => { setName(""); qc.invalidateQueries({ queryKey: ["tags"] }); },
  });
  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New tag…" className="w-64" />
          <Button onClick={() => name.trim() && create.mutate()} disabled={!name.trim()}>Add tag</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <span key={t.id} className="rounded-full px-3 py-1 text-sm text-white" style={{ backgroundColor: t.color }}>{t.name}</span>
          ))}
          {tags.length === 0 && <p className="text-sm text-muted-foreground">No tags yet.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileTab() {
  const { user } = useAuth();
  return (
    <Card>
      <CardContent className="grid max-w-md gap-4 pt-5">
        <div className="space-y-1.5"><Label>Name</Label><Input defaultValue={user?.name} disabled /></div>
        <div className="space-y-1.5"><Label>Email</Label><Input defaultValue={user?.email} disabled /></div>
        <div className="space-y-1.5"><Label>Role</Label><Input defaultValue={ROLE_LABEL[user?.role ?? ""]} disabled /></div>
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user } = useAuth();
  const isManager = can(user, "manage_settings");
  return (
    <div>
      <PageHeader title="Settings" subtitle="Manage your workspace and automation." />
      <Tabs defaultValue={can(user, "manage_users") ? "users" : "profile"}>
        <TabsList className="flex-wrap h-auto gap-1">
          {can(user, "manage_users") && <TabsTrigger value="users">Users & Roles</TabsTrigger>}
          <TabsTrigger value="pipelines">Pipelines</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
          {isManager && (
            <>
              <TabsTrigger value="workflows"><Zap className="mr-1 h-3 w-3" />Workflows</TabsTrigger>
              <TabsTrigger value="assignment">Assignment Rules</TabsTrigger>
              <TabsTrigger value="scoring">Scoring Rules</TabsTrigger>
            </>
          )}
          <TabsTrigger value="profile">My Profile</TabsTrigger>
        </TabsList>
        {can(user, "manage_users") && <TabsContent value="users"><UsersTab /></TabsContent>}
        <TabsContent value="pipelines"><PipelinesTab /></TabsContent>
        <TabsContent value="tags"><TagsTab /></TabsContent>
        {isManager && (
          <>
            <TabsContent value="workflows"><WorkflowsTab /></TabsContent>
            <TabsContent value="assignment"><AssignmentRulesTab /></TabsContent>
            <TabsContent value="scoring"><ScoringRulesTab /></TabsContent>
          </>
        )}
        <TabsContent value="profile"><ProfileTab /></TabsContent>
      </Tabs>
    </div>
  );
}
