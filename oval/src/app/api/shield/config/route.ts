import { NextResponse } from "next/server";
import {
  audit,
  requireShieldContext,
  shieldErrorResponse,
} from "@/lib/shield-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { admin, member } = await requireShieldContext("read");
    const [assets, terms, domains, providers] = await Promise.all([
      admin
        .from("brand_assets")
        .select("*")
        .eq("brand_id", member.brand_id)
        .order("name"),
      admin
        .from("brand_terms")
        .select("*")
        .eq("brand_id", member.brand_id)
        .order("term"),
      admin
        .from("authorised_domains")
        .select("*")
        .eq("brand_id", member.brand_id)
        .order("domain"),
      admin
        .from("discovery_providers")
        .select(
          "id,provider_key,provider_type,display_name,mode,enabled,rate_limit_state,last_success_at,last_error_at,last_error_code",
        )
        .eq("brand_id", member.brand_id)
        .order("display_name"),
    ]);
    for (const result of [assets, terms, domains, providers])
      if (result.error) throw result.error;
    return NextResponse.json({
      assets: assets.data || [],
      terms: terms.data || [],
      authorisedDomains: domains.data || [],
      providers: providers.data || [],
    });
  } catch (error) {
    return shieldErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { admin, member } = await requireShieldContext("configure");
    const body = await request.json();
    let result: any;
    if (body.type === "asset") {
      const assetType = String(body.assetType || "");
      const canonicalValue = String(body.canonicalValue || "").trim();
      const name = String(body.name || "").trim();
      if (!assetType || !canonicalValue || !name)
        return NextResponse.json(
          { error: "Asset name, type, and canonical value are required" },
          { status: 400 },
        );
      result = await admin
        .from("brand_assets")
        .upsert(
          {
            brand_id: member.brand_id,
            id: body.id || undefined,
            asset_type: assetType,
            name,
            canonical_value: canonicalValue,
            metadata: body.metadata || {},
            active: body.active !== false,
            created_by: member.id,
          },
          { onConflict: "brand_id,asset_type,canonical_value" },
        )
        .select("*")
        .single();
      if (result.error) throw result.error;
      const fingerprints = Array.isArray(body.fingerprints)
        ? body.fingerprints
        : [];
      if (fingerprints.length) {
        const rows = fingerprints
          .filter((item: any) => item?.type && item?.value)
          .map((item: any) => ({
            brand_id: member.brand_id,
            asset_id: result.data.id,
            fingerprint_type: item.type,
            fingerprint: String(item.value),
            vector_reference: item.vectorReference || null,
            algorithm_version: item.algorithmVersion || "gati-fingerprint-v1",
            metadata: item.metadata || {},
            active: item.active !== false,
          }));
        if (rows.length) {
          const saved = await admin
            .from("gati_asset_fingerprints")
            .upsert(rows, {
              onConflict: "asset_id,fingerprint_type,fingerprint",
            });
          if (saved.error) throw saved.error;
        }
      }
    } else if (body.type === "term")
      result = await admin
        .from("brand_terms")
        .upsert(
          {
            brand_id: member.brand_id,
            id: body.id || undefined,
            term: body.term,
            normalised_term: String(body.term || "")
              .trim()
              .toLowerCase(),
            term_type: body.termType || "brand",
            requires_context: Boolean(body.requiresContext),
            context_terms: body.contextTerms || [],
            active: body.active !== false,
            created_by: member.id,
          },
          { onConflict: "brand_id,normalised_term,term_type" },
        )
        .select("*")
        .single();
    else if (body.type === "domain")
      result = await admin
        .from("authorised_domains")
        .upsert(
          {
            brand_id: member.brand_id,
            id: body.id || undefined,
            domain: String(body.domain || "")
              .trim()
              .toLowerCase(),
            allow_subdomains: body.allowSubdomains !== false,
            purpose: body.purpose || "",
            active: body.active !== false,
            verified_at: new Date().toISOString(),
            created_by: member.id,
          },
          { onConflict: "brand_id,domain" },
        )
        .select("*")
        .single();
    else if (body.type === "provider")
      result = await admin
        .from("discovery_providers")
        .update({ enabled: Boolean(body.enabled), mode: body.mode })
        .eq("id", body.id)
        .eq("brand_id", member.brand_id)
        .select("id,provider_key,mode,enabled")
        .single();
    else
      return NextResponse.json(
        { error: "Unsupported configuration type" },
        { status: 400 },
      );
    if (result.error) throw result.error;
    await audit(
      admin,
      member.brand_id,
      member.id,
      "shield_configuration",
      result.data.id,
      "updated",
      null,
      result.data,
    );
    return NextResponse.json({ item: result.data });
  } catch (error) {
    return shieldErrorResponse(error);
  }
}
