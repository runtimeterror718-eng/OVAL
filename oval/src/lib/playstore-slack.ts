type Review = {
  reviewId?: string | null;
  rating?: number | null;
  text?: string | null;
  version?: string | null;
  date?: string | null;
  postedAt?: string | null;
  replied?: boolean | null;
  theme?: string | null;
  owner?: string | null;
  author?: string | null;
};

type ReviewWithRisk = Review & {
  commercialRisk: {
    label: string;
    owner: string;
  };
};

type LiveIssue = {
  label: string;
  summary: string;
  count: number;
  windowLabel: string;
  reviews: ReviewWithRisk[];
  versions: string[];
  latestDate?: string | null;
};

function daysBefore(date?: string | null, days = 30) {
  const parsed = date ? new Date(`${date}T00:00:00`) : new Date();
  const base = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const next = new Date(base);
  next.setDate(base.getDate() - days);
  return next;
}

function issueWindowLabel(days: number) {
  if (days <= 1) return "today";
  if (days === 2) return "last 48 hours";
  if (days === 3) return "last 72 hours";
  return `last ${days} days`;
}

function classifyCommercialRisk(review: Review) {
  const text = String(review.text || "").toLowerCase();
  const matchers = [
    {
      label: "Overselling",
      owner: "Growth / Academic Ops",
      keywords: ["promise", "promised", "guarantee", "guaranteed", "rank", "selection", "advertise", "advertised", "over promise", "overpromise"],
    },
    {
      label: "Mis-selling",
      owner: "Sales / Compliance",
      keywords: ["mis sell", "missell", "mis-sell", "misleading", "wrong information", "false", "fraud", "scam", "cheat", "cheated"],
    },
    {
      label: "Batch / Course Issue",
      owner: "Aditya Kumar",
      keywords: ["batch", "course", "class", "lecture", "teacher", "faculty", "syllabus", "content", "test series"],
    },
    {
      label: "Payment / Refund",
      owner: "Aayush / Keshav",
      keywords: ["payment", "refund", "deducted", "gateway", "transaction", "money", "paid", "subscription"],
    },
    {
      label: "App / Playback",
      owner: "Product Reliability",
      keywords: ["video", "playback", "buffer", "crash", "login", "download", "app", "bug", "otp"],
    },
  ];
  return matchers.find((matcher) => matcher.keywords.some((keyword) => text.includes(keyword))) || {
    label: "General Student Ask",
    owner: review.owner || "Support Ops",
  };
}

function detectLatestStudentIssue(reviews: ReviewWithRisk[], endDate?: string | null): LiveIssue | null {
  const windowDays = 3;
  const windowStart = daysBefore(endDate, windowDays - 1);
  const windowEnd = endDate ? new Date(`${endDate}T23:59:59`) : new Date();
  const recentNegatives = reviews.filter((review) => {
    if (!(Number(review.rating || 0) <= 2) || !review.text) return false;
    const parsed = review.date ? new Date(`${review.date}T12:00:00`) : null;
    return parsed && !Number.isNaN(parsed.getTime()) && parsed >= windowStart && parsed <= windowEnd;
  });
  if (!recentNegatives.length) return null;

  const rules = [
    {
      label: "Admit card banner is blocking access",
      summary: "Students say an admit-card popup or upload step is preventing them from opening the app or reaching lectures.",
      pattern: /admit\s*card|roll\s*no|invalid error|banner|popup|pop up/i,
    },
    {
      label: "Students cannot access paid batch content",
      summary: "Recent low-star reviews say payments succeeded but paid batches, tests, or purchased access did not unlock correctly.",
      pattern: /purchased|purchase|paid|payment|pro batch|regular batch|not get access|did not get access|can't attempt test|test paper|batch access|access to regular batch/i,
    },
    {
      label: "App performance is slowing study flow",
      summary: "Students report lag, delays, glitches, and app-open failures that are interrupting lectures and navigation.",
      pattern: /lag|delay|glitch|not opening|not open|network issue|slow|30 40 second|backend|not work properly|doesn't work|do not work/i,
    },
    {
      label: "Refund and support complaints are active",
      summary: "Recent reviews say refunds, books, or support follow-ups are unresolved despite repeated requests.",
      pattern: /refund|support|no response|not responsibl|complaint|books|ticket|resolution/i,
    },
    {
      label: "Teacher and batch complaints are resurfacing",
      summary: "Students are flagging schedule changes, faculty dissatisfaction, or batch-experience mismatch in recent reviews.",
      pattern: /teacher|faculty|schedule|3 class per day|class per day|offline class|batch/i,
    },
  ];

  const matched = rules
    .map((rule) => {
      const matchedReviews = recentNegatives.filter((review) => rule.pattern.test(String(review.text || "")));
      const sorted = [...matchedReviews].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      return { ...rule, reviews: sorted, count: matchedReviews.length, latestDate: sorted[0]?.date || null };
    })
    .filter((rule) => rule.count > 0)
    .sort((a, b) => b.count - a.count || String(b.latestDate || "").localeCompare(String(a.latestDate || "")));

  const winner = matched[0];
  if (winner) {
    return {
      label: winner.label,
      summary: winner.summary,
      count: winner.count,
      windowLabel: issueWindowLabel(windowDays),
      reviews: winner.reviews,
      versions: Array.from(new Set(winner.reviews.map((review) => review.version).filter(Boolean) as string[])).slice(0, 3),
      latestDate: winner.latestDate,
    };
  }

  const fallbackReviews = [...recentNegatives].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const fallback = fallbackReviews[0];
  return {
    label: fallback?.commercialRisk?.label || "Latest negative student issue",
    summary: "Recent low-star written reviews are active and need manual readout for precise routing.",
    count: recentNegatives.length,
    windowLabel: issueWindowLabel(windowDays),
    reviews: fallbackReviews,
    versions: Array.from(new Set(fallbackReviews.map((review) => review.version).filter(Boolean) as string[])).slice(0, 3),
    latestDate: fallback?.date || null,
  };
}

function collectLatestReviews(payload: any): Review[] {
  const primary = payload?.apps?.[payload?.primaryPackage] || {};
  const themes = primary?.themes || [];
  const latestReviewRows = [
    ...(primary.recentReviews || []),
    ...(primary.criticalReviews || []),
    ...(primary.divergentReviews || []),
    ...(primary.positiveReviews || []),
    ...themes.flatMap((theme: any) => theme.examples || []),
    ...(payload?.liveReviews || []),
  ];

  const latestReviewMap = new Map<string, Review>();
  latestReviewRows.forEach((review: any) => {
    if (!review?.text) return;
    const key = `${String(review.date || "unknown").slice(0, 10)}-${review.version || "unknown"}-${String(review.text).slice(0, 80)}`;
    latestReviewMap.set(key, {
      reviewId: review.reviewId,
      rating: review.rating,
      text: review.text,
      version: review.version,
      date: review.date ? String(review.date).slice(0, 10) : review.date,
      postedAt: review.postedAt,
      replied: review.replied,
      theme: review.theme,
      owner: review.owner,
      author: review.author || latestReviewMap.get(key)?.author || null,
    });
  });

  return Array.from(latestReviewMap.values()).sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
}

export function buildPlaystoreSlackMessage(payload: any) {
  const primary = payload?.apps?.[payload?.primaryPackage] || {};
  const currentVersion = primary.releaseComparison?.current || primary.recentVersions?.[0] || {};
  const latestReviews = collectLatestReviews(payload);
  const enrichedReviews: ReviewWithRisk[] = latestReviews.map((review) => ({ ...review, commercialRisk: classifyCommercialRisk(review) }));
  const latestStudentIssue = detectLatestStudentIssue(enrichedReviews, payload?.dateRange?.to);

  const latest7dEnd = payload?.dateRange?.to ? new Date(`${payload.dateRange.to}T23:59:59`) : new Date();
  const latest7dStart = new Date(latest7dEnd);
  latest7dStart.setDate(latest7dStart.getDate() - 7);
  const isWithinLatest7d = (date?: string | null) => {
    if (!date) return false;
    const parsed = new Date(`${date}T12:00:00`);
    return !Number.isNaN(parsed.getTime()) && parsed >= latest7dStart && parsed <= latest7dEnd;
  };

  const marqueeStart = daysBefore(payload?.dateRange?.to, 13);
  const inMarqueeWindow = (date?: string | null) => {
    if (!date) return false;
    const parsed = new Date(`${date}T12:00:00`);
    return !Number.isNaN(parsed.getTime()) && parsed >= marqueeStart && parsed <= latest7dEnd;
  };

  const negative7dReviews = enrichedReviews.filter((review) => Number(review.rating || 0) <= 2 && isWithinLatest7d(review.date));
  const marqueeNegatives = enrichedReviews.filter((review) => Number(review.rating || 0) <= 2 && review.text && inMarqueeWindow(review.date));
  const concernCounts = marqueeNegatives.reduce((acc: Record<string, number>, review) => {
    const label = review.commercialRisk.label;
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
  const sortedConcerns = Object.entries(concernCounts).sort((a, b) => b[1] - a[1]);
  const topConcern = sortedConcerns[0];
  const briefTotal = marqueeNegatives.length;
  const briefTopCount = topConcern ? topConcern[1] : 0;
  const briefTopLabel = topConcern ? topConcern[0] : "";
  const briefPct = briefTotal ? Math.round((briefTopCount / briefTotal) * 100) : 0;
  const latestIssueEvidence = latestStudentIssue?.reviews.find((review) => review.text && String(review.text).length <= 140)?.text || latestStudentIssue?.reviews[0]?.text || "";
  const recentNegativeComments = enrichedReviews
    .filter((review) => Number(review.rating || 0) <= 2 && isWithinLatest7d(review.date) && review.text)
    .sort((a, b) => String(b.postedAt || b.date || "").localeCompare(String(a.postedAt || a.date || "")))
    .filter((review, index, rows) => rows.findIndex((row) => String(row.text || "").trim() === String(review.text || "").trim()) === index)
    .slice(0, 5);

  const briefingHeadline = latestStudentIssue
    ? `${latestStudentIssue.label}`
    : topConcern
      ? `${briefTopLabel} is leading negative review volume`
      : "No active negative student issue in the selected window";
  const briefingSummary = latestStudentIssue
    ? `${latestStudentIssue.count} low-rating reviews in the ${latestStudentIssue.windowLabel} point to this issue.${latestStudentIssue.versions.length ? ` Most reports are on v${latestStudentIssue.versions.join(", v")}.` : ""}`
    : topConcern
      ? `${briefTopCount} of ${briefTotal} negative reviews (${briefPct}%) sit in this bucket.`
      : "Students are relatively quiet right now.";
  const briefingContext = latestStudentIssue && topConcern
    ? `Across the wider 14-day queue, ${briefTopLabel} still remains the largest negative bucket at ${briefTopCount} of ${briefTotal} reviews (${briefPct}%).`
    : "";

  const topBuckets = sortedConcerns.slice(0, 3).map(([label, count]) => `• ${label}: ${count}`).join("\n") || "• No negative buckets active";
  const currentVersionLabel = currentVersion.version ? `v${currentVersion.version}` : "latest";
  const syncedAt = payload?.livePulledAt ? new Date(payload.livePulledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Unknown";
  const averageRating = primary.averageRating || "--";
  const currentRating = currentVersion.averageRating || averageRating;
  const lowRatingRate = primary.lowRatingRate || 0;
  const liveReviewCount = payload?.liveReviews?.length || 0;
  const recentNegativeCommentLines = recentNegativeComments
    .map((review) => {
      const author = review.author || "Play Store user";
      const version = review.version ? `v${review.version}` : "Unknown version";
      const date = review.date || "Unknown date";
      const text = String(review.text || "").replace(/\s+/g, " ").trim();
      return `• *${author}* · ${version} · ${date}\n>${text}`;
    })
    .join("\n\n");

  const text = [
    `OVAL Play Store briefing`,
    briefingHeadline,
    briefingSummary,
    briefingContext,
  ].filter(Boolean).join(" — ");

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: "OVAL · Play Store briefing", emoji: true },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*Synced:* ${syncedAt}` },
        { type: "mrkdwn", text: `*Live reviews:* ${liveReviewCount}` },
        { type: "mrkdwn", text: `*Current release:* ${currentVersionLabel}` },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Live briefing*\n*${briefingHeadline}*\n${briefingSummary}${briefingContext ? `\n${briefingContext}` : ""}`,
      },
    },
    latestIssueEvidence
      ? {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Student signal*\n>${String(latestIssueEvidence).trim()}`,
          },
        }
      : null,
    recentNegativeCommentLines
      ? {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Recent negative comments*\n${recentNegativeCommentLines}`,
          },
        }
      : null,
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Avg rating*\n${averageRating}★` },
        { type: "mrkdwn", text: `*Current version rating*\n${currentRating}★` },
        { type: "mrkdwn", text: `*7-day negatives*\n${negative7dReviews.length}` },
        { type: "mrkdwn", text: `*Low-rating rate*\n${lowRatingRate}%` },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Top negative buckets (14 days)*\n${topBuckets}`,
      },
    },
  ].filter(Boolean);

  return {
    text,
    blocks,
    meta: {
      headline: briefingHeadline,
      summary: briefingSummary,
      context: briefingContext,
      syncedAt,
      liveReviewCount,
      currentVersion: currentVersionLabel,
    },
  };
}
