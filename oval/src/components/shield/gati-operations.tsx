"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Boxes,
  BrainCircuit,
  GitBranch,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";

type GatiPayload = {
  engine: {
    name: string;
    modelVersion: string;
    graphVersion: string;
    enforcementMode: string;
  };
  metrics: Record<string, number>;
};

const metricCards = [
  ["analysed", "Qualified signals", BrainCircuit],
  ["highPriority", "High-priority review", ShieldCheck],
  ["activeCampaigns", "Active campaigns", GitBranch],
  ["entities", "Graph entities", Boxes],
  ["relationships", "Entity relationships", Activity],
  ["artifacts", "Artifacts analysed", ScanSearch],
] as const;

export function GatiOperations() {
  const [payload, setPayload] = useState<GatiPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetch("/api/shield/gati", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Gati returned ${response.status}`);
        return response.json();
      })
      .then(setPayload)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Gati is unavailable"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);

  return (
    <section className="shield-section gati-operations" id="gati-operations">
      <header className="gati-operations-head">
        <div>
          <p className="ai-eyebrow">PROPRIETARY DETECTION & ENFORCEMENT</p>
          <h2>Inside Gati</h2>
          <p>
            Live brand-relevance and threat-evidence metrics for a focused,
            readable view of the detection engine.
          </p>
        </div>
        <button onClick={load} disabled={loading}>
          <RefreshCw size={15} className={loading ? "spin" : ""} />
          Refresh engine
        </button>
      </header>

      {error ? (
        <div className="gati-empty">
          <strong>Gati operations are unavailable</strong>
          <span>{error}</span>
        </div>
      ) : !payload ? (
        <div className="gati-empty">Loading Gati intelligence…</div>
      ) : (
        <div className="gati-metric-grid">
          {metricCards.map(([key, label, Icon]) => (
            <article key={key}>
              <span><Icon size={15} /> {label}</span>
              <strong>{payload.metrics[key] || 0}</strong>
              <small>Live from Gati operational storage</small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
