import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

type CookieChange = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

export function createOAuthClient(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_KEY
    || process.env.SUPABASE_ANON_KEY
    || "";

  if (!url || !key) return null;

  const changes: CookieChange[] = [];
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        changes.push(...items);
      },
    },
  });

  return {
    client,
    applyCookies(response: NextResponse) {
      changes.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, {
          ...options,
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
        } as Parameters<typeof response.cookies.set>[2]);
      });
      return response;
    },
  };
}
