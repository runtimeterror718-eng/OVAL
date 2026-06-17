import { NextResponse } from "next/server";
import { buildPlaystoreSlackMessage } from "@/lib/playstore-slack";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const expected = process.env.PLAYSTORE_SLACK_TRIGGER_TOKEN;
  if (!expected) return true;
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${expected}`;
}

function configuredSlackTargets() {
  const userIds = (process.env.PLAYSTORE_SLACK_USER_IDS || process.env.PLAYSTORE_SLACK_USER_ID || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const channelIds = (process.env.PLAYSTORE_SLACK_CHANNEL_IDS || process.env.PLAYSTORE_SLACK_CHANNEL_ID || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return { userIds, channelIds };
}

async function resolveSlackChannels(token: string) {
  const { userIds, channelIds } = configuredSlackTargets();
  const channels: string[] = [];

  for (const userId of userIds) {
    const response = await fetch("https://slack.com/api/conversations.open", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ users: userId }),
    });
    const payload = await response.json();
    if (!response.ok || !payload?.ok || !payload?.channel?.id) {
      throw new Error(payload?.error || "conversations.open failed");
    }
    channels.push(payload.channel.id as string);
  }

  if (!userIds.length) {
    channels.push(...channelIds);
  }
  const uniqueChannels = Array.from(new Set(channels));
  if (!uniqueChannels.length) {
    throw new Error("Missing Slack target");
  }
  return uniqueChannels;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.SLACK_BOT_TOKEN;
  const { userIds, channelIds } = configuredSlackTargets();
  if (!token || (!userIds.length && !channelIds.length)) {
    return NextResponse.json({ error: "Missing Slack configuration" }, { status: 500 });
  }

  let channels: string[];
  try {
    channels = await resolveSlackChannels(token);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to resolve Slack target",
        slackError: error instanceof Error ? error.message : "Unknown Slack target error",
      },
      { status: 502 }
    );
  }

  const origin = new URL(request.url).origin;
  const playstoreResponse = await fetch(`${origin}/api/playstore`, { cache: "no-store" });
  if (!playstoreResponse.ok) {
    return NextResponse.json({ error: "Failed to load Play Store summary" }, { status: 502 });
  }

  const playstorePayload = await playstoreResponse.json();
  const message = buildPlaystoreSlackMessage(playstorePayload);

  const deliveries = [];
  for (const channel of channels) {
    const slackResponse = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel,
        text: message.text,
        blocks: message.blocks,
        unfurl_links: false,
        unfurl_media: false,
      }),
    });

    const slackPayload = await slackResponse.json();
    if (!slackResponse.ok || !slackPayload?.ok) {
      return NextResponse.json(
        {
          error: "Slack post failed",
          slackError: slackPayload?.error || slackResponse.statusText,
          failedChannel: channel,
        },
        { status: 502 }
      );
    }
    deliveries.push({ channel, ts: slackPayload.ts });
  }

  return NextResponse.json({
    success: true,
    deliveries,
    summary: message.meta,
  });
}
