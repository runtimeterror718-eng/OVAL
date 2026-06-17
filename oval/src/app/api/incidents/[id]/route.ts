import { NextResponse } from "next/server";
import { getIncidentById } from "@/lib/incident-intelligence";

export const dynamic = "force-static";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const incident = getIncidentById(params.id);
  if (!incident) return NextResponse.json({ live: false, error: "Incident not found" }, { status: 404 });
  return NextResponse.json({ live: true, incident });
}
