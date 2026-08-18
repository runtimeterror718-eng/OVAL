import { SHIELD_PROTOTYPE_CASES } from "@/data/shield-demo-data";
import type { ShieldDataAdapter, ShieldThreatCase } from "@/lib/shield-types";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export const shieldPrototypeAdapter: ShieldDataAdapter = {
  sourceLabel: "Gati prototype source",
  mode: "prototype",
  async loadCases(): Promise<ShieldThreatCase[]> {
    await new Promise((resolve) => setTimeout(resolve, 260));
    return clone(SHIELD_PROTOTYPE_CASES);
  },
};

export const shieldLiveAdapter: ShieldDataAdapter = {
  sourceLabel: "Gati public-web threat scan",
  mode: "live",
  async loadCases(): Promise<ShieldThreatCase[]> {
    const response = await fetch("/api/shield", { cache: "no-store" });
    if (!response.ok)
      throw new Error(`Shield source returned ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload?.cases))
      throw new Error("Shield source returned an invalid payload");
    return payload.cases as ShieldThreatCase[];
  },
};

export interface ShieldEnforcementAdapter {
  configured: boolean;
  prepareOnly: true;
  submit(): never;
}

export const shieldEnforcementAdapter: ShieldEnforcementAdapter = {
  configured: false,
  prepareOnly: true,
  submit() {
    throw new Error(
      "External enforcement is not configured. Human approval and submission are required.",
    );
  },
};
