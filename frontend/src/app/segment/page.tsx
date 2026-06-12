"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppShell from "@/components/ui/AppShell";
import SegmentPlan from "@/components/segment-plan/SegmentPlan";
import { api, Campaign } from "@/lib/api";
import { Icon } from "@/components/ui";

export default function SegmentPage() {
  const params = useSearchParams();
  const campaignId = params.get("campaignId");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignId) { setLoading(false); return; }
    api.getCampaign(campaignId)
      .then(setCampaign)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [campaignId]);

  return (
    <AppShell>
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", gap: 10, color: "var(--fg-muted)" }}>
          <Icon.spinner style={{ color: "var(--accent)" }} />
          <span>Loading campaign…</span>
        </div>
      ) : error ? (
        <div style={{ maxWidth: 600, margin: "60px auto", padding: "20px 24px", background: "var(--red-wash)", border: "1px solid var(--red)", borderRadius: "var(--r-lg)", color: "var(--red)" }}>
          {error}
        </div>
      ) : !campaignId || !campaign ? (
        <div style={{ maxWidth: 600, margin: "60px auto", textAlign: "center", color: "var(--fg-muted)" }}>
          <p>No campaign selected. <a href="/" style={{ color: "var(--accent)" }}>Run a pipeline first</a>.</p>
        </div>
      ) : (
        <SegmentPlan campaign={campaign} />
      )}
    </AppShell>
  );
}
