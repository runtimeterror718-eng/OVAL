import { NextResponse } from "next/server";
import { crmErrorResponse, requireIntegrationContext } from "@/lib/crm-server";
import { isSocialProvider } from "@/lib/social-integrations";

export const dynamic = "force-dynamic";

const negative = /scam|fraud|refund|toxic|worst|bad|poor|issue|problem|crash|mislead|complaint|cheat|fake|unpaid|delay|not working|disappoint/i;
const positive = /great|good|best|excellent|proud|success|congrat|inspiring|helpful|affordable|love/i;
const classify = (text: string) => negative.test(text) ? "negative" : positive.test(text) ? "positive" : "neutral";

const themeDefinitions = [
  { name: "Product reliability", test: /app|crash|bug|buffer|video|login|download|technical|not working/i, summary: "Audience discussion points to app, access, playback or technical reliability." },
  { name: "Payments and refunds", test: /payment|refund|money|charge|subscription|paid/i, summary: "Comments concern payments, refunds, subscriptions or money-related trust." },
  { name: "Learning experience", test: /teacher|faculty|class|course|batch|lecture|exam|content|doubt/i, summary: "The thread discusses teaching, course delivery, batches or learning outcomes." },
  { name: "Support experience", test: /support|help|ticket|response|resolve|contact/i, summary: "People are describing support responsiveness and resolution quality." },
  { name: "Brand and workplace", test: /brand|ipo|valuation|employee|culture|hiring|salary|layoff/i, summary: "The conversation relates to corporate reputation, growth, hiring or workplace experience." },
] as const;

export async function GET(request: Request, { params }: { params: { provider: string } }) {
  try {
    if (!isSocialProvider(params.provider)) return NextResponse.json({ error: "Unsupported provider" }, { status: 404 });
    const { admin, member } = await requireIntegrationContext(); const url = new URL(request.url);
    const limit = Math.min(500, Math.max(10, Number(url.searchParams.get("limit") || 200))); const cursor = url.searchParams.get("cursor");
    let query = admin.from("owned_social_posts").select("*").eq("brand_id", member.brand_id).eq("provider", params.provider).order("published_at", { ascending: false, nullsFirst: false }).order("id", { ascending: false }).limit(limit + 1);
    if (cursor) query = query.lt("published_at", cursor);
    const [postResult, connectionResult] = await Promise.all([query, admin.from("social_connections").select("id,display_name,username,status,coverage_started_at,last_synced_at,last_error").eq("brand_id", member.brand_id).eq("provider", params.provider).neq("status", "disconnected")]);
    if (postResult.error) throw postResult.error;
    const hasMore = (postResult.data || []).length > limit; const rows = (postResult.data || []).slice(0, limit); const postIds = rows.map((post: any) => post.id);
    const commentResult = postIds.length ? await admin.from("owned_social_comments").select("*").in("post_id", postIds).order("published_at", { ascending: true, nullsFirst: false }).limit(5000) : { data: [], error: null };
    if (commentResult.error) throw commentResult.error;
    const commentsByPost = new Map<string, any[]>();
    for (const comment of commentResult.data || []) { const list = commentsByPost.get(comment.post_id) || []; list.push({ id: comment.provider_comment_id, parentId: comment.provider_parent_comment_id, rootId: comment.provider_root_comment_id, depth: comment.thread_depth, author: comment.author_name || comment.author_username || "Audience member", username: comment.author_username, text: comment.content_text || "", date: comment.published_at, url: comment.source_url, likes: Number(comment.likes_count || 0), replies: Number(comment.replies_count || 0), sentiment: classify(comment.content_text || ""), sourceType: "owned" }); commentsByPost.set(comment.post_id, list); }
    const posts = rows.map((post: any) => ({ id: post.provider_post_id, author: post.author_name || post.author_username || post.display_name || "Official channel", username: post.author_username, text: post.content_text || "", title: String(post.content_text || "").split(/[.!?]/)[0].slice(0, 100), publishedAt: post.published_at, createdAt: post.published_at, url: post.source_url, likes: Number(post.likes_count || 0), commentsCount: Number(post.comments_count || 0), shares: Number(post.shares_count || 0), views: Number(post.views_count || 0), mediaType: post.media_type, mediaUrls: post.media_urls || [], sentiment: classify(post.content_text || ""), sourceType: "owned", comments: commentsByPost.get(post.id) || [] }));
    const allSignals = [...posts, ...posts.flatMap((post) => post.comments)];
    const sentiment = allSignals.reduce((total, item) => ({ ...total, [item.sentiment]: total[item.sentiment as "positive" | "neutral" | "negative"] + 1 }), { positive: 0, neutral: 0, negative: 0 });
    const clusters = themeDefinitions.map((theme) => { const evidence = allSignals.filter((item) => theme.test.test(item.text)); return { name: theme.name, count: evidence.length, share: allSignals.length ? evidence.length / allSignals.length * 100 : 0, summary: theme.summary, sentiment: evidence.filter((item) => item.sentiment === "negative").length > evidence.length / 2 ? "negative" : "mixed", evidence }; }).filter((item) => item.count).sort((a, b) => b.count - a.count);
    return NextResponse.json({ provider: params.provider, source: "official-oauth", connections: connectionResult.data || [], coverage: { earliest: rows.map((post: any) => post.published_at).filter(Boolean).sort()[0] || connectionResult.data?.map((item: any) => item.coverage_started_at).filter(Boolean).sort()[0], latest: rows.map((post: any) => post.published_at).filter(Boolean).sort().at(-1), hasMore, nextCursor: hasMore ? rows.at(-1)?.published_at : null }, stats: { totalPosts: posts.length, totalComments: posts.reduce((sum, post) => sum + post.comments.length, 0), totalSignals: allSignals.length, ...sentiment }, clusters, posts });
  } catch (error) { return crmErrorResponse(error); }
}
