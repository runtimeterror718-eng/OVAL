import { NextResponse } from "next/server";
import { getIncidentDashboard } from "@/lib/incident-intelligence";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(getIncidentDashboard());
}
