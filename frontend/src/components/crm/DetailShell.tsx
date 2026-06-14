"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActivitiesPanel, NotesPanel, TimelinePanel } from "./RelatedPanels";

export function FieldGrid({ fields }: { fields: { label: string; value: React.ReactNode }[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-4 md:grid-cols-3">
      {fields.map((f) => (
        <div key={f.label}>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{f.label}</dt>
          <dd className="mt-0.5 text-sm font-medium">{f.value ?? "—"}</dd>
        </div>
      ))}
    </div>
  );
}

export function DetailShell({
  module,
  recordId,
  title,
  subtitle,
  badges,
  actions,
  overview,
  extraTabs,
}: {
  module: string;
  recordId: string;
  title: string;
  subtitle?: React.ReactNode;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
  overview: React.ReactNode;
  extraTabs?: { value: string; label: string; content: React.ReactNode }[];
}) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-5xl">
      <button onClick={() => router.back()} className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">{subtitle}</div>
          {badges && <div className="mt-2 flex flex-wrap items-center gap-2">{badges}</div>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {extraTabs?.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
          <TabsTrigger value="activities">Activities</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardContent className="pt-5">{overview}</CardContent>
          </Card>
        </TabsContent>
        {extraTabs?.map((t) => (
          <TabsContent key={t.value} value={t.value}>
            {t.content}
          </TabsContent>
        ))}
        <TabsContent value="activities">
          <ActivitiesPanel module={module} recordId={recordId} />
        </TabsContent>
        <TabsContent value="notes">
          <NotesPanel module={module} recordId={recordId} />
        </TabsContent>
        <TabsContent value="timeline">
          <TimelinePanel module={module} recordId={recordId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
