from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class OfficialSocialIntegrationStructureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.migration = (ROOT / "supabase/migrations/20260806131328_official_social_integrations.sql").read_text()
        cls.oauth = (ROOT / "oval/src/lib/social-integrations.ts").read_text()
        cls.providers = (ROOT / "oval/src/lib/social-providers.ts").read_text()

    def test_migration_has_brand_scoped_tables_and_rls(self):
        tables = (
            "social_connections", "social_connection_credentials", "owned_social_posts",
            "owned_social_comments", "social_sync_cursors", "social_sync_runs",
            "social_webhook_events",
        )
        for table in tables:
            self.assertIn(f"create table public.{table}", self.migration)
            self.assertIn(f"alter table public.{table} enable row level security", self.migration)

    def test_credentials_are_not_browser_readable(self):
        self.assertIn("revoke all on public.social_connection_credentials", self.migration)
        self.assertNotIn('create policy "members read social connection credentials"', self.migration)
        self.assertIn("aes-256-gcm", self.oauth)
        self.assertNotIn("NEXT_PUBLIC_SOCIAL", self.oauth)

    def test_oauth_state_keeps_pkce_verifier_in_http_only_cookie(self):
        self.assertIn("encodeOAuthState({ ...state, verifier: undefined })", self.oauth)
        self.assertIn("httpOnly: true", self.oauth)
        self.assertIn('params.set("code_challenge_method", "S256")', self.oauth)

    def test_threads_and_atomic_provider_upserts_are_preserved(self):
        for field in ("provider_parent_comment_id", "provider_root_comment_id", "thread_depth"):
            self.assertIn(field, self.migration)
            self.assertIn(field, self.providers)
        self.assertIn('onConflict: "connection_id,provider_post_id"', self.providers)
        self.assertIn('onConflict: "connection_id,provider_comment_id"', self.providers)
        self.assertIn('source_type: "owned"', self.providers)

    def test_all_four_providers_have_routes(self):
        for provider in ("linkedin", "x", "facebook", "instagram"):
            self.assertIn(provider, self.oauth)
        route_root = ROOT / "oval/src/app/api/integrations/[provider]"
        for action in ("authorize", "callback", "connections", "sync", "disconnect"):
            self.assertTrue((route_root / action / "route.ts").exists(), action)


if __name__ == "__main__":
    unittest.main()
