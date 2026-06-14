"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { EmailTemplate, MarketingCampaign, Page } from "@/lib/types";

type Tab = "campaigns" | "templates";

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    running: "bg-blue-100 text-blue-700",
    completed: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-red-100 text-red-700",
    active: "bg-emerald-100 text-emerald-700",
    inactive: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status}
    </span>
  );
}

// ── Campaign Dialog ───────────────────────────────────────────────────────────
function CampaignDialog({
  campaign,
  templates,
  onClose,
  onSave,
}: {
  campaign: Partial<MarketingCampaign> | null;
  templates: EmailTemplate[];
  onClose: () => void;
  onSave: (c: MarketingCampaign) => void;
}) {
  const [name, setName] = useState(campaign?.name ?? "");
  const [description, setDescription] = useState(campaign?.description ?? "");
  const [templateId, setTemplateId] = useState(campaign?.template_id ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const payload = { name, description: description || undefined, template_id: templateId || undefined };
      const saved = campaign?.id
        ? await api.updateCampaign(campaign.id, payload)
        : await api.createCampaign(payload);
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
        <h2 className="text-lg font-semibold mb-4">{campaign?.id ? "Edit" : "New"} Campaign</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Name *</label>
            <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Description</label>
            <textarea className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" rows={2}
              value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Email Template</label>
            <select className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">— none —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg" onClick={onClose}>Cancel</button>
          <button
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            disabled={saving || !name}
            onClick={save}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Template Dialog ───────────────────────────────────────────────────────────
function TemplateDialog({
  template,
  onClose,
  onSave,
}: {
  template: Partial<EmailTemplate> | null;
  onClose: () => void;
  onSave: (t: EmailTemplate) => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const payload = { name, subject, body, is_active: true };
      const saved = template?.id
        ? await api.updateEmailTemplate(template.id, payload)
        : await api.createEmailTemplate(payload);
      onSave(saved);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl p-6">
        <h2 className="text-lg font-semibold mb-4">{template?.id ? "Edit" : "New"} Template</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Template Name *</label>
            <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Subject Line *</label>
            <input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Body (HTML or plain text)</label>
            <textarea className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y" rows={8}
              value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg" onClick={onClose}>Cancel</button>
          <button
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            disabled={saving || !name || !subject}
            onClick={save}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MarketingPage() {
  const [tab, setTab] = useState<Tab>("campaigns");
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [campaignDialog, setCampaignDialog] = useState<Partial<MarketingCampaign> | null | false>(false);
  const [templateDialog, setTemplateDialog] = useState<Partial<EmailTemplate> | null | false>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.listCampaigns(), api.listEmailTemplates()])
      .then(([c, t]) => {
        setCampaigns(c.items);
        setTemplates(t.items);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function launch(c: MarketingCampaign) {
    if (!confirm(`Launch "${c.name}"? This will send to all matching leads.`)) return;
    try {
      const updated = await api.launchCampaign(c.id);
      setCampaigns((prev) => prev.map((x) => (x.id === c.id ? updated : x)));
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function cancel(c: MarketingCampaign) {
    try {
      const updated = await api.cancelCampaign(c.id);
      setCampaigns((prev) => prev.map((x) => (x.id === c.id ? updated : x)));
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function deleteCampaign(id: string) {
    if (!confirm("Delete this campaign?")) return;
    try {
      await api.deleteCampaign(id);
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Delete this template?")) return;
    try {
      await api.deleteEmailTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Marketing</h1>
          <p className="text-sm text-gray-500 mt-0.5">Email campaigns &amp; templates</p>
        </div>
        <button
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 font-medium"
          onClick={() => tab === "campaigns" ? setCampaignDialog({}) : setTemplateDialog({})}
        >
          + New {tab === "campaigns" ? "Campaign" : "Template"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {(["campaigns", "templates"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              tab === t ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : tab === "campaigns" ? (
        campaigns.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg font-medium">No campaigns yet</p>
            <p className="text-sm mt-1">Create your first email campaign to get started.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {["Name", "Status", "Recipients", "Sent", "Opens", "Created"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                  <th className="w-32" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3 text-gray-600">{c.total_recipients}</td>
                    <td className="px-4 py-3 text-gray-600">{c.sent_count}</td>
                    <td className="px-4 py-3 text-gray-600">{c.open_count}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(c.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {c.status === "draft" && (
                          <>
                            <button className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100" onClick={() => setCampaignDialog(c)}>Edit</button>
                            <button className="px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100" onClick={() => launch(c)}>Launch</button>
                          </>
                        )}
                        {c.status === "running" && (
                          <button className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100" onClick={() => cancel(c)}>Cancel</button>
                        )}
                        <button className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100" onClick={() => deleteCampaign(c.id)}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        templates.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg font-medium">No templates yet</p>
            <p className="text-sm mt-1">Create email templates to use in campaigns.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {["Name", "Subject", "Status", "Created"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {templates.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{t.subject}</td>
                    <td className="px-4 py-3"><StatusBadge status={t.is_active ? "active" : "inactive"} /></td>
                    <td className="px-4 py-3 text-gray-500">{new Date(t.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100" onClick={() => setTemplateDialog(t)}>Edit</button>
                        <button className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100" onClick={() => deleteTemplate(t.id)}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Dialogs */}
      {campaignDialog !== false && (
        <CampaignDialog
          campaign={campaignDialog}
          templates={templates}
          onClose={() => setCampaignDialog(false)}
          onSave={(saved) => {
            setCampaigns((prev) =>
              campaignDialog && (campaignDialog as MarketingCampaign).id
                ? prev.map((x) => (x.id === saved.id ? saved : x))
                : [saved, ...prev]
            );
            setCampaignDialog(false);
          }}
        />
      )}
      {templateDialog !== false && (
        <TemplateDialog
          template={templateDialog}
          onClose={() => setTemplateDialog(false)}
          onSave={(saved) => {
            setTemplates((prev) =>
              templateDialog && (templateDialog as EmailTemplate).id
                ? prev.map((x) => (x.id === saved.id ? saved : x))
                : [saved, ...prev]
            );
            setTemplateDialog(false);
          }}
        />
      )}
    </div>
  );
}
