"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, Campaign } from "@/lib/api";
import { fmt, Icon, ML } from "@/components/ui";

const STATUS_COLORS: Record<string, string> = {
  draft:     "var(--fg-muted)",
  approved:  "var(--accent)",
  running:   "var(--accent-bright)",
  completed: "var(--green)",
};

export default function CampaignsList() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listCampaigns()
      .then(setCampaigns)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", gap: 10, color: "var(--fg-muted)" }}>
        <Icon.spinner style={{ color: "var(--accent)" }} />
        <span>Loading campaigns…</span>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <ML>All campaigns</ML>
          <h1 style={{ margin: "8px 0 4px", fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>
            Campaign history
          </h1>
        </div>
        <Link href="/" className="btn btn-accent" style={{ textDecoration: "none" }}>
          <Icon.bolt />New campaign
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <p style={{ color: "var(--fg-muted)", marginBottom: 16 }}>No campaigns yet.</p>
          <Link href="/" className="btn btn-accent" style={{ textDecoration: "none" }}>
            <Icon.bolt />Run your first pipeline
          </Link>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {campaigns.map((c, i) => (
            <Link
              key={c.id}
              href={`/dashboard?campaignId=${c.id}`}
              style={{
                display: "block", padding: "14px 20px",
                borderBottom: i < campaigns.length - 1 ? "1px solid var(--border-soft)" : "none",
                textDecoration: "none", color: "inherit",
                transition: "background .14s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2 }}>{c.name || "Untitled campaign"}</div>
                  <div style={{ fontSize: 12, color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.goal_text}
                  </div>
                </div>
                <div style={{ textAlign: "right", fontSize: 12, minWidth: 100 }}>
                  <div style={{ color: STATUS_COLORS[c.status] || "var(--fg)", fontFamily: "var(--mono)", textTransform: "uppercase", fontSize: 10, letterSpacing: "0.08em" }}>
                    {c.status}
                  </div>
                  {c.audience_count != null && (
                    <div className="num" style={{ color: "var(--fg-muted)", marginTop: 2 }}>
                      {fmt(c.audience_count)} customers
                    </div>
                  )}
                </div>
                <Icon.arrow style={{ color: "var(--fg-faint)" }} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
