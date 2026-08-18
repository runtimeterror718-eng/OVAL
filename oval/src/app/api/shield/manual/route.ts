import { NextResponse } from "next/server";
import {
  requireShieldContext,
  shieldErrorResponse,
  submitCandidate,
} from "@/lib/shield-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const context = await requireShieldContext("submit");
    const body = await request.json();
    if (!body.url)
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    const result = await submitCandidate(
      {
        url: body.url,
        suspectedThreatType: body.suspectedThreatType,
        description: body.description,
        discoverySource: "manual",
        relatedAssetId: body.relatedAssetId,
        urgency: body.urgency,
        reporterId: context.member.id,
      },
      context,
    );
    return NextResponse.json(
      { live: true, ...result },
      { status: result.duplicate ? 200 : 202 },
    );
  } catch (error) {
    return shieldErrorResponse(error);
  }
}
