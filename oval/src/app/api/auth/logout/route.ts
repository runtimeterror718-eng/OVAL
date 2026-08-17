import { NextResponse } from "next/server";
import {
  ACCESS_SESSION_COOKIE,
  resolvePublicOrigin,
} from "@/lib/access-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const response = NextResponse.redirect(
    new URL("/login", resolvePublicOrigin(request)),
    {
      status: 303,
    },
  );
  response.cookies.set(ACCESS_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
