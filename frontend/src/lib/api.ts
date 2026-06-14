import type {
  Account,
  ActivitiesReport,
  Activity,
  AssignmentRule,
  Case,
  Contact,
  CustomField,
  DashboardData,
  Deal,
  EmailTemplate,
  ForecastReport,
  Goal,
  Invoice,
  Lead,
  LeadsReport,
  MarketingCampaign,
  Note,
  Page,
  Pipeline,
  PipelineReport,
  PriceBook,
  Product,
  PurchaseOrder,
  Quote,
  SalesOrder,
  ScoringRule,
  SearchHit,
  SLAPolicy,
  Solution,
  Tag,
  TimelineEvent,
  User,
  WebForm,
  WinLossReport,
  WorkflowLog,
  WorkflowRule,
} from "./types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const TOKEN_KEY = "compass_token";

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (res.status === 401 && typeof window !== "undefined") {
    clearToken();
    if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

function qs(params: Record<string, unknown>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export interface ListParams {
  q?: string;
  sort?: string;
  page?: number;
  per_page?: number;
  [key: string]: unknown;
}

export const api = {
  // ── Auth ──
  register: (body: { org_name: string; name: string; email: string; password: string }) =>
    request<{ access_token: string; user: User }>("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<{ access_token: string; user: User }>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  me: () => request<User>("/auth/me"),

  // ── Users ──
  listUsers: () => request<User[]>("/users"),
  createUser: (body: Partial<User> & { password: string }) =>
    request<User>("/users", { method: "POST", body: JSON.stringify(body) }),
  updateUser: (id: string, body: Record<string, unknown>) =>
    request<User>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  // ── Generic module factory ──
  listLeads: (p: ListParams = {}) => request<Page<Lead>>(`/leads${qs(p)}`),
  getLead: (id: string) => request<Lead>(`/leads/${id}`),
  createLead: (b: Partial<Lead>) => request<Lead>("/leads", { method: "POST", body: JSON.stringify(b) }),
  updateLead: (id: string, b: Partial<Lead>) => request<Lead>(`/leads/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteLead: (id: string) => request<unknown>(`/leads/${id}`, { method: "DELETE" }),
  convertLead: (id: string, b: { create_deal: boolean; deal_name?: string; deal_amount?: number }) =>
    request<{ account_id: string; contact_id: string; deal_id?: string }>(`/leads/${id}/convert`, {
      method: "POST",
      body: JSON.stringify(b),
    }),

  listAccounts: (p: ListParams = {}) => request<Page<Account>>(`/accounts${qs(p)}`),
  getAccount: (id: string) => request<Account>(`/accounts/${id}`),
  createAccount: (b: Partial<Account>) => request<Account>("/accounts", { method: "POST", body: JSON.stringify(b) }),
  updateAccount: (id: string, b: Partial<Account>) => request<Account>(`/accounts/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteAccount: (id: string) => request<unknown>(`/accounts/${id}`, { method: "DELETE" }),

  listContacts: (p: ListParams = {}) => request<Page<Contact>>(`/contacts${qs(p)}`),
  getContact: (id: string) => request<Contact>(`/contacts/${id}`),
  createContact: (b: Partial<Contact>) => request<Contact>("/contacts", { method: "POST", body: JSON.stringify(b) }),
  updateContact: (id: string, b: Partial<Contact>) => request<Contact>(`/contacts/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteContact: (id: string) => request<unknown>(`/contacts/${id}`, { method: "DELETE" }),

  listDeals: (p: ListParams = {}) => request<Page<Deal>>(`/deals${qs(p)}`),
  getDeal: (id: string) => request<Deal>(`/deals/${id}`),
  createDeal: (b: Partial<Deal>) => request<Deal>("/deals", { method: "POST", body: JSON.stringify(b) }),
  updateDeal: (id: string, b: Partial<Deal>) => request<Deal>(`/deals/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  moveDeal: (id: string, stage_id: string) => request<Deal>(`/deals/${id}/stage`, { method: "PATCH", body: JSON.stringify({ stage_id }) }),
  deleteDeal: (id: string) => request<unknown>(`/deals/${id}`, { method: "DELETE" }),

  // ── Pipelines ──
  listPipelines: () => request<Pipeline[]>("/deal-pipelines"),
  createPipeline: (b: { name: string; is_default?: boolean; stages: Partial<{ name: string; sort_order: number; probability: number; type: string }>[] }) =>
    request<Pipeline>("/deal-pipelines", { method: "POST", body: JSON.stringify(b) }),

  // ── Activities ──
  listActivities: (p: ListParams = {}) => request<Page<Activity>>(`/activities${qs(p)}`),
  createActivity: (b: Partial<Activity>) => request<Activity>("/activities", { method: "POST", body: JSON.stringify(b) }),
  updateActivity: (id: string, b: Partial<Activity>) => request<Activity>(`/activities/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteActivity: (id: string) => request<unknown>(`/activities/${id}`, { method: "DELETE" }),

  // ── Notes / Timeline / Tags ──
  listNotes: (related_module: string, related_id: string) =>
    request<Note[]>(`/notes${qs({ related_module, related_id })}`),
  createNote: (b: { related_module: string; related_id: string; body: string }) =>
    request<Note>("/notes", { method: "POST", body: JSON.stringify(b) }),
  deleteNote: (id: string) => request<unknown>(`/notes/${id}`, { method: "DELETE" }),
  getTimeline: (module: string, record_id: string) =>
    request<TimelineEvent[]>(`/timeline${qs({ module, record_id })}`),
  listTags: () => request<Tag[]>("/tags"),
  createTag: (b: { name: string; color?: string }) => request<Tag>("/tags", { method: "POST", body: JSON.stringify(b) }),

  // ── Search / Dashboard ──
  search: (q: string) => request<{ hits: SearchHit[] }>(`/search${qs({ q })}`),
  dashboard: () => request<DashboardData>("/dashboard"),

  // ── P2 — Products ──
  listProducts: (p: ListParams = {}) => request<Page<Product>>(`/products${qs(p)}`),
  getProduct: (id: string) => request<Product>(`/products/${id}`),
  createProduct: (b: Partial<Product>) => request<Product>("/products", { method: "POST", body: JSON.stringify(b) }),
  updateProduct: (id: string, b: Partial<Product>) => request<Product>(`/products/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteProduct: (id: string) => request<unknown>(`/products/${id}`, { method: "DELETE" }),

  // ── P2 — Price Books ──
  listPriceBooks: () => request<PriceBook[]>("/price-books"),
  getPriceBook: (id: string) => request<PriceBook>(`/price-books/${id}`),
  createPriceBook: (b: Partial<PriceBook>) => request<PriceBook>("/price-books", { method: "POST", body: JSON.stringify(b) }),
  updatePriceBook: (id: string, b: Partial<PriceBook>) => request<PriceBook>(`/price-books/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deletePriceBook: (id: string) => request<unknown>(`/price-books/${id}`, { method: "DELETE" }),

  // ── P2 — Quotes ──
  listQuotes: (p: ListParams = {}) => request<Page<Quote>>(`/quotes${qs(p)}`),
  getQuote: (id: string) => request<Quote>(`/quotes/${id}`),
  createQuote: (b: Partial<Quote>) => request<Quote>("/quotes", { method: "POST", body: JSON.stringify(b) }),
  updateQuote: (id: string, b: Partial<Quote>) => request<Quote>(`/quotes/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteQuote: (id: string) => request<unknown>(`/quotes/${id}`, { method: "DELETE" }),

  // ── P2 — Sales Orders ──
  listSalesOrders: (p: ListParams = {}) => request<Page<SalesOrder>>(`/sales-orders${qs(p)}`),
  getSalesOrder: (id: string) => request<SalesOrder>(`/sales-orders/${id}`),
  createSalesOrder: (b: Partial<SalesOrder>) => request<SalesOrder>("/sales-orders", { method: "POST", body: JSON.stringify(b) }),
  updateSalesOrder: (id: string, b: Partial<SalesOrder>) => request<SalesOrder>(`/sales-orders/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteSalesOrder: (id: string) => request<unknown>(`/sales-orders/${id}`, { method: "DELETE" }),

  // ── P2 — Invoices ──
  listInvoices: (p: ListParams = {}) => request<Page<Invoice>>(`/invoices${qs(p)}`),
  getInvoice: (id: string) => request<Invoice>(`/invoices/${id}`),
  createInvoice: (b: Partial<Invoice>) => request<Invoice>("/invoices", { method: "POST", body: JSON.stringify(b) }),
  updateInvoice: (id: string, b: Partial<Invoice>) => request<Invoice>(`/invoices/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteInvoice: (id: string) => request<unknown>(`/invoices/${id}`, { method: "DELETE" }),

  // ── P2 — Purchase Orders ──
  listPurchaseOrders: (p: ListParams = {}) => request<Page<PurchaseOrder>>(`/purchase-orders${qs(p)}`),
  getPurchaseOrder: (id: string) => request<PurchaseOrder>(`/purchase-orders/${id}`),
  createPurchaseOrder: (b: Partial<PurchaseOrder>) => request<PurchaseOrder>("/purchase-orders", { method: "POST", body: JSON.stringify(b) }),
  updatePurchaseOrder: (id: string, b: Partial<PurchaseOrder>) => request<PurchaseOrder>(`/purchase-orders/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deletePurchaseOrder: (id: string) => request<unknown>(`/purchase-orders/${id}`, { method: "DELETE" }),

  // ── P3 — SLA Policies ──
  listSLAPolicies: () => request<SLAPolicy[]>("/sla-policies"),
  createSLAPolicy: (b: Partial<SLAPolicy>) => request<SLAPolicy>("/sla-policies", { method: "POST", body: JSON.stringify(b) }),
  updateSLAPolicy: (id: string, b: Partial<SLAPolicy>) => request<SLAPolicy>(`/sla-policies/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteSLAPolicy: (id: string) => request<unknown>(`/sla-policies/${id}`, { method: "DELETE" }),

  // ── P3 — Cases ──
  listCases: (p: ListParams = {}) => request<Page<Case>>(`/cases${qs(p)}`),
  getCase: (id: string) => request<Case>(`/cases/${id}`),
  createCase: (b: Partial<Case>) => request<Case>("/cases", { method: "POST", body: JSON.stringify(b) }),
  updateCase: (id: string, b: Partial<Case>) => request<Case>(`/cases/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteCase: (id: string) => request<unknown>(`/cases/${id}`, { method: "DELETE" }),

  // ── P3 — Solutions ──
  listSolutions: (p: ListParams = {}) => request<Page<Solution>>(`/solutions${qs(p)}`),
  getSolution: (id: string) => request<Solution>(`/solutions/${id}`),
  createSolution: (b: Partial<Solution>) => request<Solution>("/solutions", { method: "POST", body: JSON.stringify(b) }),
  updateSolution: (id: string, b: Partial<Solution>) => request<Solution>(`/solutions/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteSolution: (id: string) => request<unknown>(`/solutions/${id}`, { method: "DELETE" }),
  markSolutionHelpful: (id: string) => request<Solution>(`/solutions/${id}/helpful`, { method: "POST" }),

  // ── P4 — Workflow Rules ──
  listWorkflowRules: (module?: string) =>
    request<WorkflowRule[]>(`/workflow-rules${module ? `?module=${module}` : ""}`),
  getWorkflowRule: (id: string) => request<WorkflowRule>(`/workflow-rules/${id}`),
  createWorkflowRule: (b: Partial<WorkflowRule> & { actions?: unknown[]; conditions?: unknown[] }) =>
    request<WorkflowRule>("/workflow-rules", { method: "POST", body: JSON.stringify(b) }),
  updateWorkflowRule: (id: string, b: Partial<WorkflowRule> & { actions?: unknown[]; conditions?: unknown[] }) =>
    request<WorkflowRule>(`/workflow-rules/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  toggleWorkflowRule: (id: string) =>
    request<WorkflowRule>(`/workflow-rules/${id}/toggle`, { method: "PATCH" }),
  deleteWorkflowRule: (id: string) =>
    request<unknown>(`/workflow-rules/${id}`, { method: "DELETE" }),
  listWorkflowLogs: (p: { module?: string; status?: string; page?: number; per_page?: number } = {}) =>
    request<Page<WorkflowLog>>(`/workflow-rules/logs${qs(p)}`),

  // ── P4 — Assignment Rules ──
  listAssignmentRules: (module?: string) =>
    request<AssignmentRule[]>(`/assignment-rules${module ? `?module=${module}` : ""}`),
  createAssignmentRule: (b: Partial<AssignmentRule>) =>
    request<AssignmentRule>("/assignment-rules", { method: "POST", body: JSON.stringify(b) }),
  updateAssignmentRule: (id: string, b: Partial<AssignmentRule>) =>
    request<AssignmentRule>(`/assignment-rules/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  toggleAssignmentRule: (id: string) =>
    request<AssignmentRule>(`/assignment-rules/${id}/toggle`, { method: "PATCH" }),
  deleteAssignmentRule: (id: string) =>
    request<unknown>(`/assignment-rules/${id}`, { method: "DELETE" }),

  // ── P4 — Scoring Rules ──
  listScoringRules: (module?: string) =>
    request<ScoringRule[]>(`/scoring-rules${module ? `?module=${module}` : ""}`),
  createScoringRule: (b: Partial<ScoringRule>) =>
    request<ScoringRule>("/scoring-rules", { method: "POST", body: JSON.stringify(b) }),
  updateScoringRule: (id: string, b: Partial<ScoringRule>) =>
    request<ScoringRule>(`/scoring-rules/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  toggleScoringRule: (id: string) =>
    request<ScoringRule>(`/scoring-rules/${id}/toggle`, { method: "PATCH" }),
  deleteScoringRule: (id: string) =>
    request<unknown>(`/scoring-rules/${id}`, { method: "DELETE" }),

  // ── P5 — Reports ──
  reportPipeline: () => request<PipelineReport>("/reports/pipeline"),
  reportLeads: (period?: string) => request<LeadsReport>(`/reports/leads${period ? `?period=${period}` : ""}`),
  reportActivities: (period?: string) => request<ActivitiesReport>(`/reports/activities${period ? `?period=${period}` : ""}`),
  reportWinLoss: (period?: string) => request<WinLossReport>(`/reports/win-loss${period ? `?period=${period}` : ""}`),
  reportForecast: (months?: number) => request<ForecastReport>(`/reports/forecast${months ? `?months=${months}` : ""}`),

  // ── P5 — Goals ──
  listGoals: (p: ListParams = {}) => request<Page<Goal>>(`/goals${qs(p)}`),
  createGoal: (b: Partial<Goal>) => request<Goal>("/goals", { method: "POST", body: JSON.stringify(b) }),
  updateGoal: (id: string, b: Partial<Goal>) => request<Goal>(`/goals/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteGoal: (id: string) => request<unknown>(`/goals/${id}`, { method: "DELETE" }),

  // ── P6 — Email Templates ──
  listEmailTemplates: (p: ListParams = {}) => request<Page<EmailTemplate>>(`/email-templates${qs(p)}`),
  createEmailTemplate: (b: Partial<EmailTemplate>) => request<EmailTemplate>("/email-templates", { method: "POST", body: JSON.stringify(b) }),
  updateEmailTemplate: (id: string, b: Partial<EmailTemplate>) => request<EmailTemplate>(`/email-templates/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteEmailTemplate: (id: string) => request<unknown>(`/email-templates/${id}`, { method: "DELETE" }),

  // ── P6 — Marketing Campaigns ──
  listCampaigns: (p: ListParams = {}) => request<Page<MarketingCampaign>>(`/marketing-campaigns${qs(p)}`),
  getCampaign: (id: string) => request<MarketingCampaign>(`/marketing-campaigns/${id}`),
  createCampaign: (b: Partial<MarketingCampaign>) => request<MarketingCampaign>("/marketing-campaigns", { method: "POST", body: JSON.stringify(b) }),
  updateCampaign: (id: string, b: Partial<MarketingCampaign>) => request<MarketingCampaign>(`/marketing-campaigns/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  launchCampaign: (id: string) => request<MarketingCampaign>(`/marketing-campaigns/${id}/launch`, { method: "POST" }),
  cancelCampaign: (id: string) => request<MarketingCampaign>(`/marketing-campaigns/${id}/cancel`, { method: "POST" }),
  deleteCampaign: (id: string) => request<unknown>(`/marketing-campaigns/${id}`, { method: "DELETE" }),

  // ── P7 — Custom Fields ──
  listCustomFields: (module?: string) =>
    request<Page<CustomField>>(`/custom-fields${module ? `?module=${module}` : ""}`),
  createCustomField: (b: Partial<CustomField>) => request<CustomField>("/custom-fields", { method: "POST", body: JSON.stringify(b) }),
  updateCustomField: (id: string, b: Partial<CustomField>) => request<CustomField>(`/custom-fields/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteCustomField: (id: string) => request<unknown>(`/custom-fields/${id}`, { method: "DELETE" }),

  // ── P7 — Web Forms ──
  listWebForms: (p: ListParams = {}) => request<Page<WebForm>>(`/web-forms${qs(p)}`),
  createWebForm: (b: Partial<WebForm>) => request<WebForm>("/web-forms", { method: "POST", body: JSON.stringify(b) }),
  updateWebForm: (id: string, b: Partial<WebForm>) => request<WebForm>(`/web-forms/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteWebForm: (id: string) => request<unknown>(`/web-forms/${id}`, { method: "DELETE" }),

  // ── P7 — Import / Export ──
  exportCsv: (module: string) => `${API}/import-export/export/${module}`,
  importLeadsCsv: async (file: File) => {
    const token = getToken();
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API}/import-export/import/leads`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body.detail || res.statusText);
    }
    return res.json() as Promise<{ created: number; skipped: number; errors: string[] }>;
  },
};
