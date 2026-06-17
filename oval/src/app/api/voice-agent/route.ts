import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type BriefingLine = {
  title: string;
  detail: string;
  severity: "critical" | "high" | "medium" | "positive" | "info";
};

function compact(value: any) {
  const n = Number(value || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} million`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} thousand`;
  return String(n);
}

function cleanText(value: any, max = 220) {
  return String(value || "")
    .replace(/[^\x20-\x7E]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .trim()
    .slice(0, max);
}

async function fetchJson(origin: string, path: string) {
  try {
    const response = await fetch(`${origin}${path}`, { cache: "no-store" });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function buildScript(lines: BriefingLine[]) {
  const ordered = [
    ...lines.filter((line) => line.severity === "critical"),
    ...lines.filter((line) => line.severity === "high"),
    ...lines.filter((line) => line.severity === "medium"),
    ...lines.filter((line) => line.severity === "positive"),
    ...lines.filter((line) => line.severity === "info"),
  ].slice(0, 9);

  const body = ordered.map((line, index) => `${index + 1}. ${line.title}. ${line.detail}`).join(" ");
  return `Here is the OVAL leadership briefing for Physics Wallah. ${body} End of briefing.`;
}

async function synthesizeWithMiso(text: string) {
  const endpoint = process.env.MISO_TTS_HTTP_URL || process.env.MISO_TTS_ENDPOINT;
  if (!endpoint) return null;

  try {
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/tts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,
        speaker: Number(process.env.MISO_TTS_SPEAKER || 0),
        max_audio_length_ms: Number(process.env.MISO_TTS_MAX_AUDIO_MS || 90_000),
      }),
    });
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const contentType = response.headers.get("content-type") || "audio/wav";
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const includeAudio = requestUrl.searchParams.get("audio") === "1";

  const [commandCenter, radar, playstore, freshdesk, incidents] = await Promise.all([
    fetchJson(origin, "/api/command-center"),
    fetchJson(origin, "/api/reputation-radar?hours=72"),
    fetchJson(origin, "/api/playstore"),
    fetchJson(origin, "/api/freshdesk"),
    fetchJson(origin, "/api/incidents"),
  ]);

  const lines: BriefingLine[] = [];
  const radarRisk = radar?.mainRiskPosts || radar?.negativePosts || [];
  const radarPositive = radar?.positiveSignals || radar?.positivePosts || [];
  const playPrimary = playstore?.apps?.[playstore?.primaryPackage] || {};
  const topPlayTheme = playPrimary?.themes?.[0];
  const freshStats = freshdesk?.stats || {};
  const freshTop = freshdesk?.categories?.[0] || freshdesk?.groups?.[0];
  const topIncidents = incidents?.incidents || incidents?.items || [];
  const commandAlerts = commandCenter?.alerts || [];

  if (radarRisk[0]) {
    lines.push({
      severity: radarRisk[0].escalationLevel === "critical" ? "critical" : "high",
      title: `Top reputation risk is ${cleanText(radarRisk[0].title, 90)}`,
      detail: `${cleanText(radarRisk[0].issueCategory, 90)} on ${radarRisk[0].platform}. Owner is ${radarRisk[0].businessOwner || "not assigned"}. Priority score is ${radarRisk[0].priorityScore || radarRisk[0].impact?.finalPriorityScore || "not available"}.`,
    });
  }

  if (radarRisk[1]) {
    lines.push({
      severity: "high",
      title: `Second risk is ${cleanText(radarRisk[1].title, 90)}`,
      detail: `${cleanText(radarRisk[1].text || radarRisk[1].issueCategory, 180)}.`,
    });
  }

  if (commandAlerts.length) {
    lines.push({
      severity: "high",
      title: `${commandAlerts.length} active cross-channel alerts need attention`,
      detail: `The highest alert is ${cleanText(commandAlerts[0]?.title, 140)} from ${commandAlerts[0]?.platform || "an external channel"}.`,
    });
  }

  if (playPrimary.sampleSize) {
    lines.push({
      severity: playPrimary.lowRatingRate > 7 ? "high" : "medium",
      title: `Play Store rating is ${playPrimary.averageRating} stars`,
      detail: `${compact(playPrimary.sampleSize)} reviews are loaded. Low rating pressure is ${playPrimary.lowRatingRate} percent. Top written review theme is ${topPlayTheme?.name || "not available"} with ${compact(topPlayTheme?.mentions || 0)} mentions.`,
    });
  }

  if (playPrimary.releaseComparison?.current) {
    const current = playPrimary.releaseComparison.current;
    const previous = playPrimary.releaseComparison.previous || {};
    lines.push({
      severity: "medium",
      title: `Current Play Store build is ${current.version || "unknown"}`,
      detail: `It is at ${current.averageRating || playPrimary.averageRating} stars versus previous build ${previous.version || "unknown"} at ${previous.averageRating || "unknown"} stars.`,
    });
  }

  if (freshStats.totalTickets) {
    lines.push({
      severity: freshStats.uncategorizedTickets > 1000 ? "high" : "medium",
      title: `Freshdesk has ${compact(freshStats.totalTickets)} tickets in the snapshot`,
      detail: `${compact(freshStats.activeTickets)} are active. The largest support bucket is ${freshTop?.name || freshTop?.group || "not available"} with ${compact(freshTop?.count || freshTop?.tickets || 0)} tickets.`,
    });
  }

  if (topIncidents[0]) {
    lines.push({
      severity: topIncidents[0].severity === "critical" ? "critical" : "high",
      title: `Top incident candidate is ${cleanText(topIncidents[0].title, 100)}`,
      detail: `${cleanText(topIncidents[0].summary, 190)} Owner is ${topIncidents[0].owner || topIncidents[0].team || "not assigned"}.`,
    });
  }

  if (radarPositive[0]) {
    lines.push({
      severity: "positive",
      title: `Positive signal is ${cleanText(radarPositive[0].title, 90)}`,
      detail: `This is from ${radarPositive[0].platform}. Keep it visible because positive advocacy balances the risk queue.`,
    });
  }

  lines.push({
    severity: "info",
    title: "Recommended leadership move",
    detail: "Start with critical public risks, then route Play Store and Freshdesk operational asks to owners. Keep positive academic advocacy visible, but do not let it hide support and payment issues.",
  });

  const script = buildScript(lines);
  const audioUrl = includeAudio ? await synthesizeWithMiso(script) : null;

  return NextResponse.json({
    live: true,
    generatedAt: new Date().toISOString(),
    provider: {
      preferred: process.env.MISO_TTS_HTTP_URL || process.env.MISO_TTS_ENDPOINT ? "misotts" : "browser_speech",
      audioReady: Boolean(audioUrl),
      fallback: "browser_speech_synthesis",
      note: "MisoTTS requires the local Python GPU service. Browser speech is used when that service is not configured.",
    },
    script,
    lines,
    audioUrl,
    sourceCoverage: {
      commandCenter: Boolean(commandCenter),
      reputationRadar: Boolean(radar),
      playstore: Boolean(playstore),
      freshdesk: Boolean(freshdesk),
      incidents: Boolean(incidents),
    },
  });
}
