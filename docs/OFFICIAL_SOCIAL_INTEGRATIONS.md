# Official Social Integrations

OVAL connects official LinkedIn, X, Facebook, and Instagram accounts from the main **Integrations** tab. Connections use provider OAuth. Account passwords must never be entered into OVAL.

## Architecture

- `/integrations` displays connection health and sync history. Every authenticated member can view it; only active CRM `admin` and `manager` members can mutate connections.
- OAuth credentials are exchanged only in server routes and encrypted with AES-256-GCM before being stored in `social_connection_credentials`.
- Browser roles have no grants or RLS policies on credentials, sync cursors, or webhook payloads.
- Provider IDs are atomically upserted into `owned_social_posts` and `owned_social_comments`. `provider_parent_comment_id`, `provider_root_comment_id`, and `thread_depth` preserve threads.
- Owned records are normalized into `mentions` with `source_type = 'owned'`. The Qdrant sync reads those mentions, with a canonical-table fallback for Facebook and Instagram.
- A provider failure creates an isolated failed sync run and does not stop another provider.

## Required server configuration

Copy the official-social section from `oval/.env.local.example` into the server-only environment. Never prefix these variables with `NEXT_PUBLIC_`.

Generate independent keys:

```bash
openssl rand -base64 32 # SOCIAL_TOKEN_ENCRYPTION_KEY
openssl rand -base64 32 # SOCIAL_OAUTH_STATE_SECRET
openssl rand -base64 32 # SOCIAL_SYNC_TRIGGER_TOKEN
```

Set `OVAL_PUBLIC_URL` to the exact public HTTPS origin. Register these callback URLs in the provider consoles:

- `{OVAL_PUBLIC_URL}/api/integrations/linkedin/callback`
- `{OVAL_PUBLIC_URL}/api/integrations/x/callback`
- `{OVAL_PUBLIC_URL}/api/integrations/facebook/callback`
- `{OVAL_PUBLIC_URL}/api/integrations/instagram/callback`

For Meta webhooks, register `{OVAL_PUBLIC_URL}/api/integrations/meta/webhook` and use the same value as `META_WEBHOOK_VERIFY_TOKEN`.

## Provider access

- LinkedIn requires Community Management API approval. OVAL requests organization post, organization social-feed, and organization-admin discovery scopes. The application remains read-only even though LinkedIn's administrator-discovery permission is named `rw_organization_admin`.
- X uses OAuth 2.0 Authorization Code with PKCE. Authored history is limited to the provider timeline allowance; conversation replies depend on the configured search plan.
- Facebook requires a managed Page and Page read permissions. Core ingestion deliberately does not request optional post-insights fields, so missing analytics approval cannot break post and comment capture.
- Instagram requires a Professional Business or Creator account supported by the configured Instagram Login app.

Official references:

- LinkedIn Community Management: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview
- LinkedIn Posts API: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
- X timelines: https://docs.x.com/x-api/posts/timelines/introduction
- X recent search: https://docs.x.com/x-api/posts/search-recent-posts
- Meta Graph API: https://developers.facebook.com/docs/graph-api/
- Instagram Platform: https://developers.facebook.com/docs/instagram-platform/

## Database and scheduler

Apply `supabase/migrations/20260806131328_official_social_integrations.sql` with the normal Supabase migration workflow. Validate RLS, Data API grants, and security/performance advisors before production deployment.

Call the private scheduler endpoint every 15 minutes from the VPS:

```bash
curl --fail --silent --show-error \
  --request POST \
  --header "Authorization: Bearer $SOCIAL_SYNC_TRIGGER_TOKEN" \
  https://oval.run/api/integrations/scheduled
```

The endpoint prioritizes pending webhook events, processes up to four connections per invocation, and otherwise selects the least recently synchronized connections. Provider cursors are saved in `social_sync_cursors`; repeated content is safe because canonical provider IDs are unique.

After a successful content sync, run the existing Qdrant channel job for `linkedin`, `x`, `facebook`, and `instagram` so semantic clusters, summaries, and issue candidates use the new owned-channel evidence.

## Coverage semantics

`coverage_started_at` is the oldest content actually returned by the provider, not a promise of complete history. The UI retains provider warnings because deleted content, account permissions, product tiers, retention limits, and rate limits can all create incomplete coverage.

