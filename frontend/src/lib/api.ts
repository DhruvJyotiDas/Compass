const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const CHANNEL = process.env.NEXT_PUBLIC_CHANNEL_URL || "http://localhost:8001";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${path}: ${text}`);
  }
  return res.json();
}

export const api = {
  // Pipeline
  runPipeline: (goalText: string) =>
    apiFetch<{ pipeline_id: string; campaign_id: string; steps: Record<string, unknown> }>("/pipelines", {
      method: "POST",
      body: JSON.stringify({ goal_text: goalText }),
    }),

  getPipelineRuns: (pipelineId: string) =>
    apiFetch<Array<{ step: string; output: unknown; valid: boolean; latency_ms: number }>>(`/pipelines/${pipelineId}/runs`),

  // Campaigns
  getCampaign: (id: string) =>
    apiFetch<Campaign>(`/campaigns/${id}`),

  listCampaigns: () =>
    apiFetch<Campaign[]>("/campaigns"),

  approveCampaign: (id: string, segmentDsl?: SegmentDSL) =>
    apiFetch<{ status: string; audience_count: number }>(`/campaigns/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ segment_dsl: segmentDsl }),
    }),

  getCampaignStats: (id: string) =>
    apiFetch<CampaignStats>(`/campaigns/${id}/stats`),

  generateInsights: (id: string) =>
    apiFetch<InsightsOutput>(`/campaigns/${id}/insights`, { method: "POST" }),

  // Segments
  compileSegment: (dsl: SegmentDSL) =>
    apiFetch<CompileResponse>("/segments/compile", {
      method: "POST",
      body: JSON.stringify({ dsl }),
    }),

  // Channel service
  setChaosProfile: async (profile: string) => {
    const res = await fetch(`${CHANNEL}/chaos-profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile }),
    });
    return res.json();
  },

  getChaosProfile: async () => {
    const res = await fetch(`${CHANNEL}/chaos-profile`);
    return res.json();
  },

  // Admin
  seed: () =>
    apiFetch<{ customers: number; orders: number }>("/admin/seed", {
      method: "POST",
      headers: { "X-Admin-Secret": process.env.NEXT_PUBLIC_ADMIN_SECRET || "dev-admin-secret" },
    }),

  demoReset: () =>
    apiFetch("/admin/demo-reset", {
      method: "POST",
      headers: { "X-Admin-Secret": process.env.NEXT_PUBLIC_ADMIN_SECRET || "dev-admin-secret" },
    }),
};

// ── Types ────────────────────────────────────────────────────────────────────

export interface DSLFilter {
  field: string;
  op: string;
  value: number | string | boolean;
}

export interface SegmentDSL {
  filters: DSLFilter[];
  logic: string;
}

export interface CustomerPreview {
  id: string;
  name: string;
  email?: string;
  last_order_at?: string;
  lifetime_spend: number;
  order_count: number;
  match_trace: MatchTrace[];
}

export interface MatchTrace {
  field: string;
  op: string;
  value: unknown;
  actual: unknown;
  matched: boolean;
}

export interface CompileResponse {
  count: number;
  sql_preview: string;
  sample: CustomerPreview[];
}

export interface MessageVariant {
  variant_id: string;
  channel: string;
  subject?: string;
  body: string;
  tokens_used: string[];
}

export interface Campaign {
  id: string;
  name?: string;
  goal_text: string;
  intent?: Record<string, unknown>;
  segment_dsl?: { filters: DSLFilter[]; logic: string };
  plan?: { variants: Array<{ variant_id: string; channel: string; split_pct: number; name: string }> };
  message_variants?: MessageVariant[];
  insights?: InsightsOutput;
  status: string;
  audience_count?: number;
  pipeline_id?: string;
  created_at: string;
}

export interface CampaignStats {
  sent: number;
  delivered: number;
  opened: number;
  read: number;
  clicked: number;
  failed: number;
  converted: number;
  dlq_count: number;
  total: number;
}

export interface InsightsOutput {
  findings: string[];
  next_action: string;
  next_goal: string;
  confidence: string;
  best_variant?: string;
}

export interface PipelineStep {
  step: string;
  output: unknown;
  latency_ms: number;
  valid: boolean;
}
