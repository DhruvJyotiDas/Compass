"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export interface Field {
  name: string;
  label: string;
  type?: "text" | "email" | "number" | "textarea" | "select" | "date";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  full?: boolean;
}

interface RecordFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fields: Field[];
  initial?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
}

export function RecordForm({ open, onOpenChange, title, fields, initial = {}, onSubmit }: RecordFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const [saving, setSaving] = useState(false);

  // Reset when (re)opened with a different initial
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setValues(initial);
    setLastOpen(true);
  }
  if (!open && lastOpen) setLastOpen(false);

  const set = (name: string, v: unknown) => setValues((prev) => ({ ...prev, [name]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const cleaned: Record<string, unknown> = {};
      for (const f of fields) {
        let v = values[f.name];
        if (v === "" || v === undefined) {
          v = null;
        } else if (f.type === "number" && v != null) {
          v = Number(v);
        }
        cleaned[f.name] = v;
      }
      await onSubmit(cleaned);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
          <div className="grid flex-1 grid-cols-2 gap-4 overflow-y-auto px-6 py-5">
            {fields.map((f) => (
              <div key={f.name} className={`space-y-1.5 ${f.full || f.type === "textarea" ? "col-span-2" : ""}`}>
                <Label htmlFor={f.name}>
                  {f.label}
                  {f.required && <span className="text-destructive"> *</span>}
                </Label>
                {f.type === "textarea" ? (
                  <Textarea
                    id={f.name}
                    value={(values[f.name] as string) ?? ""}
                    onChange={(e) => set(f.name, e.target.value)}
                    placeholder={f.placeholder}
                  />
                ) : f.type === "select" ? (
                  <Select value={(values[f.name] as string) ?? ""} onValueChange={(v) => set(f.name, v)}>
                    <SelectTrigger id={f.name}>
                      <SelectValue placeholder={f.placeholder || "Select…"} />
                    </SelectTrigger>
                    <SelectContent>
                      {f.options?.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={f.name}
                    type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type ?? "text"}
                    value={(values[f.name] as string) ?? ""}
                    onChange={(e) => set(f.name, e.target.value)}
                    required={f.required}
                    placeholder={f.placeholder}
                  />
                )}
              </div>
            ))}
          </div>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
