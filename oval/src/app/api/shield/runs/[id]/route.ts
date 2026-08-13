import { NextResponse } from "next/server";
import { providerRegistry } from "@/lib/shield-providers";
import {
  requirePrivateShieldContext,
  requireShieldContext,
  shieldErrorResponse,
  submitCandidate,
} from "@/lib/shield-server";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const { admin, member } = await requireShieldContext("read");
    const run = await admin
      .from("discovery_runs")
      .select("*")
      .eq("id", params.id)
      .eq("brand_id", member.brand_id)
      .maybeSingle();
    if (run.error) throw run.error;
    if (!run.data)
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    const [queries, candidates] = await Promise.all([
      admin
        .from("discovery_queries")
        .select("*")
        .eq("run_id", params.id)
        .order("created_at"),
      admin
        .from("discovery_events")
        .select("candidate_id")
        .eq("run_id", params.id),
    ]);
    if (queries.error || candidates.error)
      throw queries.error || candidates.error;
    return NextResponse.json({
      run: run.data,
      queries: queries.data || [],
      candidateIds: Array.from(
        new Set((candidates.data || []).map((item: any) => item.candidate_id)),
      ),
    });
  } catch (error) {
    return shieldErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const context = request.headers.get("x-shield-trigger-token")
      ? await requirePrivateShieldContext(request)
      : await requireShieldContext("search");
    const { admin, member } = context;
    const runResult = await admin
      .from("discovery_runs")
      .select("*")
      .eq("id", params.id)
      .eq("brand_id", member.brand_id)
      .maybeSingle();
    if (runResult.error) throw runResult.error;
    if (!runResult.data)
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    if (!["queued", "partial", "failed"].includes(runResult.data.status))
      return NextResponse.json(
        { error: "Run cannot be processed in its current state" },
        { status: 409 },
      );
    const queriesResult = await admin
      .from("discovery_queries")
      .select("*,provider:discovery_providers(*)")
      .eq("run_id", params.id)
      .in("status", ["queued", "failed", "rate_limited"])
      .order("created_at");
    if (queriesResult.error) throw queriesResult.error;
    await admin
      .from("discovery_runs")
      .update({
        status: "running",
        started_at: runResult.data.started_at || new Date().toISOString(),
      })
      .eq("id", params.id);
    const counters = {
      discovered: 0,
      deduplicated: 0,
      scanned: 0,
      flagged: 0,
      failedQueries: 0,
    };
    const providerStatus: Record<string, unknown> = {};
    const startPublishedDate = periodStart(runResult.data.request?.dateScope);
    for (const queryRow of queriesResult.data || []) {
      const key = queryRow.provider?.provider_key;
      const provider = providerRegistry[key];
      if (key === "oval_social" && queryRow.provider?.enabled) {
        const started = Date.now();
        await admin
          .from("discovery_queries")
          .update({ status: "running" })
          .eq("id", queryRow.id);
        try {
          const sourceRows = await admin
            .from("mentions")
            .select(
              "source_url,content_text,platform,published_at,sentiment_label,engagement_score,author_handle",
            )
            .eq("brand_id", member.brand_id)
            .not("source_url", "is", null)
            .or("sentiment_label.eq.negative,sentiment_label.eq.neutral")
            .gte("published_at", startPublishedDate)
            .order("published_at", { ascending: false })
            .limit(queryRow.requested_limit);
          if (sourceRows.error) throw sourceRows.error;
          let count = 0;
          for (const item of sourceRows.data || []) {
            if (!item.source_url) continue;
            const submitted = await submitCandidate(
              {
                url: item.source_url,
                suspectedThreatType: queryRow.search_category,
                description: item.content_text || "Public OVAL social signal",
                discoverySource: "oval_social",
                urgency: "normal",
                runId: params.id,
              },
              context,
            );
            count += 1;
            counters.discovered += 1;
            if (submitted.duplicate) counters.deduplicated += 1;
            await admin
              .from("discovery_events")
              .update({
                query_id: queryRow.id,
                search_query: queryRow.query_text,
                title: `${item.platform || "Social"} audience signal`,
                excerpt: item.content_text || "",
                provider_timestamp: item.published_at,
                provider_confidence: 0.65,
                raw_provider_metadata: {
                  platform: item.platform,
                  sentiment: item.sentiment_label,
                  engagement: item.engagement_score,
                  author: item.author_handle,
                },
              })
              .eq("provider_id", queryRow.provider.id)
              .eq("candidate_id", submitted.candidate.id)
              .is("query_id", null);
          }
          providerStatus[key] = { status: "completed", resultCount: count };
          await admin
            .from("discovery_queries")
            .update({
              status: "completed",
              result_count: count,
              latency_ms: Date.now() - started,
              completed_at: new Date().toISOString(),
            })
            .eq("id", queryRow.id);
          await admin
            .from("discovery_providers")
            .update({
              last_success_at: new Date().toISOString(),
              last_error_code: null,
            })
            .eq("id", queryRow.provider.id);
        } catch (error) {
          counters.failedQueries += 1;
          const message =
            error instanceof Error ? error.message : "social_ingestion_error";
          providerStatus[key] = {
            status: "failed",
            error: "social_ingestion_error",
          };
          await admin
            .from("discovery_queries")
            .update({
              status: "failed",
              error_code: message.slice(0, 120),
              latency_ms: Date.now() - started,
              completed_at: new Date().toISOString(),
            })
            .eq("id", queryRow.id);
        }
        continue;
      }
      if (!provider || !queryRow.provider?.enabled || !provider.configured()) {
        counters.failedQueries += 1;
        providerStatus[key || "unknown"] = {
          status: "unavailable",
          reason: "not_configured",
        };
        await admin
          .from("discovery_queries")
          .update({
            status: "failed",
            error_code: "provider_not_configured",
            completed_at: new Date().toISOString(),
          })
          .eq("id", queryRow.id);
        continue;
      }
      const started = Date.now();
      await admin
        .from("discovery_queries")
        .update({ status: "running" })
        .eq("id", queryRow.id);
      try {
        const output = await provider.run({
          queries: [queryRow.query_text],
          maxResults: queryRow.requested_limit,
          startPublishedDate,
        });
        for (const result of output.results) {
          const submitted = await submitCandidate(
            {
              url: result.url,
              suspectedThreatType: queryRow.search_category,
              description: result.excerpt,
              discoverySource: key,
              urgency: "normal",
              runId: params.id,
            },
            context,
          );
          counters.discovered += 1;
          if (submitted.duplicate) counters.deduplicated += 1;
          await admin
            .from("discovery_events")
            .update({
              query_id: queryRow.id,
              search_query: result.query,
              ranking_position: result.rankingPosition,
              title: result.title,
              excerpt: result.excerpt,
              provider_timestamp: result.timestamp,
              provider_confidence: result.providerConfidence,
              raw_provider_metadata: result.rawMetadata,
            })
            .eq("provider_id", queryRow.provider.id)
            .eq("candidate_id", submitted.candidate.id)
            .is("query_id", null);
        }
        providerStatus[key] = {
          status: "completed",
          resultCount: output.results.length,
          rateLimitState: output.rateLimitState || {},
        };
        await admin
          .from("discovery_queries")
          .update({
            status: "completed",
            result_count: output.results.length,
            latency_ms: Date.now() - started,
            cursor: output.cursor || null,
            completed_at: new Date().toISOString(),
          })
          .eq("id", queryRow.id);
        await admin
          .from("discovery_providers")
          .update({
            last_success_at: new Date().toISOString(),
            last_error_code: null,
            rate_limit_state: output.rateLimitState || {},
          })
          .eq("id", queryRow.provider.id);
      } catch (error) {
        counters.failedQueries += 1;
        const message =
          error instanceof Error ? error.message : "provider_error";
        const status = message.includes("rate_limited")
          ? "rate_limited"
          : "failed";
        providerStatus[key] = {
          status,
          error: message.split(":").slice(0, 2).join(":"),
        };
        await admin
          .from("discovery_queries")
          .update({
            status,
            error_code: message.slice(0, 120),
            latency_ms: Date.now() - started,
            completed_at: new Date().toISOString(),
          })
          .eq("id", queryRow.id);
        await admin
          .from("discovery_providers")
          .update({
            last_error_at: new Date().toISOString(),
            last_error_code: message.slice(0, 120),
          })
          .eq("id", queryRow.provider.id);
      }
    }
    const finalStatus =
      counters.failedQueries && counters.discovered
        ? "partial"
        : counters.failedQueries
          ? "failed"
          : "completed";
    const finished = await admin
      .from("discovery_runs")
      .update({
        status: finalStatus,
        progress: counters,
        provider_status: providerStatus,
        completed_at: new Date().toISOString(),
        error_summary: counters.failedQueries
          ? `${counters.failedQueries} search queries failed; completed results were retained.`
          : null,
      })
      .eq("id", params.id)
      .select("*")
      .single();
    if (finished.error) throw finished.error;
    return NextResponse.json({ run: finished.data, progress: counters });
  } catch (error) {
    return shieldErrorResponse(error);
  }
}

function periodStart(scope: string | undefined) {
  const days = scope === "7d" ? 7 : scope === "90d" ? 90 : 30;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
