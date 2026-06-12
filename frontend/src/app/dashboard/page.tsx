"use client";
import { useSearchParams } from "next/navigation";
import AppShell from "@/components/ui/AppShell";
import Dashboard from "@/components/dashboard/Dashboard";

export default function DashboardPage() {
  const params = useSearchParams();
  const campaignId = params.get("campaignId");

  return (
    <AppShell>
      {!campaignId ? (
        <div style={{ maxWidth: 600, margin: "60px auto", textAlign: "center", color: "var(--fg-muted)" }}>
          <p>No campaign selected. <a href="/" style={{ color: "var(--accent)" }}>Run a pipeline first</a>.</p>
        </div>
      ) : (
        <Dashboard campaignId={campaignId} />
      )}
    </AppShell>
  );
}
