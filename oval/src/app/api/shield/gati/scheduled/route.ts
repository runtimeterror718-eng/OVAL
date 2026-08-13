import { NextResponse } from "next/server";
import {
  createDiscoveryRun,
  requirePrivateShieldContext,
  shieldErrorResponse,
} from "@/lib/shield-server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const context = await requirePrivateShieldContext(request);
    const body = await request.json().catch(() => ({}));
    const created = await createDiscoveryRun(
      {
        runType: "scheduled_search",
        threatType: body.threatType || "all",
        dateScope: body.dateScope || "30d",
        maxResults: Math.min(Math.max(Number(body.maxResults || 50), 1), 100),
        sources: body.sources || ["exa", "certificate_transparency", "oval_social"],
      },
      context,
    );
    const token = request.headers.get("x-shield-trigger-token") || "";
    const execution = await fetch(
      new URL(`/api/shield/runs/${created.run.id}`, request.url),
      {
        method: "POST",
        headers: { "x-shield-trigger-token": token },
        cache: "no-store",
      },
    );
    const result = await execution.json();
    return NextResponse.json(
      {
        scheduled: true,
        run: result.run || created.run,
        progress: result.progress || created.run.progress,
      },
      { status: execution.ok ? 200 : execution.status },
    );
  } catch (error) {
    return shieldErrorResponse(error);
  }
}
