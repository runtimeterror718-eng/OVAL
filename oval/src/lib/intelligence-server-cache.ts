import "server-only";

export const INTELLIGENCE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type ResponseSnapshot = {
  body: ArrayBuffer;
  headers: [string, string][];
  status: number;
  statusText: string;
  expiresAt: number;
};

type CacheState = {
  entries: Map<string, ResponseSnapshot>;
  pending: Map<string, Promise<ResponseSnapshot>>;
};

const globalCache = globalThis as typeof globalThis & { __ovalIntelligenceCache?: CacheState };
const state = globalCache.__ovalIntelligenceCache ||= {
  entries: new Map(),
  pending: new Map(),
};

function responseFrom(snapshot: ResponseSnapshot, status: "HIT" | "MISS" | "STALE") {
  const headers = new Headers(snapshot.headers);
  headers.set("x-oval-cache", status);
  headers.set("cache-control", "private, no-cache");
  return new Response(snapshot.body.slice(0), {
    status: snapshot.status,
    statusText: snapshot.statusText,
    headers,
  });
}

async function snapshot(loader: () => Promise<Response>) {
  const response = await loader();
  return {
    body: await response.arrayBuffer(),
    headers: Array.from(response.headers.entries()),
    status: response.status,
    statusText: response.statusText,
    expiresAt: Date.now() + INTELLIGENCE_CACHE_TTL_MS,
  } satisfies ResponseSnapshot;
}

async function refresh(key: string, loader: () => Promise<Response>) {
  const running = state.pending.get(key);
  if (running) return running;
  const request = snapshot(loader)
    .then((result) => {
      if (result.status >= 200 && result.status < 300) state.entries.set(key, result);
      return result;
    })
    .finally(() => state.pending.delete(key));
  state.pending.set(key, request);
  return request;
}

export async function cachedIntelligenceResponse(key: string, loader: () => Promise<Response>) {
  const cached = state.entries.get(key);
  if (cached && cached.expiresAt > Date.now()) return responseFrom(cached, "HIT");

  if (cached) {
    void refresh(key, loader).catch(() => undefined);
    return responseFrom(cached, "STALE");
  }

  const loaded = await refresh(key, loader);
  return responseFrom(loaded, "MISS");
}
