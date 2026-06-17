import { createHash } from "crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PW_EMAIL = /^[a-z0-9._%+-]+@pw\.live$/i;

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!PW_EMAIL.test(email)) {
    return NextResponse.json({ error: "Access is limited to @pw.live email IDs" }, { status: 401 });
  }
  if (!process.env.ACCESS_PASSWORD || password !== process.env.ACCESS_PASSWORD) {
    return NextResponse.json({ error: "Incorrect access password" }, { status: 401 });
  }

  console.log(`[auth] login ok: ${email} at ${new Date().toISOString()}`);

  const token = createHash("sha256").update(`oval-access:${process.env.ACCESS_PASSWORD}`).digest("hex");
  const response = NextResponse.json({ ok: true });
  response.cookies.set("oval_access", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  response.cookies.set("oval_user", email, {
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
