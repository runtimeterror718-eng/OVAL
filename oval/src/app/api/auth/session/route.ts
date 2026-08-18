import { NextRequest, NextResponse } from "next/server";
import { ACCESS_SESSION_COOKIE, verifyAccessSession } from "@/lib/access-session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await verifyAccessSession(
    request.cookies.get(ACCESS_SESSION_COOKIE)?.value,
  );
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 });

  const localPart = session.email.split("@")[0] || "PW";
  const displayName = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return NextResponse.json({
    authenticated: true,
    email: session.email,
    displayName: displayName || "PW member",
    initial: (displayName || localPart).charAt(0).toUpperCase(),
  });
}
