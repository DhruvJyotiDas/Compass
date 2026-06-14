export const LEAD_SOURCES = ["Web", "Referral", "Cold Call", "Event", "Advertisement", "Partner", "Social Media"];
export const LEAD_STATUSES = ["new", "contacted", "qualified", "unqualified", "converted"];
export const RATINGS = ["hot", "warm", "cold"];
export const INDUSTRIES = ["Technology", "Finance", "Healthcare", "Retail", "Manufacturing", "Education", "Real Estate", "Media"];
export const ACCOUNT_TYPES = ["customer", "prospect", "partner", "vendor", "reseller"];
export const DEAL_TYPES = ["new_business", "existing_business", "renewal"];
export const PRIORITIES = ["low", "normal", "high"];

export const opt = (values: string[]) => values.map((v) => ({ value: v, label: titleCase(v) }));

export function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// P2
export const PRODUCT_CATEGORIES = ["Software", "Hardware", "Services", "Subscription", "Consulting", "Training", "Support", "Other"];
export const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AUD", "CAD", "SGD", "AED"];
export const QUOTE_STATUSES = ["draft", "sent", "accepted", "declined", "expired"];
export const SO_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"];
export const INVOICE_STATUSES = ["draft", "sent", "paid", "overdue", "void"];
export const PO_STATUSES = ["draft", "sent", "received", "billed", "cancelled"];
export const PAYMENT_TERMS = ["Net 15", "Net 30", "Net 45", "Net 60", "Due on receipt", "COD"];

// P3
export const CASE_STATUSES = ["new", "open", "pending_customer", "on_hold", "closed"];
export const CASE_PRIORITIES = ["low", "medium", "high", "critical"];
export const CASE_TYPES = ["question", "problem", "feature_request", "other"];
export const CASE_SOURCES = ["email", "phone", "web", "chat"];
export const SOLUTION_STATUSES = ["draft", "published"];
export const SOLUTION_CATEGORIES = ["General", "Billing", "Technical", "Account", "Security", "Integration", "Other"];

export const STATUS_BADGE: Record<string, "default" | "success" | "warning" | "danger" | "info" | "secondary"> = {
  new: "info",
  contacted: "warning",
  qualified: "success",
  unqualified: "danger",
  converted: "secondary",
  open: "info",
  won: "success",
  lost: "danger",
  hot: "danger",
  warm: "warning",
  cold: "info",
  // P2 doc statuses
  draft: "secondary",
  sent: "info",
  accepted: "success",
  declined: "danger",
  expired: "secondary",
  pending: "warning",
  confirmed: "info",
  shipped: "info",
  delivered: "success",
  cancelled: "danger",
  paid: "success",
  overdue: "danger",
  void: "secondary",
  received: "success",
  billed: "info",
  // P3 case statuses
  pending_customer: "warning",
  on_hold: "secondary",
  closed: "secondary",
  // priorities
  low: "secondary",
  medium: "info",
  high: "warning",
  critical: "danger",
  // solution statuses
  published: "success",
};
