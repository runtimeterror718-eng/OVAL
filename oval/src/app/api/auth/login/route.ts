import { NextResponse } from "next/server";
import {
  ACCESS_SESSION_COOKIE,
  PW_EMAIL_PATTERN,
  accessSessionMaxAge,
  createAccessSession,
  passwordsMatch,
} from "@/lib/access-session";

export const dynamic = "force-dynamic";

const DEFAULT_NEXT = "/audience-intelligence/overview";

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const input = await readInput(request);
  const email = input.email.trim().toLowerCase();
  const next = safeNext(input.next);

  if (!PW_EMAIL_PATTERN.test(email)) {
    return loginFailure(requestUrl, next, "invalid_domain");
  }
  if (
    !process.env.OVAL_AUTH_SECRET ||
    !process.env.OVAL_ACCESS_PASSWORD
  ) {
    return loginFailure(requestUrl, next, "auth_not_configured");
  }
  if (!(await passwordsMatch(input.password))) {
    return loginFailure(requestUrl, next, "invalid_credentials");
  }

  const response = NextResponse.redirect(new URL(next, requestUrl.origin), {
    status: 303,
  });
  response.cookies.set(
    ACCESS_SESSION_COOKIE,
    await createAccessSession(email),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: accessSessionMaxAge(),
    },
  );
  return response;
}

async function readInput(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    return {
      email: String(body.email || ""),
      password: String(body.password || ""),
      next: String(body.next || ""),
    };
  }
  const body = await request.formData().catch(() => new FormData());
  return {
    email: String(body.get("email") || ""),
    password: String(body.get("password") || ""),
    next: String(body.get("next") || ""),
  };
}

function safeNext(value: string) {
  return value.startsWith("/") && !value.startsWith("//")
    ? value
    : DEFAULT_NEXT;
}

function loginFailure(requestUrl: URL, next: string, error: string) {
  const login = new URL("/login", requestUrl.origin);
  login.searchParams.set("next", next);
  login.searchParams.set("error", error);
  return NextResponse.redirect(login, { status: 303 });
}
