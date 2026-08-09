import "server-only";

import type { NextRequest } from "next/server";
import { buildVaultMood, redactFreshdesk } from "./vault-intelligence";
import { VAULT_CHANNELS, type EvidencePeriod, type VaultChannel, type VaultEvidenceSlide, type VaultMood, type VaultTrack } from "./vault-types";

const IST_OFFSET = 330 * 60 * 1000;

const SEED_TRACKS: Array<Omit<VaultTrack, "id" | "spotifyUrl" | "embedUrl" | "active"> & { spotifyTrackId: string }> = [
  ["6dGnYIeXmHdcikdzNNDMm2", "Here Comes the Sun", "The Beatles", "uplifting", "low", ["appreciation", "teaching", "community"]],
  ["60nZcImufyMA1MKQY3dcCH", "Happy", "Pharrell Williams", "uplifting", "medium", ["celebration", "success", "community"]],
  ["0VjIjW4GlUZAMYd2vXMi3b", "Blinding Lights", "The Weeknd", "uplifting", "high", ["momentum", "growth", "launch"]],
  ["2takcwOaAZWiXQijPHIx7B", "Time in a Bottle", "Jim Croce", "reflective", "low", ["reflection", "nostalgia", "trust"]],
  ["0tgVpDi06FyKpA1z0VMD4v", "Perfect", "Ed Sheeran", "reflective", "medium", ["experience", "relationship", "appreciation"]],
  ["1mea3bSkSGXuIRvnydlB5b", "Viva La Vida", "Coldplay", "reflective", "high", ["reputation", "change", "leadership"]],
  ["2dpaYNEQHiRxtZbfNsse99", "Happier", "Marshmello & Bastille", "mixed", "low", ["mixed", "support", "expectations"]],
  ["7qiZfU4dY1lWllzX7mPBI3", "Shape of You", "Ed Sheeran", "mixed", "medium", ["conversation", "engagement", "community"]],
  ["7GhIk7Il098yCjg4BQjzvb", "Take On Me", "a-ha", "mixed", "high", ["change", "momentum", "debate"]],
  ["3n3Ppam7vgaVa1iaRUc9Lp", "Mr. Brightside", "The Killers", "tense", "low", ["friction", "doubt", "expectations"]],
  ["5ChkMS8OtdzJeqyybCc9R5", "Billie Jean", "Michael Jackson", "tense", "medium", ["reputation", "claims", "trust"]],
  ["4uLU6hMCjMI75M1A2tKUQC", "Never Gonna Give You Up", "Rick Astley", "tense", "high", ["retention", "reliability", "support"]],
].map(([spotifyTrackId, title, artist, valence, intensity, themeTags], index) => ({ spotifyTrackId, title, artist, valence, intensity, themeTags, channelScopes: [], priority: 70 - index % 3, artworkUrl: null } as any));

export function mapVaultTrack(row: any): VaultTrack {
  const id = String(row.spotify_track_id || row.spotifyTrackId);
  return {
    id: String(row.id || `seed-${id}`),
    spotifyTrackId: id,
    spotifyUrl: `https://open.spotify.com/track/${id}`,
    embedUrl: `https://open.spotify.com/embed/track/${id}?utm_source=generator&theme=0`,
    title: String(row.title || "Untitled track"),
    artist: String(row.artist || "Unknown artist"),
    artworkUrl: row.artwork_url || row.artworkUrl || null,
    valence: row.valence,
    intensity: row.intensity,
    themeTags: row.theme_tags || row.themeTags || [],
    channelScopes: row.channel_scopes || row.channelScopes || [],
    priority: Number(row.priority || 0),
    active: row.active !== false,
  };
}

export async function loadVaultTracks(admin: any, brandId: string) {
  const result = await admin.from("vault_tracks").select("*").eq("brand_id", brandId).eq("active", true).order("priority", { ascending: false });
  if (result.error || !result.data?.length) return { tracks: SEED_TRACKS.map(mapVaultTrack), warning: "Using the bundled approved catalogue until the Vault migration is applied." };
  return { tracks: result.data.map(mapVaultTrack), warning: null };
}

function normalizePeriod(value: string | null): EvidencePeriod {
  if (value === "today" || value === "yesterday" || value === "30d" || value === "month") return value;
  return "7d";
}

function periodBounds(period: EvidencePeriod, month?: string | null, now = new Date()) {
  const indiaNow = new Date(now.getTime() + IST_OFFSET);
  const todayIndia = Date.UTC(indiaNow.getUTCFullYear(), indiaNow.getUTCMonth(), indiaNow.getUTCDate()) - IST_OFFSET;
  let from = todayIndia;
  let to = now.getTime();
  if (period === "yesterday") { from -= 86400000; to = todayIndia - 1; }
  if (period === "7d") from = todayIndia - 6 * 86400000;
  if (period === "30d") from = todayIndia - 29 * 86400000;
  if (period === "month" && /^\d{4}-\d{2}$/.test(month || "")) {
    const [year, number] = month!.split("-").map(Number);
    from = Date.UTC(year, number - 1, 1) - IST_OFFSET;
    to = Date.UTC(year, number, 1) - IST_OFFSET - 1;
  }
  return { from: new Date(from), to: new Date(to) };
}

function sentiment(value: unknown, rating?: unknown): VaultEvidenceSlide["sentiment"] {
  if (typeof rating === "number" || /^\d+(?:\.\d+)?$/.test(String(rating || ""))) {
    const score = Number(rating);
    if (score <= 2) return "negative";
    if (score >= 4) return "positive";
  }
  const label = String(value || "neutral").toLowerCase();
  if (/positive|praise|good|happy|supportive/.test(label)) return "positive";
  if (/negative|critical|urgent|high|angry|bad/.test(label)) return "negative";
  return "neutral";
}

function collectEvidence(channel: VaultChannel, payload: any): VaultEvidenceSlide[] {
  const evidence: VaultEvidenceSlide[] = [];
  const seenObjects = new WeakSet<object>();
  const add = (item: any, theme?: string) => {
    if (!item || typeof item !== "object") return;
    const raw = item.text || item.body || item.comment || item.description || item.content || item.summary || item.evidence;
    if (!raw || String(raw).trim().length < 12) return;
    const rawDate = item.publishedAt || item.published_at || item.createdAt || item.created_at || item.date || item.timestamp;
    const parsedDate = rawDate ? new Date(rawDate) : null;
    const sourceRef = String(item.id || item.external_id || item.platform_ref_id || item.url || `${channel}-${evidence.length}`);
    const isFreshdesk = channel === "freshdesk";
    const text = isFreshdesk ? redactFreshdesk(String(raw)) : String(raw).replace(/\s+/g, " ").trim();
    evidence.push({
      id: sourceRef,
      sourceRef,
      author: isFreshdesk ? "Freshdesk customer" : String(item.author?.name || item.author || item.username || item.user || item.channelTitle || `${channel} user`),
      text: text.slice(0, 1000),
      date: parsedDate && Number.isFinite(parsedDate.getTime()) ? parsedDate.toISOString() : null,
      sentiment: sentiment(item.sentiment || item.sentiment_label || item.severity, item.rating || item.stars),
      theme: String(theme || item.theme || item.cluster || item.category || "Audience conversation"),
      url: isFreshdesk ? null : item.url || item.permalink || item.source_url || null,
      sourceType: isFreshdesk ? "support" : channel === "playstore" ? "review" : item.source_type || item.sourceType || "external",
      engagement: Number(item.engagement || item.likes || item.score || item.upvotes || item.like_count || 0),
    });
  };
  const walk = (value: any, theme?: string, depth = 0) => {
    if (!value || depth > 5 || evidence.length >= 600) return;
    if (Array.isArray(value)) { value.forEach((item) => walk(item, theme, depth + 1)); return; }
    if (typeof value !== "object" || seenObjects.has(value)) return;
    seenObjects.add(value);
    const nextTheme = String(value.label || value.name || value.theme || value.category || theme || "Audience conversation");
    const evidenceLike = value.text || value.body || value.comment || (value.author && (value.description || value.summary));
    if (evidenceLike) add(value, nextTheme);
    for (const key of ["posts", "comments", "replies", "children", "evidence", "examples", "reviews", "liveReviews", "criticalReviews", "activeExamples", "urgentExamples", "youtubeBriefBuckets", "clusters"]) {
      if (value[key]) walk(value[key], nextTheme, depth + 1);
    }
  };
  if (channel === "playstore") {
    const app = payload.apps?.[payload.primaryPackage] || Object.values(payload.apps || {})[0] || payload;
    walk(app);
  } else walk(payload);
  return evidence;
}

async function fetchJson(request: NextRequest, path: string) {
  const response = await fetch(new URL(path, request.nextUrl.origin), { headers: { cookie: request.headers.get("cookie") || "" }, cache: "no-store" });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

async function ownedPayload(admin: any, brandId: string, provider: "facebook" | "instagram") {
  const connections = await admin.from("social_connections").select("id,provider,account_name,status,last_synced_at,coverage_started_at").eq("brand_id", brandId).eq("provider", provider);
  const posts = await admin.from("owned_social_posts").select("*").eq("brand_id", brandId).eq("provider", provider).order("published_at", { ascending: false }).limit(250);
  const postIds = (posts.data || []).map((post: any) => post.id);
  const comments = postIds.length ? await admin.from("owned_social_comments").select("*").eq("brand_id", brandId).in("post_id", postIds).order("published_at", { ascending: false }).limit(500) : { data: [] };
  const byPost = new Map<string, any[]>();
  for (const comment of comments.data || []) byPost.set(comment.post_id, [...(byPost.get(comment.post_id) || []), comment]);
  return { connections: connections.data || [], posts: (posts.data || []).map((post: any) => ({ ...post, comments: byPost.get(post.id) || [] })) };
}

const endpointFor = (channel: VaultChannel) => channel === "facebook" || channel === "instagram" ? `/api/owned-social/${channel}` : `/api/${channel}`;

export async function buildLiveVaultMood(input: { request: NextRequest; channel: VaultChannel; brandId: string; admin: any; period?: EvidencePeriod; bounds?: { from: Date; to: Date } }): Promise<VaultMood> {
  if (process.env.VAULT_ENABLED === "false") throw new Error("The Sentiment Vault is disabled");
  const period = input.period || normalizePeriod(input.request.nextUrl.searchParams.get("period"));
  const month = input.request.nextUrl.searchParams.get("month");
  const sourceType = input.request.nextUrl.searchParams.get("sourceType");
  const warnings: string[] = [];
  const query = new URLSearchParams(input.request.nextUrl.searchParams);
  query.delete("cursor"); query.delete("limit");
  const [payload, semantic, catalogue, history] = await Promise.all([
    input.channel === "facebook" || input.channel === "instagram"
      ? ownedPayload(input.admin, input.brandId, input.channel).catch((error) => { warnings.push(error.message); return {}; })
      : fetchJson(input.request, `${endpointFor(input.channel)}?${query}`).catch((error) => { warnings.push(error.message); return {}; }),
    fetchJson(input.request, `/api/vector-summary?platform=${input.channel}`).catch(() => null),
    loadVaultTracks(input.admin, input.brandId),
    input.admin.from("vault_snapshots").select("track_id").eq("brand_id", input.brandId).eq("channel", input.channel).not("track_id", "is", null).order("week_start", { ascending: false }).limit(2),
  ]);
  if (catalogue.warning) warnings.push(catalogue.warning);
  const bounds = input.bounds || periodBounds(period, month);
  const evidence = collectEvidence(input.channel, payload).filter((item) => {
    if (sourceType && sourceType !== "all" && item.sourceType !== sourceType) return false;
    if (!item.date) return period === "30d" || period === "7d";
    const timestamp = new Date(item.date).getTime();
    return timestamp >= bounds.from.getTime() && timestamp <= bounds.to.getTime();
  });
  if (!evidence.length && period !== "30d") warnings.push("No dated evidence matched this filter. Try Last 30 Days.");
  const cluster = semantic?.clusters?.[0] || payload?.clusters?.[0] || payload?.issues?.[0];
  const dominantTheme = {
    name: String(cluster?.label || cluster?.name || cluster?.title || evidence[0]?.theme || "Audience conversation"),
    summary: String(cluster?.summary || cluster?.description || "The leading theme is derived from representative evidence in the selected window."),
    clusterIds: [cluster?.id || cluster?.cluster_id || cluster?.platform_ref_id].filter(Boolean).map(String),
  };
  const dates = evidence.map((item) => item.date ? new Date(item.date).getTime() : NaN).filter(Number.isFinite);
  return buildVaultMood({
    channel: input.channel,
    period,
    coverage: {
      from: new Date(dates.length ? Math.min(...dates) : bounds.from.getTime()).toISOString(),
      to: new Date(dates.length ? Math.max(...dates) : bounds.to.getTime()).toISOString(),
      signalCount: evidence.length,
    },
    evidence,
    dominantTheme,
    tracks: catalogue.tracks,
    critical: evidence.filter((item) => item.sentiment === "negative").length,
    previousTrackIds: (history.data || []).map((item: any) => item.track_id),
    warnings,
  });
}

export function isVaultChannel(value: string): value is VaultChannel {
  return VAULT_CHANNELS.includes(value as VaultChannel);
}
