"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp, Briefcase, Trophy, Target, AlertCircle, CalendarClock } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/crm/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { titleCase } from "@/lib/options";
import { useAuth } from "@/lib/auth";

const PIE_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#0ea5e9", "#ef4444"];

function Stat({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${accent ?? "bg-primary/10 text-primary"}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard });

  return (
    <div>
      <PageHeader title={`Welcome back, ${user?.name?.split(" ")[0] ?? ""}`} subtitle="Here's how your pipeline is doing." />

      {isLoading || !data ? (
        <p className="text-muted-foreground">Loading metrics…</p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <Stat icon={TrendingUp} label="Open pipeline" value={formatCurrency(data.open_pipeline_value)} />
            <Stat icon={Briefcase} label="Open deals" value={String(data.open_deals)} />
            <Stat icon={Trophy} label="Won this month" value={formatCurrency(data.won_this_month_value)} accent="bg-emerald-100 text-emerald-700" />
            <Stat icon={Target} label="Lead conversion" value={`${data.conversion_rate}%`} accent="bg-violet-100 text-violet-700" />
            <Stat icon={AlertCircle} label="Overdue tasks" value={String(data.activities_overdue)} accent="bg-red-100 text-red-700" />
            <Stat icon={CalendarClock} label="Due today" value={String(data.activities_due_today)} accent="bg-amber-100 text-amber-700" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Open pipeline by stage</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.deals_by_stage} margin={{ left: 10, right: 10 }}>
                    <XAxis dataKey="stage" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" tickFormatter={(v) => `$${v / 1000}k`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} cursor={{ fill: "rgba(99,102,241,0.06)" }} />
                    <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Leads by source</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={data.leads_by_source}
                      dataKey="count"
                      nameKey="source"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {data.leads_by_source.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number, n: string) => [v, titleCase(n)]} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Leads by status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {data.leads_by_status.map((s) => (
                  <div key={s.status} className="flex min-w-32 flex-col rounded-lg border bg-muted/30 px-4 py-3">
                    <span className="text-2xl font-bold">{s.count}</span>
                    <span className="text-sm text-muted-foreground">{titleCase(s.status)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
