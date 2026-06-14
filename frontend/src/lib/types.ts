export type Role = "admin" | "manager" | "sales_rep";

export interface User {
  id: string;
  org_id: string;
  email: string;
  name: string;
  role: Role;
  title?: string | null;
  phone?: string | null;
  is_active: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}

export interface Lead {
  id: string;
  owner_id?: string | null;
  first_name?: string | null;
  last_name: string;
  company?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  website?: string | null;
  source?: string | null;
  status: string;
  rating?: string | null;
  score: number;
  industry?: string | null;
  annual_revenue?: number | null;
  no_of_employees?: number | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  zip_code?: string | null;
  description?: string | null;
  converted: boolean;
  converted_account_id?: string | null;
  converted_contact_id?: string | null;
  converted_deal_id?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface Account {
  id: string;
  owner_id?: string | null;
  name: string;
  industry?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  type?: string | null;
  annual_revenue?: number | null;
  no_of_employees?: number | null;
  parent_account_id?: string | null;
  billing_street?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_country?: string | null;
  billing_zip?: string | null;
  description?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface Contact {
  id: string;
  owner_id?: string | null;
  account_id?: string | null;
  first_name?: string | null;
  last_name: string;
  title?: string | null;
  department?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  source?: string | null;
  mailing_street?: string | null;
  mailing_city?: string | null;
  mailing_state?: string | null;
  mailing_country?: string | null;
  mailing_zip?: string | null;
  description?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface Stage {
  id: string;
  pipeline_id: string;
  name: string;
  sort_order: number;
  probability: number;
  type: "open" | "won" | "lost";
}

export interface Pipeline {
  id: string;
  name: string;
  is_default: boolean;
  stages: Stage[];
}

export interface Deal {
  id: string;
  owner_id?: string | null;
  name: string;
  account_id?: string | null;
  contact_id?: string | null;
  pipeline_id: string;
  stage_id: string;
  amount?: number | null;
  currency: string;
  close_date?: string | null;
  probability?: number | null;
  source?: string | null;
  type?: string | null;
  status: "open" | "won" | "lost";
  description?: string | null;
  closed_at?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface Activity {
  id: string;
  owner_id?: string | null;
  type: "task" | "call" | "meeting";
  subject: string;
  status: string;
  priority: string;
  due_date?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  location?: string | null;
  call_type?: string | null;
  call_result?: string | null;
  description?: string | null;
  completed_at?: string | null;
  related_module?: string | null;
  related_id?: string | null;
  created_at: string;
}

export interface Note {
  id: string;
  author_id?: string | null;
  related_module: string;
  related_id: string;
  body: string;
  created_at: string;
}

export interface TimelineEvent {
  id: string;
  actor_id?: string | null;
  module: string;
  record_id: string;
  verb: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface SearchHit {
  module: string;
  id: string;
  title: string;
  subtitle?: string | null;
}

// ── P2 — Sales Documents ──────────────────────────────────────────────────────

export interface Product {
  id: string;
  org_id: string;
  name: string;
  code?: string | null;
  category?: string | null;
  description?: string | null;
  unit_price: number;
  tax_rate: number;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface PriceBookItem {
  id: string;
  price_book_id: string;
  product_id: string;
  price: number;
}

export interface PriceBook {
  id: string;
  org_id: string;
  name: string;
  description?: string | null;
  is_default: boolean;
  is_active: boolean;
  items: PriceBookItem[];
  created_at: string;
  updated_at?: string | null;
}

export interface LineItem {
  id?: string;
  product_id?: string | null;
  name: string;
  description?: string | null;
  qty: number;
  unit_price: number;
  discount_pct: number;
  total: number;
}

export interface Quote {
  id: string;
  org_id: string;
  owner_id?: string | null;
  quote_number: string;
  subject: string;
  account_id?: string | null;
  contact_id?: string | null;
  deal_id?: string | null;
  status: string;
  valid_until?: string | null;
  line_items: LineItem[];
  subtotal?: number | null;
  discount_pct?: number | null;
  tax_pct?: number | null;
  total?: number | null;
  currency: string;
  billing_street?: string | null;
  billing_city?: string | null;
  billing_country?: string | null;
  shipping_street?: string | null;
  shipping_city?: string | null;
  shipping_country?: string | null;
  payment_terms?: string | null;
  terms_and_conditions?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface SalesOrder {
  id: string;
  org_id: string;
  owner_id?: string | null;
  so_number: string;
  subject: string;
  account_id?: string | null;
  contact_id?: string | null;
  deal_id?: string | null;
  quote_id?: string | null;
  status: string;
  expected_ship_date?: string | null;
  line_items: LineItem[];
  subtotal?: number | null;
  discount_pct?: number | null;
  tax_pct?: number | null;
  total?: number | null;
  currency: string;
  billing_street?: string | null;
  billing_city?: string | null;
  billing_country?: string | null;
  shipping_street?: string | null;
  shipping_city?: string | null;
  shipping_country?: string | null;
  payment_terms?: string | null;
  terms_and_conditions?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface Invoice {
  id: string;
  org_id: string;
  owner_id?: string | null;
  invoice_number: string;
  subject: string;
  account_id?: string | null;
  contact_id?: string | null;
  deal_id?: string | null;
  sales_order_id?: string | null;
  status: string;
  due_date?: string | null;
  payment_terms?: string | null;
  line_items: LineItem[];
  subtotal?: number | null;
  discount_pct?: number | null;
  tax_pct?: number | null;
  total?: number | null;
  currency: string;
  billing_street?: string | null;
  billing_city?: string | null;
  billing_country?: string | null;
  terms_and_conditions?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface PurchaseOrder {
  id: string;
  org_id: string;
  owner_id?: string | null;
  po_number: string;
  subject: string;
  vendor_name?: string | null;
  vendor_email?: string | null;
  vendor_phone?: string | null;
  status: string;
  expected_delivery?: string | null;
  line_items: LineItem[];
  subtotal?: number | null;
  discount_pct?: number | null;
  tax_pct?: number | null;
  total?: number | null;
  currency: string;
  delivery_street?: string | null;
  delivery_city?: string | null;
  delivery_country?: string | null;
  payment_terms?: string | null;
  terms_and_conditions?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string | null;
}

// ── P3 — Support ──────────────────────────────────────────────────────────────

export interface SLAPolicy {
  id: string;
  org_id: string;
  name: string;
  description?: string | null;
  response_low: number;
  response_medium: number;
  response_high: number;
  response_critical: number;
  resolution_low: number;
  resolution_medium: number;
  resolution_high: number;
  resolution_critical: number;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface Case {
  id: string;
  org_id: string;
  owner_id?: string | null;
  case_number: string;
  subject: string;
  description?: string | null;
  account_id?: string | null;
  contact_id?: string | null;
  status: string;
  priority: string;
  type?: string | null;
  source?: string | null;
  resolution?: string | null;
  closed_at?: string | null;
  first_responded_at?: string | null;
  sla_policy_id?: string | null;
  sla_first_response_due?: string | null;
  sla_resolution_due?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface Solution {
  id: string;
  org_id: string;
  author_id?: string | null;
  title: string;
  body: string;
  category?: string | null;
  status: string;
  views: number;
  helpful_votes: number;
  created_at: string;
  updated_at?: string | null;
}

export interface DashboardData {
  open_pipeline_value: number;
  open_deals: number;
  won_this_month_value: number;
  won_this_month_count: number;
  lost_this_month_count: number;
  total_leads: number;
  conversion_rate: number;
  activities_overdue: number;
  activities_due_today: number;
  leads_by_status: { status: string; count: number }[];
  leads_by_source: { source: string; count: number }[];
  deals_by_stage: { stage: string; count: number; value: number }[];
}

// ── P4 — Workflow Automation ─────────────────────────────────────────────────

export interface WorkflowCondition {
  field: string;
  op: string;
  value?: string | null;
}

export interface WorkflowActionConfig {
  // field_update
  field?: string;
  value?: string;
  // create_task
  subject?: string;
  priority?: string;
  due_days?: number;
  // webhook
  url?: string;
  method?: string;
}

export interface WorkflowAction {
  id: string;
  rule_id: string;
  sort_order: number;
  action_type: string;
  config: WorkflowActionConfig;
}

export interface WorkflowRule {
  id: string;
  org_id: string;
  name: string;
  description?: string | null;
  module: string;
  trigger: string;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkflowLog {
  id: string;
  rule_id?: string | null;
  org_id: string;
  record_module: string;
  record_id: string;
  triggered_at: string;
  status: string;
  detail: Record<string, unknown>;
}

export interface AssignmentRule {
  id: string;
  org_id: string;
  name: string;
  module: string;
  strategy: string;
  criteria: WorkflowCondition[];
  assignees: string[];
  current_index: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScoringRule {
  id: string;
  org_id: string;
  name: string;
  module: string;
  criteria: (WorkflowCondition & { score: number })[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── P5 — Reports & Goals ─────────────────────────────────────────────────────

export interface Goal {
  id: string;
  org_id: string;
  owner_id?: string | null;
  name: string;
  metric: string;
  target_value: number;
  period_type: string;
  period_start: string;
  period_end: string;
  created_at: string;
}

export interface PipelineStage {
  stage: string;
  probability: number;
  count: number;
  value: number;
  weighted_value: number;
}

export interface PipelineReport {
  stages: PipelineStage[];
  total_pipeline: number;
  weighted_forecast: number;
}

export interface LeadsReport {
  period: string;
  total: number;
  converted: number;
  conversion_rate: number;
  by_status: { status: string; count: number }[];
  by_source: { source: string; count: number }[];
}

export interface ActivitiesReport {
  period: string;
  overdue: number;
  by_type: { type: string; total: number; completed: number; open: number }[];
}

export interface WinLossReport {
  period: string;
  won: { count: number; value: number };
  lost: { count: number; value: number };
  win_rate: number;
}

export interface ForecastMonth {
  month: string;
  won: number;
  weighted_open: number;
  total: number;
}

export interface ForecastReport {
  months: ForecastMonth[];
}

// ── P6 — Marketing ────────────────────────────────────────────────────────────

export interface EmailTemplate {
  id: string;
  org_id: string;
  created_by?: string | null;
  name: string;
  subject: string;
  body: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface MarketingCampaign {
  id: string;
  org_id: string;
  created_by?: string | null;
  name: string;
  description?: string | null;
  status: string;
  template_id?: string | null;
  filter_criteria: Record<string, unknown>[];
  total_recipients: number;
  sent_count: number;
  open_count: number;
  scheduled_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at?: string | null;
}

// ── P7 — Custom Fields & Web Forms ───────────────────────────────────────────

export interface CustomField {
  id: string;
  org_id: string;
  module: string;
  field_key: string;
  label: string;
  field_type: string;
  options: string[];
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface WebForm {
  id: string;
  org_id: string;
  created_by?: string | null;
  title: string;
  description?: string | null;
  module: string;
  fields: Record<string, unknown>[];
  redirect_url?: string | null;
  is_active: boolean;
  submission_count: number;
  created_at: string;
  updated_at?: string | null;
}
