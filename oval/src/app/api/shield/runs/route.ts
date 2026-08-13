import { NextResponse } from "next/server";
import {
  createDiscoveryRun,
  requireShieldContext,
  shieldErrorResponse,
} from "@/lib/shield-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { admin, member } = await requireShieldContext("read");
    const result = await admin
      .from("discovery_runs")
      .select("*")
      .eq("brand_id", member.brand_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (result.error) throw result.error;
    return NextResponse.json({ runs: result.data || [] });
  } catch (error) {
    return shieldErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireShieldContext("search");
    const result = await createDiscoveryRun(await request.json(), context);
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return shieldErrorResponse(error);
  }
}
