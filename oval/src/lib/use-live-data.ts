"use client";

import { useState, useEffect } from "react";

type UseLiveDataOptions = {
  refreshMs?: number;
  noStore?: boolean;
};

export function useLiveData<T>(apiPath: string, fallback: T, options: UseLiveDataOptions = {}): { data: T; isLive: boolean; loading: boolean } {
  const [data, setData] = useState<T>(fallback);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const { refreshMs = 0, noStore = false } = options;

  useEffect(() => {
    let cancelled = false;

    const load = async (isInitial = false) => {
      if (isInitial) setLoading(true);
      try {
        const response = await fetch(apiPath, noStore ? { cache: "no-store" } : undefined);
        const json = await response.json();
        if (!cancelled && json.live !== false && json) {
          setData(json);
          setIsLive(true);
        }
      } catch {
        // ignore transient fetch failures; keep last good snapshot visible
      } finally {
        if (!cancelled && isInitial) setLoading(false);
      }
    };

    load(true);
    const interval = refreshMs > 0 ? window.setInterval(() => load(false), refreshMs) : null;

    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
    };
  }, [apiPath, noStore, refreshMs]);

  return { data, isLive, loading };
}
