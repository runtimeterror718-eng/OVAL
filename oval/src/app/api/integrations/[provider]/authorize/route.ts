import { NextResponse } from "next/server";
import { crmErrorResponse } from "@/lib/crm-server";
import { createAuthorization, isSocialProvider } from "@/lib/social-integrations";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { provider: string } }) {
  try {
    if (!isSocialProvider(params.provider)) return NextResponse.json({ error: "Unsupported provider" }, { status: 404 });
    const authorization = await createAuthorization(params.provider, request.url);
    return NextResponse.redirect(authorization.url);
  } catch (error) { return crmErrorResponse(error); }
}
