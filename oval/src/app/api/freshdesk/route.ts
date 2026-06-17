import { NextResponse } from "next/server";
import insights from "@/data/freshdesk-insights.json";
import { buildChannelContract, buildSourceStatus, buildSupervisedTopics, fromRuleClusters, summarizeSentiment, type TextSignal } from "@/lib/channel-intelligence";

export const dynamic = "force-static";

export async function GET() {
  const ticketSignals: TextSignal[] = [
    ...((insights as any).activeExamples || []).map((ticket: any) => ({
      id: ticket.ticketId,
      title: ticket.subject,
      text: ticket.description,
      sentiment: "negative",
      fetchedAt: (insights as any).generatedAt,
      status: ticket.status,
      owner: ticket.group,
      sourceType: "ticket",
    })),
    ...((insights as any).urgentExamples || []).map((ticket: any) => ({
      id: `urgent-${ticket.ticketId}`,
      title: ticket.subject,
      text: ticket.description,
      sentiment: "negative",
      fetchedAt: (insights as any).generatedAt,
      status: ticket.status,
      owner: ticket.group,
      sourceType: "ticket",
    })),
  ];
  const supervisedTopics = buildSupervisedTopics(ticketSignals, { denominator: (insights as any).stats?.textTickets || ticketSignals.length });
  const contract = buildChannelContract({
    channel: "freshdesk",
    sourceStatus: buildSourceStatus({
      mode: "static_upload",
      generatedAt: (insights as any).generatedAt,
      limitations: [
        "Built from uploaded Freshdesk CSV export, not live Freshdesk API.",
        "The export has no created-at/resolved-at/SLA fields, so this is a queue composition snapshot, not latency trend analysis.",
        "Support sentiment is inferred from issue type and urgency language; no CSAT/reopen fields are present.",
      ],
    }),
    signals: ticketSignals,
    sentiment: summarizeSentiment(ticketSignals, "operational-blockage-rule", {
      negative: (insights as any).stats?.activeTickets || 0,
      neutral: Math.max(0, ((insights as any).stats?.totalTickets || 0) - ((insights as any).stats?.activeTickets || 0)),
      confidence: 0.68,
    }),
    supervisedTopics,
    unsupervisedClusters: fromRuleClusters(((insights as any).categories || []).map((category: any) => ({
      name: category.name,
      mentions: category.count,
      sentiment: "negative",
      evidence: (category.examples || []).map((ticket: any) => ticket.subject || ticket.description).filter(Boolean),
    }))),
    headline: "Freshdesk is a support-demand snapshot: read it as blocked student workflow, not public sentiment.",
    whyItMatters: "The most important signals are active tickets around paid access, delivery, refund, app/video reliability, and routing gaps.",
    recommendedActions: [
      "Route top active categories to named owners and separate product bugs from support operations.",
      "Add created/resolved/SLA/reopen/CSAT fields to unlock trend and recovery analysis.",
      "Treat urgent/legal/payment/access tickets as leadership priority regardless of aggregate share.",
    ],
  });

  return NextResponse.json({
    live: true,
    contract,
    ...insights,
  });
}
