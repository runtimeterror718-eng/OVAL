import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// LinkedIn Intelligence API — reads Exa-sourced posts about Physics Wallah from
// linkedin_posts (ingested via scripts/ingest_linkedin_exa.py) and returns a
// sentiment summary + linked post list for the Play Store-style page.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY || "";
const LOOKBACK_DAYS = 90;

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

const NEG_RE = /\b(scam|fraud|toxic|layoff|laid off|fired|terminat|resign|overrated|worst|complaint|mislead|refund|ex-?employee|harass|overpriced|overvalued|cheat|disappoint|regret|avoid|unpaid|salary|byju|loss|caution|beware|fear|humiliat)\b/gi;
const HIRING_PROMO_RE = /\b(we(?:['’]re| are) hiring|now hiring|hiring alert|job opening|job vacancy|open roles?|apply now|walk[- ]?in interview|recruitment drive|join our team|send (?:your )?(?:cv|resume)|career opportunit(?:y|ies))\b/i;
const COMPLAINT_CONTEXT_RE = /\b(complaint|concern regarding recruitment|candidate communication|interview experience|offer (?:revoked|withdrawn)|ghosted|rejection without|toxic work culture|termination|terminated|forced resign|layoff|fired|unfair|fraud|scam|mislead|harass|corruption|retaliat|humiliat|broken promise|misconduct|support failure|no response)\b/i;
const CONTROVERSY_RE = /\b(fraud|scam|corruption|misconduct|harass|retaliat|humiliat|toxic|unfair|forced resign|terminat|layoff|fired|mislead|false promise|refund|unpaid|complaint|legal|governance|pressure|threat|broken promise)\b/gi;

// Complaint categories for negative posts. Order matters — most specific
// first (a parent's refund complaint is a parent complaint, not a support one).
const CATEGORIES: { key: string; label: string; re: RegExp }[] = [
  {
    key: "parent",
    label: "Parent complaints",
    re: /\b(my (daughter|son|child|kid|nephew|niece)|daughter'?s|son'?s|my child'?s|as a parent|nephews?|nieces?)\b/gi,
  },
  {
    key: "employee",
    label: "Employee badmouthing",
    re: /\b(work culture|toxic|termination|terminated|offer letter|notice period|appraisal|unpaid|fired|laid off|layoffs?|resign(ed|ation)?|exploitation|ex-?employees?|(as|being) an employee|my experience as an employee|colleagues?|hr (team|department|process|representative)|human resources?)\b/gi,
  },
  {
    key: "support",
    label: "Support complaints",
    re: /\b(refunds?|refunded|customer (care|service|support)|support team|helpline|call cent(er|re)|complaints?|deliver(y|ed)|otp|batch (validity|extended?)|money back|subscription|enrolled|counsel(l)?or|purchased?|paying ₹|paid ₹|app (crash|issue|glitch|problem)|course quality)\b/gi,
  },
  {
    key: "reputation",
    label: "Reputational attacks",
    re: /\b(scam(ster)?s?|frauds?|mislead(ing)?|expos(e|ing|ed)|caution|warning|beware|byju'?s?|overvalued|overpriced|two faces|playbook|valuation|ipo)\b/gi,
  },
];

// A parent voice ("my daughter", "my nephew") is decisive on its own; the
// other three are scored by keyword-hit count so mixed posts land in the
// bucket they talk about most. Ties break employee > support > reputation.
function categoryOf(text: string): { key: string; label: string } {
  const [parent, ...rest] = CATEGORIES;
  if ((text.match(parent.re) || []).length > 0) return { key: parent.key, label: parent.label };
  let best = rest[2];
  let bestHits = 0;
  for (const c of rest) {
    const hits = (text.match(c.re) || []).length;
    if (hits > bestHits) {
      best = c;
      bestHits = hits;
    }
  }
  return { key: best.key, label: best.label };
}

function sentimentOf(post: any): "positive" | "negative" | "neutral" {
  const raw = post?.raw_data || {};
  const s = String(raw.sentiment || "").toLowerCase();
  if (s === "positive" || s === "negative" || s === "neutral") return s as any;
  // Fallback for rows without a stored sentiment: negative needs strong
  // signal (2+ keyword hits in the post text itself), not one stray word.
  const hits = (post?.post_text || "").match(NEG_RE) || [];
  return hits.length >= 2 ? "negative" : "neutral";
}

async function getBrandIds(sb: any): Promise<string[]> {
  const { data } = await sb.from("brands").select("id").eq("name", "PhysicsWallah");
  return data?.length ? data.map((b: any) => b.id) : [];
}

export async function GET() {
  if (!url || !key) return NextResponse.json({ live: false });
  const sb = createClient(url, key);
  const brandIds = await getBrandIds(sb);
  if (!brandIds.length) return NextResponse.json({ live: true, posts: [], stats: emptyStats(), summary: null });

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  // Prefer Exa-sourced posts; fall back to any linkedin_posts under the brand.
  const { data: rows } = await sb
    .from("linkedin_posts")
    .select("*")
    .in("brand_id", brandIds)
    .order("published_date", { ascending: false })
    .limit(1000);

  // Brand-relevance gate: mirror of PW_TERMS_RE in scrapers/linkedin.py —
  // legacy rows stored before the ingest-side gate must not reach the UI.
  const PW_RE = /\b(physics\s*wallah|physicswallah|pw skills|pw vidyapeeth|alakh pandey|infinity pro|pwians?|pwstories|gyaan-e|gate wallah)\b|#pw\b/i;
  // Keep every stored source row. Semantic clusters retain the original row
  // IDs, so URL-level deduplication here can orphan a cluster from its dated
  // evidence and incorrectly make its selected-window count zero.
  const all = (rows || []).filter(
    (r: any) =>
      (r.post_text || "").trim().length > 20 &&
      PW_RE.test(`${r.post_text || ""} ${(r.raw_data || {}).title || ""}`) &&
      !(HIRING_PROMO_RE.test(`${r.post_text || ""} ${(r.raw_data || {}).title || ""}`) && !COMPLAINT_CONTEXT_RE.test(`${r.post_text || ""} ${(r.raw_data || {}).title || ""}`))
  );
  // window filter on published_date, keeping undated rows
  const inWindow = all.filter((r: any) => !r.published_date || r.published_date >= since);
  const source = inWindow.length ? inWindow : all;

  const posts = source
    .map((r: any) => {
      const raw = r.raw_data || {};
      const sentiment = sentimentOf(r);
      // stored raw_data.category (manual/LLM tag) wins over the keyword heuristic
      const stored = CATEGORIES.find((c) => c.key === (r.raw_data || {}).category);
      const category = sentiment === "negative" ? (stored ? { key: stored.key, label: stored.label } : categoryOf(r.post_text || "")) : null;
      return {
        id: r.id,
        author: r.author_name || "LinkedIn user",
        title: raw.title || r.author_headline || "",
        text: r.post_text || "",
        summary: raw.summary || "",
        sentiment,
        category: category?.key || null,
        categoryLabel: category?.label || null,
        url: r.post_url || "",
        publishedAt: r.published_date || null,
        reactions: r.reactions_count || 0,
        comments: r.comments_count || 0,
      };
    })
    // Latest audience signals are chronological: newest published posts first
    // and undated legacy rows last. Sentiment and controversy only break ties
    // between posts carrying the same publication timestamp.
    .sort((a: any, b: any) => {
      const publishedTime = (post: any) => {
        const value = post.publishedAt ? new Date(post.publishedAt).getTime() : Number.NaN;
        return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
      };
      const dateDelta = publishedTime(b) - publishedTime(a);
      if (dateDelta) return dateDelta;
      const sentimentRank = { negative: 0, neutral: 1, positive: 2 } as const;
      const sentimentDelta = sentimentRank[a.sentiment as keyof typeof sentimentRank] - sentimentRank[b.sentiment as keyof typeof sentimentRank];
      if (sentimentDelta) return sentimentDelta;
      const risk = (post: any) => (`${post.title || ""} ${post.text || ""}`.match(CONTROVERSY_RE) || []).length;
      return risk(b) - risk(a);
    });

  const counts = { positive: 0, negative: 0, neutral: 0 };
  for (const p of posts) counts[p.sentiment as keyof typeof counts]++;
  const total = posts.length;
  const negRate = total ? Math.round((counts.negative / total) * 100) : 0;

  // Theme buckets over negative posts (what the criticism is about)
  const THEMES: { label: string; re: RegExp }[] = [
    { label: "Workplace & culture", re: /toxic|culture|harass|humiliat|fear|micromanage|bad boss|work environment/i },
    { label: "Layoffs & terminations", re: /layoff|laid off|fired|terminat|resign|attrition/i },
    { label: "Unpaid / salary", re: /unpaid|salary|not paid|pending payment|dues/i },
    { label: "IPO / valuation / financials", re: /ipo|valuation|overvalued|stock|crore|loss|byju|investor/i },
    { label: "Scam / fraud allegations", re: /scam|fraud|fake|cheat|mislead|caution|beware/i },
    { label: "Refund / support", re: /refund|support|complaint|money back|not deliver/i },
    { label: "Hiring / recruitment", re: /hiring|recruit|interview|offer letter|nepotism|rejection/i },
  ];
  const themeCounts: Record<string, number> = {};
  for (const p of posts.filter((x: any) => x.sentiment === "negative")) {
    for (const t of THEMES) if (t.re.test(`${p.text} ${p.summary}`)) themeCounts[t.label] = (themeCounts[t.label] || 0) + 1;
  }
  const themes = Object.entries(themeCounts).sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
  const topTheme = themes[0]?.label || "general discussion";

  // Complaint-category counts over negative posts (for the UI filter chips)
  const categories = CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    count: posts.filter((p: any) => p.category === c.key).length,
  }));

  // headline complaints (top negative posts) for the briefing
  const topNegatives = posts.filter((p: any) => p.sentiment === "negative").slice(0, 3);

  const summary = {
    total,
    negRate,
    counts,
    topTheme,
    themes,
    categories,
    headline: total
      ? `${counts.negative} of ${total} recent LinkedIn posts about PW are critical (${negRate}%). Leading theme: ${topTheme}.`
      : "No LinkedIn posts about PW captured in the window.",
    narrative: total
      ? `Over the last ${LOOKBACK_DAYS} days, LinkedIn conversation about Physics Wallah skews ${negRate >= 50 ? "negative" : negRate >= 30 ? "mixed" : "positive"} — ${counts.positive} positive, ${counts.neutral} neutral, ${counts.negative} negative. The loudest critical narrative is ${topTheme.toLowerCase()}.`
      : "",
    topNegatives,
  };

  return NextResponse.json({
    live: true,
    window: `last ${LOOKBACK_DAYS} days`,
    generatedAt: new Date().toISOString(),
    stats: {
      totalPosts: total,
      negative: counts.negative,
      positive: counts.positive,
      neutral: counts.neutral,
      negRate,
    },
    summary,
    posts,
  });
}

function emptyStats() {
  return { totalPosts: 0, negative: 0, positive: 0, neutral: 0, negRate: 0 };
}
