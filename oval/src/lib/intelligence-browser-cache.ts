const CACHE_NAME = "oval-intelligence-v1";
export const INTELLIGENCE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type CachedEnvelope<T> = {
  data: T;
  refreshedAt: number;
  refresh?: Promise<T>;
};

const inFlight = new Map<string, Promise<unknown>>();

async function fetchAndStore<T>(url: string): Promise<T> {
  const existing = inFlight.get(url) as Promise<T> | undefined;
  if (existing) return existing;

  const request = fetch(url, { cache: "no-store", credentials: "same-origin" })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Intelligence feed returned ${response.status}`);
      const data = await response.json() as T;
      if (typeof window !== "undefined" && "caches" in window) {
        try {
          const headers = new Headers({
            "content-type": "application/json; charset=utf-8",
            "x-oval-cached-at": String(Date.now()),
          });
          const cache = await window.caches.open(CACHE_NAME);
          await cache.put(url, new Response(JSON.stringify(data), { status: 200, headers }));
        } catch {
          // A full or disabled browser cache must never prevent rendering fresh data.
        }
      }
      return data;
    })
    .finally(() => inFlight.delete(url));

  inFlight.set(url, request);
  return request;
}

export async function loadIntelligenceJson<T>(url: string): Promise<CachedEnvelope<T>> {
  if (typeof window === "undefined" || !("caches" in window)) {
    return { data: await fetchAndStore<T>(url), refreshedAt: Date.now() };
  }

  let cache: Cache;
  try {
    cache = await window.caches.open(CACHE_NAME);
  } catch {
    return { data: await fetchAndStore<T>(url), refreshedAt: Date.now() };
  }
  const cached = await cache.match(url);
  if (!cached) return { data: await fetchAndStore<T>(url), refreshedAt: Date.now() };

  try {
    const data = await cached.json() as T;
    const refreshedAt = Number(cached.headers.get("x-oval-cached-at") || 0);
    if (refreshedAt && Date.now() - refreshedAt < INTELLIGENCE_CACHE_TTL_MS) {
      return { data, refreshedAt };
    }
    return {
      data,
      refreshedAt,
      refresh: fetchAndStore<T>(url),
    };
  } catch {
    await cache.delete(url);
    return { data: await fetchAndStore<T>(url), refreshedAt: Date.now() };
  }
}
