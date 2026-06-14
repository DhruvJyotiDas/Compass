"use client";

import { useRef, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { CustomField, WebForm } from "@/lib/types";

type Tab = "custom_fields" | "web_forms" | "import_export";

const MODULES = ["lead", "contact", "account", "deal", "case"];
const FIELD_TYPES = ["text", "number", "date", "select", "checkbox", "url", "email", "textarea"];

// ── Custom Field Dialog ───────────────────────────────────────────────────────
function CustomFieldDialog({
  field,
  onClose,
  onSave,
}: {
  field: Partial<CustomField> | null;
  onClose: () => void;
  onSave: (f: CustomField) => void;
}) {
  const [module, setModule] = useState(field?.module ?? "lead");
  const [fieldKey, setFieldKey] = useState(field?.field_key ?? "");
  const [label, setLabel] = useState(field?.label ?? "");
  const [fieldType, setFieldType] = useState(field?.field_type ?? "text");
  const [options, setOptions] = useState((field?.options ?? []).join("\n"));
  const [isRequired, setIsRequired] = useState(field?.is_required ?? false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const payload = {
        module,
        field_key: fieldKey,
        label,
        field_type: fieldType,
        options: fieldType === "select" ? options.split("\n").map((s) => s.trim()).filter(Boolean) : [],
        is_required: isRequired,
        is_active: true,
        sort_order: field?.sort_order ?? 0,
      };
      const saved = field?.id
        ? await api.updateCustomField(field.id, payload)
        : await api.createCustomField(payload);
      onSave(saved);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">{field?.id ? "Edit" : "Add"} Custom Field</h2>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Module</label>
              <select className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={module} onChange={(e) => setModule(e.target.value)} disabled={!!field?.id}>
                {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Field Type</label>
              <select className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={fieldType} onChange={(e) => setFieldType(e.target.value)}>
                {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Label *</label>
            <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Field Key * (snake_case)</label>
            <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              value={fieldKey} onChange={(e) => setFieldKey(e.target.value.replace(/\s+/g, "_").toLowerCase())} disabled={!!field?.id} />
          </div>
          {fieldType === "select" && (
            <div>
              <label className="text-xs font-medium text-gray-600">Options (one per line)</label>
              <textarea className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono" rows={4}
                value={options} onChange={(e) => setOptions(e.target.value)} />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} className="rounded" />
            Required field
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg" onClick={onClose}>Cancel</button>
          <button
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            disabled={saving || !label || !fieldKey}
            onClick={save}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Web Form Dialog ───────────────────────────────────────────────────────────
function WebFormDialog({
  form,
  onClose,
  onSave,
}: {
  form: Partial<WebForm> | null;
  onClose: () => void;
  onSave: (f: WebForm) => void;
}) {
  const [title, setTitle] = useState(form?.title ?? "");
  const [description, setDescription] = useState(form?.description ?? "");
  const [module, setModule] = useState(form?.module ?? "lead");
  const [redirectUrl, setRedirectUrl] = useState(form?.redirect_url ?? "");
  const [saving, setSaving] = useState(false);

  const defaultFields = [
    { field_key: "first_name", label: "First Name", field_type: "text", required: false },
    { field_key: "last_name", label: "Last Name", field_type: "text", required: true },
    { field_key: "email", label: "Email", field_type: "email", required: false },
    { field_key: "phone", label: "Phone", field_type: "text", required: false },
    { field_key: "company", label: "Company", field_type: "text", required: false },
  ];

  async function save() {
    setSaving(true);
    try {
      const payload = {
        title,
        description: description || undefined,
        module,
        fields: defaultFields,
        redirect_url: redirectUrl || undefined,
        is_active: true,
      };
      const saved = form?.id
        ? await api.updateWebForm(form.id, payload)
        : await api.createWebForm(payload);
      onSave(saved);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">{form?.id ? "Edit" : "New"} Web Form</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Form Title *</label>
            <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Description</label>
            <textarea className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" rows={2}
              value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Target Module</label>
            <select className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={module} onChange={(e) => setModule(e.target.value)}>
              {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Redirect URL after submit</label>
            <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={redirectUrl} onChange={(e) => setRedirectUrl(e.target.value)} placeholder="https://example.com/thank-you" />
          </div>
          <p className="text-xs text-gray-500 bg-gray-50 rounded p-2">
            Default fields included: First Name, Last Name, Email, Phone, Company
          </p>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg" onClick={onClose}>Cancel</button>
          <button
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            disabled={saving || !title}
            onClick={save}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Import/Export Tab ─────────────────────────────────────────────────────────
function ImportExportTab() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await api.importLeadsCsv(file);
      setResult(res);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function downloadExport(module: string) {
    const url = api.exportCsv(module);
    const token = typeof window !== "undefined" ? localStorage.getItem("compass_token") : null;
    // Create a temporary anchor to download with auth header workaround
    // Since we can't set headers via anchor, we fetch and blob-download
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${module}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => alert(err.message));
  }

  return (
    <div className="space-y-8">
      {/* Import */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Import Leads from CSV</h3>
        <p className="text-sm text-gray-500 mb-4">
          Upload a CSV with headers: <code className="text-xs bg-gray-100 px-1 py-0.5 rounded font-mono">first_name, last_name, email, phone, company, title, source</code>
        </p>
        <div className="flex items-center gap-4">
          <label className="cursor-pointer px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 font-medium">
            {importing ? "Uploading…" : "Choose CSV File"}
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} disabled={importing} />
          </label>
        </div>
        {result && (
          <div className={`mt-4 p-4 rounded-lg text-sm ${result.errors.length ? "bg-yellow-50 border border-yellow-200" : "bg-emerald-50 border border-emerald-200"}`}>
            <p className="font-medium">
              {result.created} leads created · {result.skipped} skipped
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-yellow-800">
                {result.errors.map((e, i) => <li key={i} className="font-mono text-xs">{e}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Export */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Export Data as CSV</h3>
        <p className="text-sm text-gray-500 mb-4">Download all records for a module as a CSV file.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {["leads", "contacts", "accounts", "deals"].map((module) => (
            <button
              key={module}
              onClick={() => downloadExport(module)}
              className="px-4 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 text-left capitalize"
            >
              <span className="block text-lg mb-1">⬇️</span>
              {module}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DataToolsPage() {
  const [tab, setTab] = useState<Tab>("custom_fields");
  const [fields, setFields] = useState<CustomField[]>([]);
  const [forms, setForms] = useState<WebForm[]>([]);
  const [fieldDialog, setFieldDialog] = useState<Partial<CustomField> | null | false>(false);
  const [formDialog, setFormDialog] = useState<Partial<WebForm> | null | false>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.listCustomFields(), api.listWebForms()])
      .then(([cf, wf]) => {
        setFields(cf.items);
        setForms(wf.items);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function deleteField(id: string) {
    if (!confirm("Delete this custom field?")) return;
    await api.deleteCustomField(id);
    setFields((prev) => prev.filter((f) => f.id !== id));
  }

  async function deleteForm(id: string) {
    if (!confirm("Delete this web form?")) return;
    await api.deleteWebForm(id);
    setForms((prev) => prev.filter((f) => f.id !== id));
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "custom_fields", label: "Custom Fields" },
    { id: "web_forms", label: "Web Forms" },
    { id: "import_export", label: "Import / Export" },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Tools</h1>
          <p className="text-sm text-gray-500 mt-0.5">Custom fields, web forms, import &amp; export</p>
        </div>
        {tab === "custom_fields" && (
          <button className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 font-medium"
            onClick={() => setFieldDialog({})}>+ Add Custom Field</button>
        )}
        {tab === "web_forms" && (
          <button className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 font-medium"
            onClick={() => setFormDialog({})}>+ New Web Form</button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "import_export" ? (
        <ImportExportTab />
      ) : loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : tab === "custom_fields" ? (
        fields.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg font-medium">No custom fields</p>
            <p className="text-sm mt-1">Add custom fields to extend any CRM module.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {["Module", "Field Key", "Label", "Type", "Required"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {fields.map((f) => (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 capitalize text-gray-700">{f.module}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{f.field_key}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{f.label}</td>
                    <td className="px-4 py-3 text-gray-600">{f.field_type}</td>
                    <td className="px-4 py-3">
                      {f.is_required ? (
                        <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full">Required</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <button className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100" onClick={() => setFieldDialog(f)}>Edit</button>
                        <button className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100" onClick={() => deleteField(f.id)}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        forms.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg font-medium">No web forms</p>
            <p className="text-sm mt-1">Create embeddable forms to capture leads from your website.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {forms.map((f) => (
              <div key={f.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-gray-900">{f.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 capitalize">{f.module} form</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                    {f.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                {f.description && <p className="text-sm text-gray-600 mb-3">{f.description}</p>}
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-gray-500">{f.submission_count} submissions</span>
                  <div className="flex gap-1">
                    <button
                      className="px-2 py-1 text-xs bg-gray-50 text-gray-700 rounded hover:bg-gray-100"
                      onClick={() => {
                        const url = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/web-forms/${f.id}/submit`;
                        navigator.clipboard.writeText(url);
                        alert("Submission URL copied to clipboard!");
                      }}
                    >
                      Copy URL
                    </button>
                    <button className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100" onClick={() => setFormDialog(f)}>Edit</button>
                    <button className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100" onClick={() => deleteForm(f.id)}>Del</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Dialogs */}
      {fieldDialog !== false && (
        <CustomFieldDialog
          field={fieldDialog}
          onClose={() => setFieldDialog(false)}
          onSave={(saved) => {
            setFields((prev) =>
              fieldDialog && (fieldDialog as CustomField).id
                ? prev.map((x) => (x.id === saved.id ? saved : x))
                : [...prev, saved]
            );
            setFieldDialog(false);
          }}
        />
      )}
      {formDialog !== false && (
        <WebFormDialog
          form={formDialog}
          onClose={() => setFormDialog(false)}
          onSave={(saved) => {
            setForms((prev) =>
              formDialog && (formDialog as WebForm).id
                ? prev.map((x) => (x.id === saved.id ? saved : x))
                : [saved, ...prev]
            );
            setFormDialog(false);
          }}
        />
      )}
    </div>
  );
}
