import { notFound } from "next/navigation";
import { AudienceIntelligenceDashboard } from "@/components/audience-intelligence/audience-intelligence-dashboard";
import { AudienceIntelligenceOverview } from "@/components/audience-intelligence/audience-intelligence-overview";
import { FreshdeskAudienceDashboard } from "@/components/audience-intelligence/freshdesk-audience-dashboard";
import "../audience-intelligence.css";

const dashboardChannels = ["playstore", "reddit", "linkedin", "youtube", "x", "facebook", "instagram"] as const;
const channels = ["overview", "freshdesk", ...dashboardChannels] as const;

export default function AudienceIntelligenceChannel({ params }: { params: { channel: string } }) {
  if (!channels.includes(params.channel as (typeof channels)[number])) notFound();
  if (params.channel === "overview") return <AudienceIntelligenceOverview />;
  if (params.channel === "freshdesk") return <FreshdeskAudienceDashboard />;
  return <AudienceIntelligenceDashboard initialChannel={params.channel as (typeof dashboardChannels)[number]} />;
}
