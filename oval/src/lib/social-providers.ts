import "server-only";

import { createHash } from "crypto";
import { CrmError, crmAdmin } from "@/lib/crm-server";
import { SocialProvider, connectionCredential, encryptSecret, providerConfig, storeConnectedAccount } from "@/lib/social-integrations";

type TokenPayload = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string; user_id?: string };
type DiscoveredAccount = { externalAccountId: string; displayName: string; accountType?: string; username?: string; profileUrl?: string; accessToken: string; refreshToken?: string; expiresIn?: number };
type Connection = { id: string; brand_id: string; provider: SocialProvider; external_account_id: string; display_name: string; username?: string | null; coverage_started_at?: string | null };
type SocialPost = { providerPostId: string; conversationId?: string; authorId?: string; authorName?: string; authorUsername?: string; text?: string; contentType?: string; mediaType?: string; mediaUrls?: unknown[]; url?: string; publishedAt?: string; editedAt?: string; likes?: number; comments?: number; shares?: number; views?: number; raw: unknown };
type SocialComment = { providerCommentId: string; providerPostId: string; parentId?: string; rootId?: string; depth: number; authorId?: string; authorName?: string; authorUsername?: string; text?: string; url?: string; publishedAt?: string; editedAt?: string; likes?: number; replies?: number; hidden?: boolean; deleted?: boolean; raw: unknown };
type SyncPayload = { posts: SocialPost[]; comments: SocialComment[]; coverageStartedAt?: string; providerLimitNote?: string };
type SyncCursor = { sinceId?: string; lastItemAt?: string };

const asText = (value: unknown) => String(value || "").trim();
const asNumber = (value: unknown) => Number(value || 0);
const scopes = (payload: TokenPayload, fallback: string[]) => asText(payload.scope).split(/[ ,]+/).filter(Boolean).length ? asText(payload.scope).split(/[ ,]+/).filter(Boolean) : fallback;
const negative = /scam|fraud|refund|toxic|worst|bad|poor|issue|problem|crash|mislead|layoff|fired|complaint|cheat|fake|unpaid|delay|not working|disappoint/i;
const positive = /great|good|best|excellent|proud|success|congrat|inspiring|helpful|affordable|love/i;
const sentiment = (text: string) => negative.test(text) ? "negative" : positive.test(text) ? "positive" : "neutral";

async function jsonFetch(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { accept: "application/json", ...(init.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new CrmError(payload?.error_description || payload?.error?.message || payload?.detail || `Provider returned HTTP ${response.status}`, 502, "provider_api_error");
  return payload;
}

async function extendMetaToken(provider: "facebook" | "instagram", token: TokenPayload) {
  const config = providerConfig(provider);
  if (provider === "facebook") {
    const params = new URLSearchParams({ grant_type: "fb_exchange_token", client_id: config.clientId, client_secret: config.clientSecret, fb_exchange_token: token.access_token });
    return { ...token, ...(await jsonFetch(`https://graph.facebook.com/v23.0/oauth/access_token?${params}`)) } as TokenPayload;
  }
  const params = new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: config.clientSecret, access_token: token.access_token });
  return { ...token, ...(await jsonFetch(`https://graph.instagram.com/access_token?${params}`)) } as TokenPayload;
}

export async function discoverAndStoreAccounts(input: { provider: SocialProvider; token: TokenPayload; brandId: string; userId: string }) {
  let token = input.token;
  if (input.provider === "facebook" || input.provider === "instagram") token = await extendMetaToken(input.provider, token).catch(() => token);
  const config = providerConfig(input.provider);
  let accounts: DiscoveredAccount[] = [];

  if (input.provider === "x") {
    const me = await jsonFetch("https://api.x.com/2/users/me?user.fields=name,username,profile_image_url,verified", { headers: { Authorization: `Bearer ${token.access_token}` } });
    const user = me.data || {};
    accounts = [{ externalAccountId: asText(user.id), displayName: asText(user.name || user.username), username: asText(user.username), profileUrl: user.username ? `https://x.com/${user.username}` : undefined, accountType: "official", accessToken: token.access_token, refreshToken: token.refresh_token, expiresIn: token.expires_in }];
  } else if (input.provider === "facebook") {
    const pages = await jsonFetch(`https://graph.facebook.com/v23.0/me/accounts?fields=id,name,access_token,tasks,picture&limit=100&access_token=${encodeURIComponent(token.access_token)}`);
    accounts = (pages.data || []).map((page: any) => ({ externalAccountId: asText(page.id), displayName: asText(page.name), accountType: "page", profileUrl: `https://facebook.com/${page.id}`, accessToken: asText(page.access_token || token.access_token), expiresIn: token.expires_in }));
  } else if (input.provider === "instagram") {
    const me = await jsonFetch(`https://graph.instagram.com/me?fields=id,user_id,username,name,account_type,profile_picture_url&access_token=${encodeURIComponent(token.access_token)}`);
    accounts = [{ externalAccountId: asText(me.id || token.user_id), displayName: asText(me.name || me.username), username: asText(me.username), profileUrl: me.username ? `https://instagram.com/${me.username}` : undefined, accountType: asText(me.account_type || "professional"), accessToken: token.access_token, expiresIn: token.expires_in }];
  } else {
    const version = process.env.LINKEDIN_API_VERSION || "202607";
    const headers = { Authorization: `Bearer ${token.access_token}`, "LinkedIn-Version": version, "X-Restli-Protocol-Version": "2.0.0" };
    const acl = await jsonFetch("https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100", { headers });
    const ids = (acl.elements || []).map((item: any) => asText(item.organization || item.organizationTarget)).map((urn: string) => urn.split(":").at(-1)).filter(Boolean);
    for (const id of ids) {
      const organization = await jsonFetch(`https://api.linkedin.com/rest/organizations/${id}`, { headers });
      accounts.push({ externalAccountId: asText(id), displayName: asText(organization.localizedName || organization.vanityName || `LinkedIn organization ${id}`), username: asText(organization.vanityName), profileUrl: organization.vanityName ? `https://linkedin.com/company/${organization.vanityName}` : undefined, accountType: "organization", accessToken: token.access_token, refreshToken: token.refresh_token, expiresIn: token.expires_in });
    }
  }

  if (!accounts.length || accounts.some((account) => !account.externalAccountId)) throw new CrmError(`No manageable ${input.provider} account was returned`, 409, "no_managed_accounts");
  const ids: string[] = [];
  for (const account of accounts) ids.push(await storeConnectedAccount({ brandId: input.brandId, userId: input.userId, provider: input.provider, externalAccountId: account.externalAccountId, displayName: account.displayName, accountType: account.accountType, username: account.username, profileUrl: account.profileUrl, scopes: scopes(token, config.scopes), accessToken: account.accessToken, refreshToken: account.refreshToken, expiresIn: account.expiresIn }));
  return ids;
}

async function refreshXCredential(connectionId: string, refreshToken: string) {
  const config = providerConfig("x");
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: config.clientId });
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  if (config.clientSecret) headers.authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
  const payload = await jsonFetch(config.tokenUrl, { method: "POST", headers, body }) as TokenPayload;
  const admin = crmAdmin();
  await admin.from("social_connection_credentials").update({ access_token_ciphertext: encryptSecret(payload.access_token), refresh_token_ciphertext: encryptSecret(payload.refresh_token || refreshToken), token_expires_at: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000).toISOString() : null, updated_at: new Date().toISOString() }).eq("connection_id", connectionId);
  return payload.access_token;
}

async function usableToken(connection: Connection) {
  const credential = await connectionCredential(connection.id);
  if (connection.provider === "x" && credential.refreshToken && credential.expiresAt && new Date(credential.expiresAt).getTime() < Date.now() + 60_000) return refreshXCredential(connection.id, credential.refreshToken);
  return credential.accessToken;
}

async function xSync(connection: Connection, token: string, cursor: SyncCursor): Promise<SyncPayload> {
  const posts: SocialPost[] = []; let nextToken = "";
  do {
    const params = new URLSearchParams({ max_results: "100", "tweet.fields": "created_at,conversation_id,public_metrics,attachments,author_id" });
    if (cursor.sinceId) params.set("since_id", cursor.sinceId);
    if (nextToken) params.set("pagination_token", nextToken);
    const page = await jsonFetch(`https://api.x.com/2/users/${connection.external_account_id}/tweets?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    for (const item of page.data || []) { const m = item.public_metrics || {}; posts.push({ providerPostId: asText(item.id), conversationId: asText(item.conversation_id || item.id), authorId: asText(item.author_id || connection.external_account_id), authorName: connection.display_name, authorUsername: connection.username || undefined, text: asText(item.text), contentType: "post", url: `https://x.com/${connection.username || "i"}/status/${item.id}`, publishedAt: item.created_at, likes: asNumber(m.like_count), comments: asNumber(m.reply_count), shares: asNumber(m.retweet_count), views: asNumber(m.impression_count), raw: item }); }
    nextToken = asText(page.meta?.next_token);
  } while (nextToken && posts.length < 3200);
  const comments: SocialComment[] = [];
  for (const post of posts.slice(0, 100)) {
    const params = new URLSearchParams({ query: `conversation_id:${post.conversationId} -from:${connection.username || ""}`.replace(/ -from:$/, ""), max_results: "100", "tweet.fields": "created_at,conversation_id,public_metrics,author_id,in_reply_to_user_id,referenced_tweets" });
    try {
      const page = await jsonFetch(`https://api.x.com/2/tweets/search/recent?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      for (const item of page.data || []) { const m = item.public_metrics || {}; const replyParent = (item.referenced_tweets || []).find((entry: any) => entry.type === "replied_to")?.id; comments.push({ providerCommentId: asText(item.id), providerPostId: post.providerPostId, parentId: asText(replyParent || post.providerPostId), rootId: post.providerPostId, depth: replyParent && replyParent !== post.providerPostId ? 2 : 1, authorId: asText(item.author_id), text: asText(item.text), url: `https://x.com/i/status/${item.id}`, publishedAt: item.created_at, likes: asNumber(m.like_count), replies: asNumber(m.reply_count), raw: item }); }
    } catch { /* Recent-search availability depends on the active X plan. */ }
  }
  return { posts, comments, coverageStartedAt: posts.map((item) => item.publishedAt).filter(Boolean).sort()[0], providerLimitNote: "Authored timeline is limited by X to the available recent timeline; reply history depends on the active search plan." };
}

async function linkedInSync(connection: Connection, token: string): Promise<SyncPayload> {
  const version = process.env.LINKEDIN_API_VERSION || "202607";
  const headers = { Authorization: `Bearer ${token}`, "LinkedIn-Version": version, "X-Restli-Protocol-Version": "2.0.0" };
  const author = `urn:li:organization:${connection.external_account_id}`; const posts: SocialPost[] = []; let start = 0;
  while (start < 1000) {
    const page = await jsonFetch(`https://api.linkedin.com/rest/posts?q=author&author=${encodeURIComponent(author)}&count=100&start=${start}&sortBy=LAST_MODIFIED`, { headers });
    for (const item of page.elements || []) { const id = asText(item.id); posts.push({ providerPostId: id, conversationId: id, authorId: author, authorName: connection.display_name, text: asText(item.commentary), contentType: "post", mediaType: asText(item.content?.media?.title ? "media" : "text"), url: id ? `https://www.linkedin.com/feed/update/${encodeURIComponent(id)}` : undefined, publishedAt: item.publishedAt ? new Date(Number(item.publishedAt)).toISOString() : undefined, editedAt: item.lastModifiedAt ? new Date(Number(item.lastModifiedAt)).toISOString() : undefined, raw: item }); }
    if (!(page.elements || []).length || (page.elements || []).length < 100) break; start += 100;
  }
  const comments: SocialComment[] = [];
  for (const post of posts) {
    let start = 0;
    while (start < 1000) {
      const page = await jsonFetch(`https://api.linkedin.com/rest/socialActions/${encodeURIComponent(post.providerPostId)}/comments?count=100&start=${start}`, { headers }).catch(() => ({ elements: [] }));
      for (const item of page.elements || []) { const id = asText(item.id || item.$URN); comments.push({ providerCommentId: id, providerPostId: post.providerPostId, parentId: asText(item.parentComment), rootId: asText(item.parentComment || id), depth: item.parentComment ? 1 : 0, authorId: asText(item.actor), text: asText(item.message?.text), publishedAt: item.created?.time ? new Date(Number(item.created.time)).toISOString() : undefined, editedAt: item.lastModified?.time ? new Date(Number(item.lastModified.time)).toISOString() : undefined, likes: asNumber(item.likesSummary?.totalLikes), raw: item }); }
      if (!(page.elements || []).length || (page.elements || []).length < 100) break; start += 100;
    }
  }
  return { posts, comments, coverageStartedAt: posts.map((item) => item.publishedAt).filter(Boolean).sort()[0], providerLimitNote: "Coverage follows the LinkedIn Community Management API tier and organization permissions." };
}

async function graphPages(url: string, allowedHosts: string[]) {
  const rows: any[] = []; let next = url;
  while (next && rows.length < 10_000) {
    const parsed = new URL(next); if (!allowedHosts.includes(parsed.hostname)) throw new CrmError("Provider pagination URL was rejected", 502, "unsafe_provider_pagination");
    const page = await jsonFetch(next); rows.push(...(page.data || [])); next = asText(page.paging?.next);
  }
  return rows;
}

async function facebookSync(connection: Connection, token: string, cursor: SyncCursor): Promise<SyncPayload> {
  // Insights requires a separate reviewable permission. Core ingestion must remain
  // available when only Page post/comment read permissions have been granted.
  const fields = "id,message,story,created_time,updated_time,permalink_url,shares,attachments";
  const since = cursor.lastItemAt ? `&since=${Math.floor(new Date(cursor.lastItemAt).getTime() / 1000)}` : "";
  const items = await graphPages(`https://graph.facebook.com/v23.0/${connection.external_account_id}/feed?fields=${encodeURIComponent(fields)}&limit=100${since}&access_token=${encodeURIComponent(token)}`, ["graph.facebook.com"]);
  const posts: SocialPost[] = items.map((item: any) => ({ providerPostId: asText(item.id), conversationId: asText(item.id), authorId: connection.external_account_id, authorName: connection.display_name, text: asText(item.message || item.story), contentType: "post", mediaType: asText(item.attachments?.data?.[0]?.type), mediaUrls: (item.attachments?.data || []).map((entry: any) => entry.url || entry.media?.image?.src).filter(Boolean), url: asText(item.permalink_url), publishedAt: item.created_time, editedAt: item.updated_time, shares: asNumber(item.shares?.count), raw: item }));
  const comments: SocialComment[] = [];
  for (const post of posts) {
    const top = await graphPages(`https://graph.facebook.com/v23.0/${encodeURIComponent(post.providerPostId)}/comments?fields=id,message,created_time,from,like_count,comment_count,parent,permalink_url&filter=stream&limit=100&access_token=${encodeURIComponent(token)}`, ["graph.facebook.com"]);
    for (const item of top) {
      const root = asText(item.parent?.id || item.id); comments.push({ providerCommentId: asText(item.id), providerPostId: post.providerPostId, parentId: asText(item.parent?.id), rootId: root, depth: item.parent ? 1 : 0, authorId: asText(item.from?.id), authorName: asText(item.from?.name), text: asText(item.message), url: asText(item.permalink_url), publishedAt: item.created_time, likes: asNumber(item.like_count), replies: asNumber(item.comment_count), raw: item });
      if (asNumber(item.comment_count)) {
        const replies = await graphPages(`https://graph.facebook.com/v23.0/${item.id}/comments?fields=id,message,created_time,from,like_count,comment_count,parent,permalink_url&limit=100&access_token=${encodeURIComponent(token)}`, ["graph.facebook.com"]);
        for (const reply of replies) comments.push({ providerCommentId: asText(reply.id), providerPostId: post.providerPostId, parentId: asText(reply.parent?.id || item.id), rootId: root, depth: 1, authorId: asText(reply.from?.id), authorName: asText(reply.from?.name), text: asText(reply.message), url: asText(reply.permalink_url), publishedAt: reply.created_time, likes: asNumber(reply.like_count), replies: asNumber(reply.comment_count), raw: reply });
      }
    }
  }
  return { posts, comments, coverageStartedAt: posts.map((item) => item.publishedAt).filter(Boolean).sort()[0], providerLimitNote: "Facebook coverage follows Page permissions, retention, and Graph API availability." };
}

async function instagramSync(connection: Connection, token: string): Promise<SyncPayload> {
  const media = await graphPages(`https://graph.instagram.com/${connection.external_account_id}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=100&access_token=${encodeURIComponent(token)}`, ["graph.instagram.com"]);
  const posts: SocialPost[] = media.map((item: any) => ({ providerPostId: asText(item.id), conversationId: asText(item.id), authorId: connection.external_account_id, authorName: connection.display_name, authorUsername: connection.username || undefined, text: asText(item.caption), contentType: "post", mediaType: asText(item.media_type), mediaUrls: [item.media_url, item.thumbnail_url].filter(Boolean), url: asText(item.permalink), publishedAt: item.timestamp, likes: asNumber(item.like_count), comments: asNumber(item.comments_count), raw: item }));
  const comments: SocialComment[] = [];
  for (const post of posts) {
    const top = await graphPages(`https://graph.instagram.com/${post.providerPostId}/comments?fields=id,text,timestamp,username,like_count,parent_id,replies{id,text,timestamp,username,like_count,parent_id}&limit=100&access_token=${encodeURIComponent(token)}`, ["graph.instagram.com"]);
    for (const item of top) {
      const root = asText(item.parent_id || item.id); comments.push({ providerCommentId: asText(item.id), providerPostId: post.providerPostId, parentId: asText(item.parent_id), rootId: root, depth: item.parent_id ? 1 : 0, authorUsername: asText(item.username), authorName: asText(item.username), text: asText(item.text), publishedAt: item.timestamp, likes: asNumber(item.like_count), replies: (item.replies?.data || []).length, raw: item });
      for (const reply of item.replies?.data || []) comments.push({ providerCommentId: asText(reply.id), providerPostId: post.providerPostId, parentId: asText(reply.parent_id || item.id), rootId: root, depth: 1, authorUsername: asText(reply.username), authorName: asText(reply.username), text: asText(reply.text), publishedAt: reply.timestamp, likes: asNumber(reply.like_count), raw: reply });
    }
  }
  return { posts, comments, coverageStartedAt: posts.map((item) => item.publishedAt).filter(Boolean).sort()[0], providerLimitNote: "Instagram coverage is limited to media and comments available to the connected Professional account." };
}

async function normalizeMentions(connection: Connection, posts: SocialPost[], comments: SocialComment[]) {
  const admin = crmAdmin();
  const rows = [
    ...posts.map((item) => ({ brand_id: connection.brand_id, platform: connection.provider, platform_ref_id: `${connection.provider}:post:${item.providerPostId}`, content_text: item.text || "", content_type: "post", author_handle: item.authorUsername || null, author_name: item.authorName || null, likes: item.likes || 0, shares: item.shares || 0, comments_count: item.comments || 0, sentiment_label: sentiment(item.text || ""), source_url: item.url || null, published_at: item.publishedAt || null, scraped_at: new Date().toISOString(), source_type: "owned", social_connection_id: connection.id, raw_data: item.raw })),
    ...comments.map((item) => ({ brand_id: connection.brand_id, platform: connection.provider, platform_ref_id: `${connection.provider}:comment:${item.providerCommentId}`, content_text: item.text || "", content_type: "comment", author_handle: item.authorUsername || null, author_name: item.authorName || null, likes: item.likes || 0, shares: 0, comments_count: item.replies || 0, sentiment_label: sentiment(item.text || ""), source_url: item.url || null, published_at: item.publishedAt || null, scraped_at: new Date().toISOString(), source_type: "owned", social_connection_id: connection.id, raw_data: { ...((item.raw && typeof item.raw === "object") ? item.raw as object : {}), parent_comment_id: item.parentId, root_comment_id: item.rootId, thread_depth: item.depth } })),
  ].filter((item) => item.content_text);
  for (let index = 0; index < rows.length; index += 100) {
    const batch = rows.slice(index, index + 100); const refs = batch.map((item) => item.platform_ref_id);
    const existing = await admin.from("mentions").select("id,platform_ref_id").eq("brand_id", connection.brand_id).eq("platform", connection.provider).eq("source_type", "owned").in("platform_ref_id", refs);
    const ids = new Map((existing.data || []).map((item: any) => [item.platform_ref_id, item.id]));
    const inserts = batch.filter((item) => !ids.has(item.platform_ref_id));
    if (inserts.length) await admin.from("mentions").insert(inserts);
    for (const item of batch.filter((row) => ids.has(row.platform_ref_id))) await admin.from("mentions").update(item).eq("id", ids.get(item.platform_ref_id));
  }
}

async function persistSync(connection: Connection, payload: SyncPayload) {
  const admin = crmAdmin(); const postRows = payload.posts.map((item) => ({ brand_id: connection.brand_id, connection_id: connection.id, provider: connection.provider, provider_post_id: item.providerPostId, provider_conversation_id: item.conversationId || null, author_id: item.authorId || null, author_name: item.authorName || null, author_username: item.authorUsername || null, content_text: item.text || null, content_type: item.contentType || "post", media_type: item.mediaType || null, media_urls: item.mediaUrls || [], source_url: item.url || null, published_at: item.publishedAt || null, edited_at: item.editedAt || null, likes_count: item.likes || 0, comments_count: item.comments || 0, shares_count: item.shares || 0, views_count: item.views || 0, raw_data: item.raw, last_seen_at: new Date().toISOString() }));
  for (let index = 0; index < postRows.length; index += 200) { const result = await admin.from("owned_social_posts").upsert(postRows.slice(index, index + 200), { onConflict: "connection_id,provider_post_id" }); if (result.error) throw new CrmError(result.error.message, 500, "post_upsert_failed"); }
  const postIds = await admin.from("owned_social_posts").select("id,provider_post_id").eq("connection_id", connection.id); if (postIds.error) throw new CrmError(postIds.error.message, 500, "post_lookup_failed");
  const map = new Map((postIds.data || []).map((item: any) => [item.provider_post_id, item.id]));
  const commentRows = payload.comments.filter((item) => map.has(item.providerPostId)).map((item) => ({ brand_id: connection.brand_id, connection_id: connection.id, post_id: map.get(item.providerPostId), provider: connection.provider, provider_comment_id: item.providerCommentId, provider_parent_comment_id: item.parentId || null, provider_root_comment_id: item.rootId || item.providerCommentId, thread_depth: item.depth, author_id: item.authorId || null, author_name: item.authorName || null, author_username: item.authorUsername || null, content_text: item.text || null, source_url: item.url || null, published_at: item.publishedAt || null, edited_at: item.editedAt || null, likes_count: item.likes || 0, replies_count: item.replies || 0, is_hidden: item.hidden ?? null, is_deleted: item.deleted || false, raw_data: item.raw, last_seen_at: new Date().toISOString() }));
  for (let index = 0; index < commentRows.length; index += 200) { const result = await admin.from("owned_social_comments").upsert(commentRows.slice(index, index + 200), { onConflict: "connection_id,provider_comment_id" }); if (result.error) throw new CrmError(result.error.message, 500, "comment_upsert_failed"); }
  await normalizeMentions(connection, payload.posts, payload.comments);
}

export async function syncConnection(connectionId: string, triggerType: "oauth" | "manual" | "scheduled" | "webhook" = "manual") {
  const admin = crmAdmin(); const lookup = await admin.from("social_connections").select("*").eq("id", connectionId).single();
  if (lookup.error || !lookup.data) throw new CrmError("Social connection was not found", 404, "connection_not_found");
  const connection = lookup.data as Connection; const run = await admin.from("social_sync_runs").insert({ brand_id: connection.brand_id, connection_id: connection.id, trigger_type: triggerType, status: "running" }).select("id").single();
  if (run.error || !run.data) throw new CrmError(run.error?.message || "Sync run could not be created", 500, "sync_run_failed");
  await admin.from("social_connections").update({ status: "syncing", last_error: null, updated_at: new Date().toISOString() }).eq("id", connection.id);
  try {
    const token = await usableToken(connection);
    const cursorResult = await admin.from("social_sync_cursors").select("since_id,last_item_at").eq("connection_id", connection.id).eq("resource", "posts").maybeSingle();
    const cursor: SyncCursor = { sinceId: cursorResult.data?.since_id || undefined, lastItemAt: cursorResult.data?.last_item_at || undefined };
    const payload = connection.provider === "x" ? await xSync(connection, token, cursor) : connection.provider === "linkedin" ? await linkedInSync(connection, token) : connection.provider === "facebook" ? await facebookSync(connection, token, cursor) : await instagramSync(connection, token);
    await persistSync(connection, payload);
    const now = new Date().toISOString();
    const published = payload.posts.map((item) => item.publishedAt).filter((value): value is string => Boolean(value)).sort();
    const newestPost = [...payload.posts].sort((a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")))[0];
    await admin.from("social_sync_cursors").upsert({
      brand_id: connection.brand_id,
      connection_id: connection.id,
      resource: "posts",
      since_id: newestPost?.providerPostId || cursor.sinceId || null,
      last_item_at: published.at(-1) || cursor.lastItemAt || null,
      cursor_value: null,
      updated_at: now,
    }, { onConflict: "connection_id,resource" });
    const historicalCoverage = [connection.coverage_started_at, payload.coverageStartedAt].filter((value): value is string => Boolean(value)).sort()[0] || null;
    await admin.from("social_connections").update({ status: "connected", coverage_started_at: historicalCoverage, last_synced_at: now, last_error: null, updated_at: now }).eq("id", connection.id);
    await admin.from("social_sync_runs").update({ status: "succeeded", posts_imported: payload.posts.length, comments_imported: payload.comments.length, coverage_started_at: payload.coverageStartedAt || null, provider_limit_note: payload.providerLimitNote || null, finished_at: now }).eq("id", run.data.id);
    return { connectionId, postsImported: payload.posts.length, commentsImported: payload.comments.length, coverageStartedAt: payload.coverageStartedAt, providerLimitNote: payload.providerLimitNote };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider sync failed"; const now = new Date().toISOString();
    await admin.from("social_connections").update({ status: "action_required", last_error: message.slice(0, 1000), updated_at: now }).eq("id", connection.id);
    await admin.from("social_sync_runs").update({ status: "failed", error_summary: message.slice(0, 1000), finished_at: now }).eq("id", run.data.id);
    throw error;
  }
}

export async function revokeProviderAuthorization(connectionId: string) {
  const admin = crmAdmin();
  const lookup = await admin.from("social_connections").select("id,provider,external_account_id").eq("id", connectionId).single();
  if (lookup.error || !lookup.data) throw new CrmError("Social connection was not found", 404, "connection_not_found");
  const connection = lookup.data as Connection;
  const token = (await connectionCredential(connection.id)).accessToken;
  const config = providerConfig(connection.provider);
  let url = ""; let init: RequestInit = { method: "POST" };
  if (connection.provider === "x") {
    const body = new URLSearchParams({ token, token_type_hint: "access_token", client_id: config.clientId });
    const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
    if (config.clientSecret) headers.authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
    url = "https://api.x.com/2/oauth2/revoke"; init = { method: "POST", headers, body };
  } else if (connection.provider === "linkedin") {
    url = "https://www.linkedin.com/oauth/v2/revoke";
    init = { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token, client_id: config.clientId, client_secret: config.clientSecret }) };
  } else if (connection.provider === "facebook") {
    url = `https://graph.facebook.com/v23.0/me/permissions?access_token=${encodeURIComponent(token)}`; init = { method: "DELETE" };
  } else {
    url = `https://graph.instagram.com/me/permissions?access_token=${encodeURIComponent(token)}`; init = { method: "DELETE" };
  }
  const response = await fetch(url, { ...init, cache: "no-store", headers: { accept: "application/json", ...(init.headers || {}) } });
  return response.ok;
}

export async function webhookHash(raw: string) { return createHash("sha256").update(raw).digest("hex"); }
