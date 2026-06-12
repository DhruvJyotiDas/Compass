"use client";
import { useSearchParams } from "next/navigation";
import AppShell from "@/components/ui/AppShell";
import CommandCenter from "@/components/command-center/CommandCenter";

export default function Page() {
  const params = useSearchParams();
  const initialGoal = params.get("goal") || undefined;

  return (
    <AppShell>
      <CommandCenter initialGoal={initialGoal} />
    </AppShell>
  );
}
