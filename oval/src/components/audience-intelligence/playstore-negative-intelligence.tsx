"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, Check, ChevronRight, CircleAlert, Smartphone } from "lucide-react";
import { PlayStoreDeviceIntelligence } from "./playstore-device-intelligence";

type Issue = {
  name: string;
  count: number;
  share: number;
  summary: string;
  evidence?: { text?: string; author?: string; rating?: number; version?: string }[];
};

type Props = {
  data: any;
  issues: Issue[];
};

const n = (value: unknown) => Number(value || 0);
const pct = (value: number) => `${value.toFixed(value < 10 ? 1 : 0)}%`;
const fmt = (value: number) => new Intl.NumberFormat("en-IN", { notation: value > 9999 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
const monthLabel = (value: string) => {
  const date = new Date(`${value}-01T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", { month: "short" });
};

function linePath(values: number[], width: number, height: number, pad = 18) {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.01, max - min);
  return values.map((value, index) => {
    const x = pad + (index / Math.max(1, values.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (value - min) / range) * (height - pad * 2);
    return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function chartPoint(values: number[], index: number, width: number, height: number, pad: number) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.01, max - min);
  return {
    x: pad + index / Math.max(1, values.length - 1) * (width - pad * 2),
    y: pad + (1 - (values[index] - min) / range) * (height - pad * 2),
  };
}

function radarCoordinate(index: number, value: number, count: number) {
  const angle = (-90 + 360 / count * index) * Math.PI / 180;
  const radius = value / 100 * 104;
  return { x: 145 + Math.cos(angle) * radius, y: 145 + Math.sin(angle) * radius };
}

function deviceTier(device: string) {
  const value = device.toLowerCase();
  if (/s2[1-9]|pixel|oneplus|op5/.test(value)) return "Premium";
  if (/gta|a\d{2}|m\d{2}|v2|re/.test(value)) return "Mass market";
  return "Entry / unknown";
}

export function PlayStoreNegativeIntelligence({ data, issues }: Props) {
  const app = data?.apps?.[data?.primaryPackage] || {};
  const [trendMetric, setTrendMetric] = useState<"share" | "count">("share");
  const [trendWindow, setTrendWindow] = useState<"ytd" | "6m" | "3m">("ytd");
  const [selectedMonth, setSelectedMonth] = useState(Math.max(0, (app.monthlyTrend || []).length - 1));
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [hoveredRadar, setHoveredRadar] = useState<number | null>(null);
  const [selectedVersion, setSelectedVersion] = useState(0);
  const [selectedIssue, setSelectedIssue] = useState(0);

  const allMonthly = useMemo(() => (app.monthlyTrend || []).map((row: any) => ({
    month: String(row.month || ""),
    reviews: n(row.reviews),
    rating: n(row.averageRating),
    share: n(row.lowRatingRate),
    negative: Math.round(n(row.reviews) * n(row.lowRatingRate) / 100),
    replyRate: n(row.replyRate),
  })), [app.monthlyTrend]);
  const monthly = trendWindow === "3m" ? allMonthly.slice(-3) : trendWindow === "6m" ? allMonthly.slice(-6) : allMonthly;
  const versions = useMemo(() => (app.recentVersions || []).filter((row: any) => row.version && row.version !== "Unknown").slice(0, 7), [app.recentVersions]);
  const ratings = app.ratingDistribution || [];
  const trendValues: number[] = monthly.map((row: any) => trendMetric === "share" ? n(row.share) : n(row.negative));
  const ratingValues: number[] = monthly.map((row: any) => n(row.rating));
  const maxNegative = Math.max(1, ...monthly.map((row: any) => row.negative));
  const activeMonth = monthly[Math.min(selectedMonth, monthly.length - 1)] || { month: "Current", share: 0, negative: 0, reviews: 0, rating: 0 };
  const activeVersion = versions[Math.min(selectedVersion, versions.length - 1)] || {};
  const activeIssue = issues[Math.min(selectedIssue, issues.length - 1)] || issues[0];
  const replyRate = n(app.replyRate);
  const negativeReplyRate = n(app.negativeReplyRate);
  const change = monthly.length > 1 && monthly[0].share ? (monthly.at(-1)!.share - monthly[0].share) / monthly[0].share * 100 : 0;
  const radarAxes = useMemo(() => {
    const definitions = [
      { label: "Stability", detail: "Crash, freeze and loading", terms: /crash|freeze|hang|loading|not opening|stability|glitch|lag/i },
      { label: "Video", detail: "Playback and downloads", terms: /video|playback|lecture|download|buffer|black screen/i },
      { label: "Access", detail: "Login, OTP and batch entry", terms: /login|otp|access|batch|course|blocked|entitlement/i },
      { label: "Payments", detail: "Purchase, refund and entitlement", terms: /payment|paid|refund|purchase|money|transaction|fee/i },
      { label: "Support", detail: "Response and resolution", terms: /support|reply|response|resolve|ticket|help|customer care/i },
      { label: "Exam flow", detail: "Tests, schedules and urgency", terms: /exam|test|schedule|dpp|result|today|urgent/i },
    ];
    const evidence = issues.flatMap((issue) => (issue.evidence || []).map((item) => `${issue.name} ${issue.summary} ${item.text || ""}`));
    const raw = definitions.map((axis) => evidence.filter((text) => axis.terms.test(text)).length);
    const maximum = Math.max(1, ...raw);
    return definitions.map((axis, index) => ({ ...axis, count: raw[index], value: Math.round(Math.max(18, raw[index] / maximum * 91)) }));
  }, [issues]);
  const radarScore = Math.round(radarAxes.reduce((sum, axis) => sum + axis.value, 0) / Math.max(1, radarAxes.length));

  const cohort = useMemo(() => {
    const reviews = Array.isArray(data?.liveReviews) ? data.liveReviews : [];
    const tiers = new Map<string, { total: number; low: number }>();
    reviews.forEach((review: any) => {
      const tier = deviceTier(String(review.device || ""));
      const row = tiers.get(tier) || { total: 0, low: 0 };
      row.total += 1;
      if (n(review.rating) <= 2) row.low += 1;
      tiers.set(tier, row);
    });
    return Array.from(tiers.entries()).map(([name, row]) => ({ name, ...row, share: row.total ? row.low / row.total * 100 : 0 })).sort((a, b) => b.share - a.share);
  }, [data]);

  if (!monthly.length && !versions.length && !issues.length) return null;

  return <section className="psi-root">
    <header className="psi-section-intro psi-negative-title" id="negative-intelligence">
      <h2>Negative review intelligence</h2>
      <div className="psi-window-filter" role="group" aria-label="Negative review intelligence evidence window"><span>Evidence window</span><div>{([['ytd', `${monthLabel(allMonthly[0]?.month || "Jan")}–${monthLabel(allMonthly.at(-1)?.month || "Current")}`], ['6m', 'Last 6 months'], ['3m', 'Last 3 months']] as const).map(([id, label]) => <button key={id} className={trendWindow === id ? "active" : ""} onClick={() => { setTrendWindow(id); const count = id === "3m" ? 3 : id === "6m" ? 6 : allMonthly.length; setSelectedMonth(Math.max(0, Math.min(count, allMonthly.length) - 1)); setHoveredMonth(null); setHoveredRating(null); }}>{label}</button>)}</div></div>
    </header>

    <div className="psi-trend-grid">
      <article className="psi-card psi-trend-card">
        <header className="psi-card-head"><div><p>MONTH-ON-MONTH HEALTH</p><h3>Negative reviews are rising faster than review volume.</h3></div><div className="psi-toggle"><button className={trendMetric === "share" ? "active" : ""} onClick={() => setTrendMetric("share")}>Negative share</button><button className={trendMetric === "count" ? "active" : ""} onClick={() => setTrendMetric("count")}>Review count</button></div></header>
        <div className="psi-line-wrap">
          <svg viewBox="0 0 700 250" role="img" aria-label="Monthly negative review trend">
            {[42, 94, 146, 198].map((y) => <line key={y} x1="20" x2="680" y1={y} y2={y} className="psi-gridline" />)}
            <path d={linePath(trendValues, 700, 230, 28)} className="psi-area-line" />
            {trendValues.map((value, index) => {
              const { x, y } = chartPoint(trendValues, index, 700, 230, 28);
              return <g key={`${monthly[index].month}-${value}`} tabIndex={0} role="button" aria-label={`${monthLabel(monthly[index].month)}: ${pct(monthly[index].share)} negative share`} onClick={() => setSelectedMonth(index)} onMouseEnter={() => setHoveredMonth(index)} onMouseLeave={() => setHoveredMonth(null)} onFocus={() => setHoveredMonth(index)} onBlur={() => setHoveredMonth(null)} className="psi-point"><circle className="psi-point-hit" cx={x} cy={y} r="16" /><circle cx={x} cy={y} r={selectedMonth === index ? 8 : 5} /><text x={x} y="230">{monthLabel(monthly[index].month)}</text></g>;
            })}
          </svg>
          {hoveredMonth !== null && monthly[hoveredMonth] ? (() => { const row = monthly[hoveredMonth]; const point = chartPoint(trendValues, hoveredMonth, 700, 230, 28); const previous = hoveredMonth > 0 ? monthly[hoveredMonth - 1] : null; return <div className="psi-graph-tooltip" style={{ left: `${point.x / 7}%`, top: `${point.y + 62}px` }}><b>{monthLabel(row.month)} 2026</b><span>Total reviews <strong>{fmt(row.reviews)}</strong></span><span>Negative reviews <strong>{fmt(row.negative)}</strong></span><span>Negative share <strong>{pct(row.share)}</strong></span><span>Average rating <strong>{row.rating.toFixed(2)}</strong></span>{previous ? <em>{(((row.negative - previous.negative) / Math.max(1, previous.negative)) * 100).toFixed(1)}% negative growth</em> : <em>Starting month of this view</em>}</div>; })() : null}
          <div className="psi-month-readout"><span>{monthLabel(activeMonth.month)} signal</span><strong>{trendMetric === "share" ? pct(activeMonth.share) : fmt(activeMonth.negative)}</strong><small>{fmt(activeMonth.reviews)} total reviews · {activeMonth.rating.toFixed(2)} rating</small></div>
        </div>
      </article>
      <article className="psi-card psi-volume-card">
        <header><p>ABSOLUTE NEGATIVE VOLUME</p><span>Low-rating reviews</span></header>
        <div className="psi-volume-bars">{monthly.map((row: any, index: number) => <button key={row.month} className={selectedMonth === index ? "active" : ""} onClick={() => setSelectedMonth(index)}><span><i style={{ height: `${Math.max(8, row.negative / maxNegative * 100)}%` }} /></span><b>{fmt(row.negative)}</b><small>{monthLabel(row.month)}</small></button>)}</div>
        <footer><span>{monthly.length}-month change</span><strong className={change > 0 ? "bad" : "good"}>{change > 0 ? "+" : ""}{change.toFixed(0)}%</strong><p>{change > 0 ? "Low-rating share is expanding across the captured window." : "Low-rating share is easing across the captured window."}</p></footer>
      </article>
    </div>

    <div className="psi-secondary-grid">
      <article className="psi-card psi-rating-card"><header><p>AVERAGE RATING BY MONTH</p><b>{activeMonth.rating.toFixed(2)}</b></header><svg viewBox="0 0 520 188"><path d={linePath(ratingValues, 520, 160, 20)} className="psi-rating-line" />{ratingValues.map((value, index) => { const { x, y } = chartPoint(ratingValues, index, 520, 160, 20); return <g key={index} tabIndex={0} onMouseEnter={() => setHoveredRating(index)} onMouseLeave={() => setHoveredRating(null)} onFocus={() => setHoveredRating(index)} onBlur={() => setHoveredRating(null)}><circle className="psi-point-hit" cx={x} cy={y} r="14" /><circle cx={x} cy={y} r="4" /><text x={x} y="178">{monthLabel(monthly[index].month)}</text></g>; })}</svg>{hoveredRating !== null && monthly[hoveredRating] ? <div className="psi-mini-tooltip"><b>{monthly[hoveredRating].rating.toFixed(2)}</b><span>{monthLabel(monthly[hoveredRating].month)} · {fmt(monthly[hoveredRating].reviews)} reviews</span></div> : null}<p>Rating can remain deceptively healthy while the count and concentration of product complaints change underneath.</p></article>
      <article className="psi-card psi-mix-card"><header><p>RATING DISTRIBUTION</p><b>{fmt(n(app.sampleSize))} reviews</b></header><div>{ratings.map((row: any) => <span key={row.rating}><small>{row.rating} star</small><i><b style={{ width: `${Math.max(1, n(row.share))}%` }} /></i><strong>{pct(n(row.share))}</strong></span>)}</div><p>The long tail of one- and two-star reviews contains the most useful product diagnostics.</p></article>
      <article className="psi-card psi-response-card"><header><p>ARE WE CLOSING THE LOOP?</p><b>Response operations</b></header><div className="psi-donut" style={{ background: `conic-gradient(#111 ${replyRate * 3.6}deg, #76fb91 0 ${Math.max(replyRate, negativeReplyRate) * 3.6}deg, #ecece8 0)` }}><span><strong>{pct(replyRate)}</strong><small>all reviews replied</small></span></div><div className="psi-response-meta"><span><b>{pct(negativeReplyRate)}</b><small>negative replied</small></span><span><b>{app.medianReplyHours ? `${n(app.medianReplyHours).toFixed(0)}h` : "—"}</b><small>median response</small></span></div><p>A reply is only the first operational signal; resolution quality still needs ticket-level linkage.</p></article>
    </div>

    <section className="psi-block psi-release-section">
      <header className="psi-block-head"><div><p>RELEASE INTELLIGENCE</p><h2>Which app versions created the damage?</h2></div><span>Rating, negative share and review coverage shown together to prevent false conclusions from small samples.</span></header>
      <div className="psi-release-layout"><div className="psi-release-chart">{versions.map((version: any, index: number) => <button key={`${version.version}-${index}`} className={selectedVersion === index ? "active" : ""} onClick={() => setSelectedVersion(index)}><span className="psi-release-bar"><i style={{ height: `${Math.max(16, n(version.lowRatingRate))}%` }} /></span><strong>{version.version}</strong><small>{n(version.averageRating).toFixed(2)} ★</small><em>{pct(n(version.lowRatingRate))} low</em></button>)}</div><article className="psi-release-detail"><span className={n(activeVersion.lowRatingRate) >= 20 ? "critical" : n(activeVersion.lowRatingRate) >= 12 ? "watch" : "healthy"}>{n(activeVersion.lowRatingRate) >= 20 ? "Critical" : n(activeVersion.lowRatingRate) >= 12 ? "Watch" : "Healthy"}</span><p>SELECTED RELEASE</p><h3>Version {activeVersion.version || "—"}</h3><div><strong>{n(activeVersion.averageRating).toFixed(2)}</strong><small>average rating</small><strong>{pct(n(activeVersion.lowRatingRate))}</strong><small>low-rating share</small></div><ul>{(activeVersion.topThemes || []).slice(0, 3).map((theme: any) => <li key={theme.name}>{theme.name}</li>)}</ul><button>Open release evidence <ArrowUpRight size={12} /></button></article></div>
    </section>

    <section className="psi-block psi-signature-section">
      <header className="psi-block-head"><div><p>STUDENT ISSUE SIGNATURE</p><h2>What kind of problem is the student raising?</h2></div><span>The radar represents issue intensity—not generic sentiment—so teams can see whether the review concerns stability, learning continuity, access, payment or support.</span></header>
      <div className="psi-signature-grid"><article className="psi-radar-card"><header><div><span>SEMANTIC ISSUE RADAR</span><h3>{monthLabel(activeMonth.month)} complaint signature</h3></div><strong>{radarScore}<small>/100</small></strong></header><div className="psi-radar-wrap"><svg viewBox="0 0 290 290" role="img" aria-label="Student issue type radar">{[25, 50, 75, 100].map((level) => <polygon key={level} className="psi-radar-grid" points={radarAxes.map((_, index) => { const point = radarCoordinate(index, level, radarAxes.length); return `${point.x},${point.y}`; }).join(" ")} />)}{radarAxes.map((axis, index) => { const point = radarCoordinate(index, 100, radarAxes.length); return <line key={axis.label} className="psi-radar-axis" x1="145" y1="145" x2={point.x} y2={point.y} />; })}<polygon className="psi-radar-shape" points={radarAxes.map((axis, index) => { const point = radarCoordinate(index, axis.value, radarAxes.length); return `${point.x},${point.y}`; }).join(" ")} />{radarAxes.map((axis, index) => { const point = radarCoordinate(index, axis.value, radarAxes.length); const label = radarCoordinate(index, 120, radarAxes.length); return <g key={axis.label} tabIndex={0} onMouseEnter={() => setHoveredRadar(index)} onMouseLeave={() => setHoveredRadar(null)} onFocus={() => setHoveredRadar(index)} onBlur={() => setHoveredRadar(null)}><circle className="psi-radar-hit" cx={point.x} cy={point.y} r="14" /><circle className="psi-radar-dot" cx={point.x} cy={point.y} r="4" /><text x={label.x} y={label.y} textAnchor={label.x < 120 ? "end" : label.x > 170 ? "start" : "middle"}>{axis.label}</text></g>; })}</svg>{hoveredRadar !== null ? <div className="psi-radar-tooltip"><strong>{radarAxes[hoveredRadar].value}/100</strong><span>{radarAxes[hoveredRadar].label}</span><small>{radarAxes[hoveredRadar].detail} · {radarAxes[hoveredRadar].count} matching signals</small></div> : null}</div><p>Hover a coordinate to inspect the exact issue family and intensity score.</p></article><article className="psi-issue-bars"><header><div><span>ISSUE TYPE BREAKDOWN</span><h3>Student intent behind the review</h3></div><b>{fmt(issues.reduce((sum, issue) => sum + issue.count, 0))} priority reviews</b></header><div>{radarAxes.map((axis, index) => <button key={axis.label} onMouseEnter={() => setHoveredRadar(index)} onMouseLeave={() => setHoveredRadar(null)} onFocus={() => setHoveredRadar(index)} onBlur={() => setHoveredRadar(null)}><span>0{index + 1}</span><strong>{axis.label}</strong><i><b style={{ width: `${axis.value}%` }} /></i><em>{axis.value}</em><small>{axis.detail}</small></button>)}</div><blockquote className="psi-signature-quote"><small>DOMINANT PATTERN</small>“{activeIssue?.evidence?.[0]?.text ? String(activeIssue.evidence[0].text).slice(0, 180) : activeIssue?.summary || "No representative review is available."}”<p>This is a continuity and trust problem—not simply an app-quality complaint.</p></blockquote></article></div>
    </section>

    <section className="psi-block psi-issue-section">
      <header className="psi-block-head"><div><p>ISSUE INTELLIGENCE</p><h2>What is actually breaking?</h2></div><span>Semantic clusters merge differently worded reviews into product-level problems, then match the likely owner.</span></header>
      <div className="psi-issue-layout"><nav>{issues.map((issue, index) => <button key={issue.name} className={selectedIssue === index ? "active" : ""} onClick={() => setSelectedIssue(index)}><span>0{index + 1}</span><div><strong>{issue.name}</strong><small>{fmt(issue.count)} signals · {pct(issue.share)}</small></div><ChevronRight size={16} /></button>)}</nav>{activeIssue && <article><p>SELECTED ISSUE SYNTHESIS</p><h3>{activeIssue.name}</h3><strong>{pct(activeIssue.share)}</strong><span>of classified negative signals</span><p>{activeIssue.summary}</p>{activeIssue.evidence?.[0]?.text ? <blockquote>“{String(activeIssue.evidence[0].text).slice(0, 230)}{String(activeIssue.evidence[0].text).length > 230 ? "…" : ""}”<small>— {activeIssue.evidence[0].author || "Play Store reviewer"}</small></blockquote> : null}<button>Review source signals <ArrowUpRight size={14} /></button></article>}</div>
    </section>

    <section className="psi-block psi-cohort-section">
      <header className="psi-block-head"><div><p>COHORT LENS</p><h2>Where is the pain concentrated?</h2></div><span>Device tiers use captured device codes. Geography is not inferred when the source does not provide it.</span></header>
      <div className="psi-cohort-grid"><article><p>DEVICE MODEL · NEGATIVE OVER-INDEX</p>{(app.topNegativeDevices || []).filter((row: any) => row.device !== "Unknown").slice(0, 5).map((row: any, index: number) => <div key={row.device}><span><strong>{row.device}</strong><small>captured model</small></span><i><b style={{ width: `${Math.min(100, 24 + n(row.count) * 2.4)}%` }} /></i><em>{n(row.count).toFixed(0)}</em></div>)}</article><article className="psi-tier-card"><p>DEVICE TIER</p><h3>Performance sensitivity</h3><section>{cohort.slice(0, 3).map((row, index) => <div className={index === 0 ? "active" : ""} key={row.name}><small>{row.name}</small><strong>{pct(row.share)}</strong><span>{fmt(row.total)} reviews</span></div>)}</section><footer>Entry-tier devices show the strongest captured low-rating concentration.</footer></article><article><p>LANGUAGE CONCENTRATION</p>{(app.topLanguages || []).slice(0, 5).map((row: any, index: number) => <div key={row.language}><span><small>0{index + 1}</small><strong>{row.language || "Unknown"}</strong></span><i><b style={{ width: `${Math.min(100, n(row.share))}%` }} /></i><em>{pct(n(row.share))}</em></div>)}</article></div>
    </section>

    <PlayStoreDeviceIntelligence data={data} />

    <section className="psi-block psi-action-section">
      <header className="psi-block-head"><div><p>NARRATIVE INTELLIGENCE</p><h2>What the product team should do next.</h2></div><span>Decision order follows issue volume, current release exposure and operational closure gaps.</span></header>
      <div className="psi-actions"><article className="primary"><span><CircleAlert size={18} /> 01 · ACT NOW</span><h3>Stabilise the highest-volume failure journey</h3><p>{issues[0] ? `${issues[0].name} leads the negative conversation with ${fmt(issues[0].count)} classified signals. Start with its current-version evidence and reproduce the failure on the highest-risk device cohort.` : "Start with current-release low-rating evidence."}</p><button>Open source evidence <ArrowUpRight size={14} /></button></article><article><span><Check size={18} /> 02 · VERIFY</span><h3>Measure resolution, not reply volume</h3><p>{pct(replyRate)} of captured reviews received a reply. Link future reply reporting to confirmed resolution so operational activity is not mistaken for a closed learner problem.</p></article><article><span><Smartphone size={18} /> 03 · MONITOR</span><h3>Release and device guardrail</h3><p>Track low-rating share by release and device model after every rollout. Escalate only when volume and negative concentration move together.</p></article></div>
    </section>
  </section>;
}
