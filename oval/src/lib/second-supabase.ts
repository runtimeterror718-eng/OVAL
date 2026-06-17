import { createClient } from "@supabase/supabase-js";

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export function createSecondSupabaseClient() {
  const url = mustEnv("SECOND_PUBLIC_SUPABASE_URL");
  const key = mustEnv("SECOND_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
