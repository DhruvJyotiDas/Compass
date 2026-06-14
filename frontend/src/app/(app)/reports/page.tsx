"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import { api } from "@/lib/api";
import type {
  PipelineReport,
  LeadsReport,
  ActivitiesReport,
  WinLossReport,
  ForecastReport,
} from "@/lib/types";

const COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"];

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">{title}</h3>
      {children}
    </div>
  );
}

export default function ReportsPage() {
  const [pipeline, setPipeline] = useState<PipelineReport | null>(null);
  const [leads, setLeads] = useState<LeadsReport | null>(null);
  const [activities, setActivities] = useState<ActivitiesReport | null>(null);
  const [winloss, setWinloss] = useState<WinLossReport | null>(null);
  const [forecast, setForecast] = useState<ForecastReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("last_90_days");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.reportPipeline(),
      api.reportLeads(period),
      api.reportActivities("this_month"),
      api.reportWinLoss("this_quarter"),
      api.reportForecast(6),
    ])
      .then(([p, l, a, w, f]) => {
        setPipeline(p);
        setLeads(l);
        setActivities(a);
        setWinloss(w);
        setForecast(f);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [period]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading reports…
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Sales analytics &amp; forecasting</p>
        </div>
        <select
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="this_month">This Month</option>
          <option value="last_month">Last Month</option>
          <option value="this_quarter">This Quarter</option>
          <option value="this_year">This Year</option>
          <option value="last_90_days">Last 90 Days</option>
        </select>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Pipeline", value: fmt(pipeline?.total_pipeline ?? 0) },
          { label: "Weighted Forecast", value: fmt(pipeline?.weighted_forecast ?? 0) },
          { label: "Win Rate", value: `${winloss?.win_rate ?? 0}%` },
          { label: "Lead Conv. Rate", value: `${leads?.conversion_rate ?? 0}%` },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{k.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Pipeline by Stage */}
      {pipeline && pipeline.stages.length > 0 && (
        <Card title="Pipeline by Stage">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={pipeline.stages} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="stage" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend />
              <Bar dataKey="value" name="Pipeline Value" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="weighted_value" name="Weighted" fill="#a5b4fc" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Lead Funnel */}
        {leads && (
          <Card title="Lead Status Breakdown">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={leads.by_status}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ status, count }) => `${status} (${count})`}
                >
                  {leads.by_status.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Win / Loss */}
        {winloss && (
          <Card title="Win / Loss (This Quarter)">
            <div className="flex gap-6 mb-4">
              <div className="flex-1 text-center">
                <p className="text-3xl font-bold text-emerald-600">{winloss.won.count}</p>
                <p className="text-xs text-gray-500 mt-1">Won deals</p>
                <p className="text-sm font-medium text-gray-700">{fmt(winloss.won.value)}</p>
              </div>
              <div className="flex-1 text-center">
                <p className="text-3xl font-bold text-red-500">{winloss.lost.count}</p>
                <p className="text-xs text-gray-500 mt-1">Lost deals</p>
                <p className="text-sm font-medium text-gray-700">{fmt(winloss.lost.value)}</p>
              </div>
              <div className="flex-1 text-center">
                <p className="text-3xl font-bold text-indigo-600">{winloss.win_rate}%</p>
                <p className="text-xs text-gray-500 mt-1">Win rate</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={100}>
              <BarChart
                data={[
                  { name: "Won", value: winloss.won.count, fill: "#10b981" },
                  { name: "Lost", value: winloss.lost.count, fill: "#ef4444" },
                ]}
              >
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis hide />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {[
                    { name: "Won", fill: "#10b981" },
                    { name: "Lost", fill: "#ef4444" },
                  ].map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      {/* Revenue Forecast */}
      {forecast && forecast.months.length > 0 && (
        <Card title="6-Month Revenue Forecast">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={forecast.months} margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend />
              <Line type="monotone" dataKey="won" name="Won Revenue" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="weighted_open" name="Weighted Open" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              <Line type="monotone" dataKey="total" name="Total Forecast" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Activities */}
      {activities && activities.by_type.length > 0 && (
        <Card title="Activities by Type (This Month)">
          <div className="flex items-center gap-3 mb-3">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
              {activities.overdue} Overdue
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={activities.by_type}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="type" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="completed" name="Completed" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="open" name="Open" fill="#e5e7eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Lead Source */}
      {leads && leads.by_source.length > 0 && (
        <Card title="Leads by Source">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={leads.by_source} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis dataKey="source" type="category" tick={{ fontSize: 12 }} width={90} />
              <Tooltip />
              <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}
