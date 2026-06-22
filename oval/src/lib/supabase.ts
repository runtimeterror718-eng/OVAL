import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY || "";

export const supabase = url && key ? createClient(url, key) : null;

export async function fetchFromSupabase<T>(
  table: string,
  query: (q: ReturnType<NonNullable<typeof supabase>["from"]>) => ReturnType<NonNullable<typeof supabase>["from"]>["select"],
): Promise<T[] | null> {
  if (!supabase) return null;
  try {
    const base = supabase.from(table);
    const { data, error } = await (query(base) as any);
    if (error) { console.error(`Supabase ${table}:`, error.message); return null; }
    return data as T[];
  } catch { return null; }
}
