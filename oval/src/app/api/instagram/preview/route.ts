import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
}

function extractMetaImage(html: string) {
  const markers = ['property="og:image"', "property='og:image'"];
  for (const marker of markers) {
    const markerIndex = html.indexOf(marker);
    if (markerIndex >= 0) {
      const contentIndex = html.indexOf('content="', markerIndex);
      if (contentIndex >= 0) {
        const start = contentIndex + 'content="'.length;
        const end = html.indexOf('"', start);
        if (end > start) {
          return decodeHtml(html.slice(start, end).replace(/\\u0026/g, "&").replace(/\\/g, ""));
        }
      }
    }
  }

  const displayUrlMatch = html.match(/"display_url":"(https:[^"]+)"/i);
  if (displayUrlMatch?.[1]) {
    return decodeHtml(displayUrlMatch[1].replace(/\\u0026/g, "&").replace(/\\/g, ""));
  }

  return null;
}

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("url");
  if (!target) return new Response("Missing url", { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }

  if (!/instagram\.com$/i.test(parsed.hostname) && !/cdninstagram\.com$/i.test(parsed.hostname)) {
    return new Response("Unsupported host", { status: 400 });
  }

  try {
    let imageUrl = target;
    if (!/cdninstagram\.com$/i.test(parsed.hostname) && !/\.(png|jpe?g|webp)(\?|$)/i.test(parsed.pathname)) {
      const htmlRes = await fetch(target, {
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          accept: "text/html,application/xhtml+xml",
          "accept-language": "en-US,en;q=0.9",
        },
        cache: "no-store",
      });
      if (!htmlRes.ok) return new Response("Unable to load target", { status: 502 });
      const html = await htmlRes.text();
      const extracted = extractMetaImage(html);
      if (!extracted) return new Response("No preview image found", { status: 404 });
      imageUrl = extracted;
    }

    const imageRes = await fetch(imageUrl, {
      headers: {
        "user-agent": "Mozilla/5.0",
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        referer: "https://www.instagram.com/",
      },
      cache: "force-cache",
    });
    if (!imageRes.ok) return new Response("Unable to load image", { status: 502 });

    const contentType = imageRes.headers.get("content-type") || "image/jpeg";
    const bytes = await imageRes.arrayBuffer();
    return new Response(bytes, {
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch {
    return new Response("Preview fetch failed", { status: 502 });
  }
}
