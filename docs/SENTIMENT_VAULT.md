# OVAL Sentiment Vault operations

## Required deployment steps

1. Apply `supabase/migrations/20260808092857_sentiment_vault.sql` through the normal Supabase migration workflow.
2. Set the server-only environment values documented in `oval/.env.local.example`:
   - `VAULT_ENABLED=true`
   - `VAULT_BRAND_ID`
   - `VAULT_SNAPSHOT_TRIGGER_TOKEN`
3. Restart the Next.js application after the migration and environment update.

The Spotify experience uses public, user-controlled track embeds. It does not need Spotify OAuth and must never autoplay or be synchronized to the evidence slideshow.

## Weekly archive schedule

Run the archive endpoint every Monday at 00:15 Asia/Kolkata. On a VPS configured to use Asia/Kolkata, the cron entry is:

```cron
15 0 * * 1 curl --fail --silent --show-error --request POST --header "Authorization: Bearer $VAULT_SNAPSHOT_TRIGGER_TOKEN" https://oval.run/api/vault/snapshots/run
```

The endpoint archives the preceding Monday–Sunday window. Its unique `(brand_id, channel, week_start)` key makes retries idempotent.

## Verification

- Open `/vault`, then each `/vault/{channel}` room.
- Confirm Spotify requires an explicit user click.
- Confirm the evidence story rotates independently every five seconds and pauses on hover or focus.
- Verify `/vault/library` is writable only for an active admin in `crm_members`.
- Run Supabase database and security advisors after applying the migration. New Vault tables should introduce no advisor findings.
