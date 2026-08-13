import { NextResponse } from "next/server";
import { SHIELD_REAL_CASES } from "@/data/shield-real-data";
import {
  requireShieldContext,
  shieldErrorResponse,
  submitCandidate,
} from "@/lib/shield-server";

export const dynamic = "force-dynamic";

/** Queue the curated public-web snapshot through the real capture pipeline.
 * This is deliberately administrator-only and idempotent: canonical URL
 * hashes deduplicate existing candidates and active crawl jobs.
 */
export async function POST() {
  try {
    const context = await requireShieldContext("configure");
    const summary = { queued: 0, duplicates: 0, failed: 0, failures: [] as string[] };
    for (const item of SHIELD_REAL_CASES) {
      if (!item.sourceUrl.startsWith("http")) continue;
      try {
        const result = await submitCandidate(
          {
            url: item.sourceUrl,
            suspectedThreatType: item.category,
            description: `${item.description}\nSnapshot provenance: ${item.dataOrigin}`,
            discoverySource: "snapshot_seed",
            urgency:
              item.severity === "Critical"
                ? "urgent"
                : item.severity === "High"
                  ? "high"
                  : "normal",
            reporterId: context.member.id,
          },
          context,
        );
        if (result.duplicate) summary.duplicates += 1;
        else summary.queued += 1;
      } catch (error) {
        summary.failed += 1;
        summary.failures.push(
          `${item.id}:${error instanceof Error ? error.name : "unknown_error"}`,
        );
      }
    }
    return NextResponse.json({
      ...summary,
      warning:
        "Queued for public-only capture and human review. No complaint or takedown was submitted.",
    });
  } catch (error) {
    return shieldErrorResponse(error);
  }
}
