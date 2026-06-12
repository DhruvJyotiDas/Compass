"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AppShell from "@/components/ui/AppShell";
import Dashboard from "@/components/dashboard/Dashboard";
import CampaignsList from "@/components/dashboard/CampaignsList";

function DashboardInner() {
  const params = useSearchParams();
  const campaignId = params.get("campaignId");

  if (!campaignId) return <CampaignsList />;
  return <Dashboard campaignId={campaignId} />;
}

export default function DashboardPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <DashboardInner />
      </Suspense>
    </AppShell>
  );
}
