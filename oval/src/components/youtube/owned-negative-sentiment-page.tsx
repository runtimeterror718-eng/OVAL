"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, ChevronRight, Loader2, Play, TrendingDown } from "lucide-react";
import { stagger, fadeUp } from "@/lib/animations";
import { formatNumber } from "@/lib/utils";

type ChannelOption = { id: string; name: string };
type SelectOption = { value: string; label: string; count?: number };
type SplitPoint = { name: string; value: number };
type TrendPoint = {
  date: string;
  dateLabel: string;
  totalComments: number;
  negativeComments: number;
  negativeSharePct: number;
};
type ApiPayload = {
  live: boolean;
  error?: string;
  channels?: ChannelOption[];
  channel?: ChannelOption | null;
  range?: { startIso: string; endIso: string };
  filters?: {
    batchOptions: SelectOption[];
    facultyOptions: SelectOption[];
  };
  splits?: {
    negativeQuestionActionSplit: SplitPoint[];
    negativeRequestFeedbackActionSplit: SplitPoint[];
  };
  trend?: TrendPoint[];
};
type TimeWindowValue = "90d" | "30d" | "14d" | "7d" | "3d" | "custom";
type CompareWindowValue = TimeWindowValue | "last_year_same_period";
type UploadType = "all" | "VIDEO" | "SHORT";

const LOW_VOLUME_THRESHOLD = 25;
const timeWindows: Array<{ value: TimeWindowValue; label: string }> = [
  { value: "90d", label: "90 days" },
  { value: "30d", label: "30 days" },
  { value: "14d", label: "14 days" },
  { value: "7d", label: "7 days" },
  { value: "3d", label: "3 days" },
  { value: "custom", label: "Custom" },
];
const compareWindows: Array<{ value: CompareWindowValue; label: string }> = [
  { value: "last_year_same_period", label: "Last year same period" },
  ...timeWindows,
];
const uploadTypes: Array<{ value: UploadType; label: string }> = [
  { value: "all", label: "All uploads" },
  { value: "VIDEO", label: "Videos" },
  { value: "SHORT", label: "Shorts" },
];

function todayYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftDateIso(iso: string, years: number) {
  const date = new Date(iso);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

function pct(value: number) {
  return `${Math.round(value * 10) / 10}%`;
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function enrichTrend(trend: TrendPoint[]) {
  return trend.map((row) => {
    const otherComments = Math.max(0, row.totalComments - row.negativeComments);
    const negativeShare = row.totalComments > 0 ? (row.negativeComments / row.totalComments) * 100 : 0;
    const issueIntensity = negativeShare * Math.log(row.totalComments + 1);
    const isLowVolume = row.totalComments < LOW_VOLUME_THRESHOLD;
    return { ...row, otherComments, negativeShare, issueIntensity, isLowVolume };
  });
}

function getSpikeWindows(rows: ReturnType<typeof enrichTrend>) {
  const meaningful = rows.filter((row) => !row.isLowVolume);
  const peak = meaningful.reduce<(typeof rows)[number] | null>(
    (best, row) => (!best || row.issueIntensity > best.issueIntensity ? row : best),
    null
  );
  const intensities = meaningful.map((row) => row.issueIntensity).filter((value) => value > 0);
  const threshold = Math.max(percentile(intensities, 75), (peak?.issueIntensity || 0) * 0.7);
  const windows: Array<{ start: string; end: string }> = [];
  let current: { start: string; end: string } | null = null;

  for (const row of rows) {
    const isSpike = !row.isLowVolume && row.issueIntensity >= threshold && threshold > 0;
    if (isSpike && !current) current = { start: row.date, end: row.date };
    else if (isSpike && current) current.end = row.date;
    else if (!isSpike && current) {
      windows.push(current);
      current = null;
    }
  }
  if (current) windows.push(current);

  return { peak, threshold, windows };
}

function buildParams(params: Record<string, string>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) searchParams.set(key, value);
  }
  return searchParams.toString();
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
}) {
  return (
    <label className="space-y-1">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}{typeof option.count === "number" ? ` (${option.count})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function TrendChart({ title, trend, emptyCopy }: { title: string; trend: TrendPoint[]; emptyCopy: string }) {
  const chartRows = useMemo(() => enrichTrend(trend), [trend]);
  const { peak, windows } = useMemo(() => getSpikeWindows(chartRows), [chartRows]);
  const negativeTotal = chartRows.reduce((sum, row) => sum + row.negativeComments, 0);
  const commentTotal = chartRows.reduce((sum, row) => sum + row.totalComments, 0);
  const peakLabel = peak ? `${peak.dateLabel} (${pct(peak.negativeShare)})` : "No peak";

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Trend</p>
          <h2 className="mt-1 text-lg font-bold">{title}</h2>
        </div>
        <div className="grid grid-cols-3 gap-2 text-right text-xs">
          <div className="rounded-lg border border-border px-3 py-2">
            <p className="text-[10px] text-muted-foreground">Negative Comments</p>
            <p className="font-bold text-red-600">{formatNumber(negativeTotal)}</p>
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <p className="text-[10px] text-muted-foreground">Peak Day</p>
            <p className="font-bold">{peakLabel}</p>
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <p className="text-[10px] text-muted-foreground">Spike Windows</p>
            <p className="font-bold">{windows.length}</p>
          </div>
        </div>
      </div>

      {chartRows.length ? (
        <div className="h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartRows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(value) => chartRows.find((row) => row.date === value)?.dateLabel || value} />
              <YAxis yAxisId="comments" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="share" orientation="right" tick={{ fontSize: 11 }} unit="%" />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload;
                  return (
                    <div className="rounded-xl border border-border bg-card p-3 text-xs shadow-lg">
                      <p className="font-bold">{label}</p>
                      <p>Total comments: {formatNumber(row.totalComments)}</p>
                      <p className="text-red-600">Negative comments: {formatNumber(row.negativeComments)}</p>
                      <p>Negative share: {pct(row.negativeShare)}</p>
                      {row.isLowVolume ? <p className="mt-1 text-amber-600">Low-volume day</p> : null}
                    </div>
                  );
                }}
              />
              {windows.map((window, index) => (
                <ReferenceArea
                  key={`${window.start}-${window.end}-${index}`}
                  yAxisId="comments"
                  x1={window.start}
                  x2={window.end}
                  strokeOpacity={0}
                  fill="#ef4444"
                  fillOpacity={0.08}
                />
              ))}
              {peak ? (
                <ReferenceLine
                  yAxisId="share"
                  x={peak.date}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  label={{ value: "Peak", position: "top", fontSize: 10, fill: "#ef4444" }}
                />
              ) : null}
              <Bar yAxisId="comments" dataKey="otherComments" stackId="comments" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="comments" dataKey="negativeComments" stackId="comments" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Line
                yAxisId="share"
                type="monotone"
                dataKey="negativeShare"
                stroke="#b91c1c"
                strokeWidth={2}
                dot={(props: any) => (
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={props.payload.isLowVolume ? 3 : 2}
                    fill={props.payload.isLowVolume ? "transparent" : "#b91c1c"}
                    stroke="#b91c1c"
                    strokeOpacity={props.payload.isLowVolume ? 0.45 : 1}
                    opacity={props.payload.isLowVolume ? 0.55 : 1}
                  />
                )}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[260px] items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
          {emptyCopy}
        </div>
      )}

      {commentTotal > 0 ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Low-volume threshold is {LOW_VOLUME_THRESHOLD} comments. Spike windows use issue intensity from negative share and total volume.
        </p>
      ) : null}
    </div>
  );
}

function IssueTable({ questions, requests }: { questions: SplitPoint[]; requests: SplitPoint[] }) {
  const rows = useMemo(() => {
    const combined = [
      ...questions.map((row) => ({ type: "Question", action: row.name, value: row.value })),
      ...requests.map((row) => ({ type: "Request & feedback", action: row.name, value: row.value })),
    ].sort((a, b) => b.value - a.value || a.action.localeCompare(b.action));
    const total = combined.reduce((sum, row) => sum + row.value, 0);
    return combined.map((row, index) => ({
      ...row,
      rank: index + 1,
      share: total > 0 ? (row.value / total) * 100 : 0,
    }));
  }, [questions, requests]);

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Where the issue lies?</p>
      <h2 className="mt-1 text-lg font-bold">Negative comment action split</h2>
      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Rank</th>
              <th className="px-3 py-2">Type of comment</th>
              <th className="px-3 py-2">Type of action</th>
              <th className="px-3 py-2 text-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.type}-${row.action}`} className="border-t border-border">
                <td className="px-3 py-2 font-bold">{row.rank}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.type}</td>
                <td className="px-3 py-2 font-medium">{row.action}</td>
                <td className="px-3 py-2 text-right font-bold">{pct(row.share)}</td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  No negative action split available.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function OwnedNegativeSentimentPage() {
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [channelId, setChannelId] = useState("");
  const [windowValue, setWindowValue] = useState<TimeWindowValue>("30d");
  const [videoContent, setVideoContent] = useState<UploadType>("all");
  const [customStartDate, setCustomStartDate] = useState(todayYmd());
  const [customEndDate, setCustomEndDate] = useState(todayYmd());
  const [batchName, setBatchName] = useState("all");
  const [facultyName, setFacultyName] = useState("all");
  const [questionType, setQuestionType] = useState("all");
  const [requestType, setRequestType] = useState("all");
  const [data, setData] = useState<ApiPayload | null>(null);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState("");

  const [compareOpen, setCompareOpen] = useState(false);
  const [compareWindow, setCompareWindow] = useState<CompareWindowValue>("last_year_same_period");
  const [compareVideoContent, setCompareVideoContent] = useState<UploadType>("all");
  const [compareCustomStartDate, setCompareCustomStartDate] = useState(todayYmd());
  const [compareCustomEndDate, setCompareCustomEndDate] = useState(todayYmd());
  const [compareData, setCompareData] = useState<ApiPayload | null>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoadingChannels(true);
    fetch("/api/youtube-owned/negative-sentiment")
      .then((response) => response.json())
      .then((json: ApiPayload) => {
        if (!mounted) return;
        const channelList = json.channels || [];
        setChannels(channelList);
        const competitionWallah = channelList.find((channel) => channel.name.toLowerCase() === "competition wallah");
        setChannelId((competitionWallah || channelList[0])?.id || "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load channels."))
      .finally(() => mounted && setLoadingChannels(false));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!channelId) return;
    const params = buildParams({
      channelId,
      window: windowValue,
      videoContent,
      customStartDate: windowValue === "custom" ? customStartDate : "",
      customEndDate: windowValue === "custom" ? customEndDate : "",
      batchName,
      facultyName,
      questionType,
      requestType,
    });
    setLoadingData(true);
    setError("");
    fetch(`/api/youtube-owned/negative-sentiment?${params}`)
      .then((response) => response.json())
      .then((json: ApiPayload) => {
        if (json.live === false) throw new Error(json.error || "Failed to load owned negative sentiment data.");
        setData(json);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load owned negative sentiment data."))
      .finally(() => setLoadingData(false));
  }, [batchName, channelId, customEndDate, customStartDate, facultyName, questionType, requestType, videoContent, windowValue]);

  useEffect(() => {
    if (!compareOpen || !channelId) return;
    const lastYearStart = data?.range?.startIso ? shiftDateIso(data.range.startIso, -1) : compareCustomStartDate;
    const lastYearEnd = data?.range?.endIso ? shiftDateIso(data.range.endIso, -1) : compareCustomEndDate;
    const isLastYear = compareWindow === "last_year_same_period";
    const params = buildParams({
      channelId,
      window: isLastYear ? "custom" : compareWindow,
      videoContent: compareVideoContent,
      customStartDate: isLastYear || compareWindow === "custom" ? (isLastYear ? lastYearStart : compareCustomStartDate) : "",
      customEndDate: isLastYear || compareWindow === "custom" ? (isLastYear ? lastYearEnd : compareCustomEndDate) : "",
      batchName,
      facultyName,
      questionType,
      requestType,
    });
    setLoadingCompare(true);
    fetch(`/api/youtube-owned/negative-sentiment?${params}`)
      .then((response) => response.json())
      .then((json: ApiPayload) => {
        if (json.live === false) throw new Error(json.error || "Failed to load compare data.");
        setCompareData(json);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load compare data."))
      .finally(() => setLoadingCompare(false));
  }, [
    batchName,
    channelId,
    compareCustomEndDate,
    compareCustomStartDate,
    compareOpen,
    compareVideoContent,
    compareWindow,
    data?.range?.endIso,
    data?.range?.startIso,
    facultyName,
    questionType,
    requestType,
  ]);

  const batchOptions = data?.filters?.batchOptions || [{ value: "all", label: "All Batches" }];
  const facultyOptions = data?.filters?.facultyOptions || [{ value: "all", label: "All Faculty" }];
  const questionOptions = [
    { value: "all", label: "All Questions" },
    ...((data?.splits?.negativeQuestionActionSplit || []).map((row) => ({ value: row.name, label: row.name, count: row.value }))),
  ];
  const requestOptions = [
    { value: "all", label: "All Requests & Feedback" },
    ...((data?.splits?.negativeRequestFeedbackActionSplit || []).map((row) => ({ value: row.name, label: row.name, count: row.value }))),
  ];

  if (loadingChannels) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-red-500" />
      </div>
    );
  }

  if (!channels.length) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
          No owned channels were returned from the second Supabase project.
        </div>
      </div>
    );
  }

  return (
    <motion.div className="mx-auto max-w-7xl space-y-6 px-4 py-6" variants={stagger as any} initial="hidden" animate="show">
      <motion.div variants={fadeUp as any} className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <Play className="h-5 w-5 text-red-500" />
            <p className="text-xs font-semibold uppercase tracking-widest text-red-600">Owned YouTube Intel</p>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Negative Sentiment Analysis</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">Channel Insights</span>
            <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">Owned channels only</span>
          </div>
        </div>
        {loadingData ? <Loader2 className="h-5 w-5 animate-spin text-red-500" /> : <TrendingDown className="h-5 w-5 text-red-500" />}
      </motion.div>

      {error ? (
        <motion.div variants={fadeUp as any} className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </motion.div>
      ) : null}

      <motion.section variants={fadeUp as any} className="rounded-2xl border border-border bg-card p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <SelectField label="Channel" value={channelId} onChange={setChannelId} options={channels.map((channel) => ({ value: channel.id, label: channel.name }))} />
          <SelectField label="Lookback period" value={windowValue} onChange={(value) => setWindowValue(value as TimeWindowValue)} options={timeWindows} />
          <SelectField label="Type of uploads" value={videoContent} onChange={(value) => setVideoContent(value as UploadType)} options={uploadTypes} />
          <SelectField label="Batch name" value={batchName} onChange={setBatchName} options={batchOptions} />
          {windowValue === "custom" ? (
            <>
              <label className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Custom start</span>
                <input type="date" value={customStartDate} onChange={(event) => setCustomStartDate(event.target.value)} className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs outline-none" />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Custom end</span>
                <input type="date" value={customEndDate} onChange={(event) => setCustomEndDate(event.target.value)} className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs outline-none" />
              </label>
            </>
          ) : null}
          <SelectField label="Faculty" value={facultyName} onChange={setFacultyName} options={facultyOptions} />
          <SelectField label="Type of questions" value={questionType} onChange={(value) => { setQuestionType(value); if (value !== "all") setRequestType("all"); }} options={questionOptions} />
          <SelectField label="Type of requests & feedback" value={requestType} onChange={(value) => { setRequestType(value); if (value !== "all") setQuestionType("all"); }} options={requestOptions} />
        </div>
      </motion.section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <TrendChart title="Negative Sentiment & Volume Over Time" trend={data?.trend || []} emptyCopy="No negative sentiment trend data available." />
        <IssueTable
          questions={data?.splits?.negativeQuestionActionSplit || []}
          requests={data?.splits?.negativeRequestFeedbackActionSplit || []}
        />
      </div>

      <motion.section variants={fadeUp as any} className="rounded-2xl border border-border bg-card">
        <button
          onClick={() => setCompareOpen((value) => !value)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Compare</p>
            <h2 className="mt-1 text-lg font-bold">Compare: Negative Sentiment & Volume Over Time</h2>
          </div>
          {compareOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {compareOpen ? (
          <div className="space-y-4 border-t border-border p-5">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <SelectField label="Compare period" value={compareWindow} onChange={(value) => setCompareWindow(value as CompareWindowValue)} options={compareWindows} />
              <SelectField label="Compare uploads" value={compareVideoContent} onChange={(value) => setCompareVideoContent(value as UploadType)} options={uploadTypes} />
              {compareWindow === "custom" ? (
                <>
                  <label className="space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Compare start</span>
                    <input type="date" value={compareCustomStartDate} onChange={(event) => setCompareCustomStartDate(event.target.value)} className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs outline-none" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Compare end</span>
                    <input type="date" value={compareCustomEndDate} onChange={(event) => setCompareCustomEndDate(event.target.value)} className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs outline-none" />
                  </label>
                </>
              ) : null}
            </div>
            {loadingCompare ? (
              <div className="flex h-[280px] items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-red-500" />
              </div>
            ) : (
              <TrendChart title="Compare: Negative Sentiment & Volume Over Time" trend={compareData?.trend || []} emptyCopy="No compare negative sentiment trend data available." />
            )}
          </div>
        ) : null}
      </motion.section>
    </motion.div>
  );
}
