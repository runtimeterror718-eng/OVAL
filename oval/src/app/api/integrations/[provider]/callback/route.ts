import { NextResponse } from "next/server";
import { crmErrorResponse } from "@/lib/crm-server";
import { exchangeCode, isSocialProvider, providerConfig, validateCallback } from "@/lib/social-integrations";
import { discoverAndStoreAccounts } from "@/lib/social-providers";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { provider: string } }) {
  try {
    if (!isSocialProvider(params.provider)) return NextResponse.json({ error: "Unsupported provider" }, { status: 404 });
    const url = new URL(request.url); const providerError = url.searchParams.get("error");
    if (providerError) return NextResponse.redirect(new URL(`/integrations?provider=${params.provider}&error=${encodeURIComponent(url.searchParams.get("error_description") || providerError)}`, url.origin));
    const code = url.searchParams.get("code") || ""; const stateValue = url.searchParams.get("state") || "";
    if (!code) return NextResponse.json({ error: "Authorization code is missing" }, { status: 400 });
    const { state, context } = await validateCallback(params.provider, stateValue);
    const origin = String(process.env.OVAL_PUBLIC_URL || url.origin).replace(/\/$/, "");
    const token = await exchangeCode(params.provider, code, `${origin}/api/integrations/${params.provider}/callback`, state.verifier);
    const connectionIds = await discoverAndStoreAccounts({ provider: params.provider, token, brandId: context.member.brand_id, userId: context.user.id });
    providerConfig(params.provider);
    return NextResponse.redirect(new URL(`/integrations?connected=${params.provider}&accounts=${connectionIds.length}`, url.origin));
  } catch (error) {
    const response = crmErrorResponse(error); const url = new URL(request.url);
    const payload = await response.clone().json().catch(() => ({ error: "Connection failed" }));
    return NextResponse.redirect(new URL(`/integrations?provider=${params.provider}&error=${encodeURIComponent(payload.error || "Connection failed")}`, url.origin));
  }
}
