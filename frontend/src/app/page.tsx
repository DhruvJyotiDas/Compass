"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AppShell from "@/components/ui/AppShell";
import CommandCenter from "@/components/command-center/CommandCenter";

function CommandCenterWrapper() {
  const params = useSearchParams();
  const initialGoal = params.get("goal") || undefined;
  return <CommandCenter initialGoal={initialGoal} />;
}

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <CommandCenterWrapper />
      </Suspense>
    </AppShell>
  );
}
