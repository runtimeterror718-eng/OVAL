import { NextRequest, NextResponse } from "next/server";
import { createSecondSupabaseClient } from "@/lib/second-supabase";

type TimeWindowValue = "90d" | "30d" | "14d" | "7d" | "3d" | "custom";
type VideoContentFilterValue = "all" | "VIDEO" | "SHORT";

const IST_TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET = "+05:30";
const WINDOW_DAYS: Record<Exclude<TimeWindowValue, "custom">, number> = {
  "90d": 90,
  "30d": 30,
  "14d": 14,
  "7d": 7,
  "3d": 3,
};

function formatIstYmd(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function toIstStartIso(ymd: string): string {
  return new Date(`${ymd}T00:00:00.000${IST_OFFSET}`).toISOString();
}

function toIstEndIso(ymd: string): string {
  return new Date(`${ymd}T23:59:59.999${IST_OFFSET}`).toISOString();
}

function shiftYmdByDays(ymd: string, dayDelta: number): string {
  const date = new Date(`${ymd}T00:00:00.000${IST_OFFSET}`);
  date.setUTCDate(date.getUTCDate() + dayDelta);
  return formatIstYmd(date);
}

function normalizeWindow(value: string | null): TimeWindowValue {
  if (value === "30d" || value === "14d" || value === "7d" || value === "3d" || value === "custom") {
    return value;
  }
  return "90d";
}

function normalizeVideoContent(value: string | null): VideoContentFilterValue {
  if (value === "VIDEO" || value === "SHORT") {
    return value;
  }
  return "all";
}

function normalizeOptionalFilter(value: string | null): string {
  if (!value || value === "all") {
    return "";
  }
  return value.trim();
}

function resolveWindowBounds(
  windowValue: TimeWindowValue,
  customStartDate: string | null,
  customEndDate: string | null
) {
  if (windowValue === "custom") {
    if (!customStartDate || !customEndDate) {
      throw new Error("Custom start date and end date are required.");
    }
    return {
      startIso: toIstStartIso(customStartDate),
      endIso: toIstEndIso(customEndDate),
    };
  }

  const endYmd = formatIstYmd(new Date());
  const startYmd = shiftYmdByDays(endYmd, -(WINDOW_DAYS[windowValue] - 1));
  return {
    startIso: toIstStartIso(startYmd),
    endIso: toIstEndIso(endYmd),
  };
}

function formatShortDateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIME_ZONE,
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00.000${IST_OFFSET}`));
}

type TrendRow = {
  bucket_date: string;
  total_comments: number;
  negative_comments: number;
  negative_share_pct: number;
};

type SplitRow = {
  metric_label: string | null;
  metric_value: number | null;
};

export async function GET(request: NextRequest) {
  try {
    const sb = createSecondSupabaseClient();
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");

    if (!channelId) {
      const { data, error } = await sb
        .from("channels")
        .select("channel_id, channel_name")
        .order("channel_name", { ascending: true });

      if (error) {
        throw error;
      }

      const channels = (data || []).map((row) => ({
        id: row.channel_id,
        name: row.channel_name,
      }));

      return NextResponse.json({ live: true, channels });
    }

    const windowValue = normalizeWindow(searchParams.get("window"));
    const customStartDate = searchParams.get("customStartDate");
    const customEndDate = searchParams.get("customEndDate");
    const videoContentFilter = normalizeVideoContent(searchParams.get("videoContent"));
    const batchName = normalizeOptionalFilter(searchParams.get("batchName"));
    const facultyName = normalizeOptionalFilter(searchParams.get("facultyName"));
    const questionType = normalizeOptionalFilter(searchParams.get("questionType"));
    const requestType = normalizeOptionalFilter(searchParams.get("requestType"));
    const { startIso, endIso } = resolveWindowBounds(windowValue, customStartDate, customEndDate);

    const commentTypeFilter =
      questionType !== "" ? "questions" : requestType !== "" ? "request_feedback" : "all";
    const actionFilter = questionType || requestType || "all";

    const [channelRes, batchRes, facultyRes, questionRes, requestRes, trendRes] = await Promise.all([
      sb.from("channels").select("channel_id, channel_name").eq("channel_id", channelId).maybeSingle(),
      sb.rpc("rpc_hack_channel_comment_batch_options", {
        p_channel_id: channelId,
        p_window_start: startIso,
        p_window_end: endIso,
        p_video_content_filter: videoContentFilter,
      }),
      sb.rpc("rpc_hack_channel_comment_faculty_options", {
        p_channel_id: channelId,
        p_window_start: startIso,
        p_window_end: endIso,
        p_video_content_filter: videoContentFilter,
      }),
      sb.rpc("rpc_hack_channel_comments_top_negative_question_actions", {
        p_channel_id: channelId,
        p_window_start: startIso,
        p_window_end: endIso,
        p_video_content_filter: videoContentFilter,
      }),
      sb.rpc("rpc_hack_channel_comments_top_negative_request_feedback_actions", {
        p_channel_id: channelId,
        p_window_start: startIso,
        p_window_end: endIso,
        p_video_content_filter: videoContentFilter,
      }),
      sb.rpc("rpc_hack_channel_comments_negative_sentiment_series_v2", {
        p_channel_id: channelId,
        p_window_start: startIso,
        p_window_end: endIso,
        p_video_content_filter: videoContentFilter,
        p_comment_type_filter: commentTypeFilter,
        p_action_filter: actionFilter,
        p_video_title_query: "",
        p_batch_name: batchName,
        p_faculty_name: facultyName,
      }),
    ]);

    const firstRpcError =
      channelRes.error ||
      batchRes.error ||
      facultyRes.error ||
      questionRes.error ||
      requestRes.error ||
      trendRes.error;

    if (firstRpcError) {
      throw firstRpcError;
    }

    const batchOptions = [
      { value: "all", label: "All Batches" },
      ...((batchRes.data || []) as Array<{ batch_name: string | null; eligible_video_count: number | null }>)
        .filter((row) => row.batch_name)
        .map((row) => ({
          value: row.batch_name as string,
          label: row.batch_name as string,
          count: row.eligible_video_count ?? 0,
        })),
    ];

    const facultyOptions = [
      { value: "all", label: "All Faculty" },
      ...((facultyRes.data || []) as Array<{ faculty_name: string | null; eligible_video_count: number | null }>)
        .filter((row) => row.faculty_name)
        .map((row) => ({
          value: row.faculty_name as string,
          label: row.faculty_name as string,
          count: row.eligible_video_count ?? 0,
        })),
    ];

    const normalizeSplitRows = (rows: SplitRow[] | null | undefined) =>
      (rows || [])
        .map((row) => ({
          name: row.metric_label?.trim() || "Unspecified",
          value: Math.max(0, Number(row.metric_value || 0)),
        }))
        .filter((row) => row.value > 0)
        .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

    const trend = ((trendRes.data || []) as TrendRow[]).map((row) => ({
      date: row.bucket_date,
      dateLabel: formatShortDateLabel(row.bucket_date),
      totalComments: Math.max(0, Number(row.total_comments || 0)),
      negativeComments: Math.max(0, Number(row.negative_comments || 0)),
      negativeSharePct: Math.max(0, Number(row.negative_share_pct || 0)),
    }));

    return NextResponse.json({
      live: true,
      channel: channelRes.data
        ? {
            id: channelRes.data.channel_id,
            name: channelRes.data.channel_name,
          }
        : null,
      range: {
        startIso,
        endIso,
      },
      filters: {
        batchOptions,
        facultyOptions,
      },
      splits: {
        negativeQuestionActionSplit: normalizeSplitRows(questionRes.data as SplitRow[]),
        negativeRequestFeedbackActionSplit: normalizeSplitRows(requestRes.data as SplitRow[]),
      },
      trend,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load owned negative sentiment data.";
    return NextResponse.json({ live: false, error: message }, { status: 500 });
  }
}
