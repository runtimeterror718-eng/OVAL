import { NextRequest, NextResponse } from "next/server";
import { CrmError, crmErrorResponse, requireCrmContext } from "@/lib/crm-server";
import { spotifyTrackId } from "@/lib/vault-intelligence";
import { mapVaultTrack } from "@/lib/vault-server";
import { VAULT_CHANNELS } from "@/lib/vault-types";

const valences = new Set(["uplifting", "tense", "reflective", "mixed"]);
const intensities = new Set(["low", "medium", "high"]);

async function metadata(id: string) {
  const url = `https://open.spotify.com/track/${id}`;
  try {
    const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, { cache: "no-store" });
    if (!response.ok) return null;
    return response.json();
  } catch { return null; }
}

function fields(body: any, id: string, meta: any) {
  if (!valences.has(body.valence) || !intensities.has(body.intensity)) throw new CrmError("Choose a valid valence and intensity", 400, "invalid_mood_tags");
  const scopes = Array.from(new Set((Array.isArray(body.channelScopes) ? body.channelScopes : []).map(String)));
  if (scopes.some((scope) => !VAULT_CHANNELS.includes(scope as any))) throw new CrmError("Unknown channel scope", 400, "invalid_channel_scope");
  const oembedTitle = String(meta?.title || "");
  const [titlePart, artistPart] = oembedTitle.split(/\s+[–-]\s+/);
  return {
    spotify_track_id: id,
    title: String(body.title || titlePart || "Spotify track").trim(),
    artist: String(body.artist || artistPart || meta?.author_name || "Spotify artist").trim(),
    artwork_url: body.artworkUrl || meta?.thumbnail_url || null,
    valence: body.valence,
    intensity: body.intensity,
    theme_tags: Array.from(new Set((Array.isArray(body.themeTags) ? body.themeTags : []).map((tag: any) => String(tag).trim().toLowerCase()).filter(Boolean))).slice(0, 20),
    channel_scopes: scopes,
    priority: Math.max(0, Math.min(100, Number(body.priority || 0))),
    active: body.active !== false,
    updated_at: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const { member, admin } = await requireCrmContext();
    const result = await admin.from("vault_tracks").select("*").eq("brand_id", member.brand_id).order("active", { ascending: false }).order("priority", { ascending: false });
    if (result.error) throw new CrmError(result.error.message, result.error.code === "42P01" ? 503 : 500, "catalogue_read_failed");
    return NextResponse.json({ tracks: (result.data || []).map(mapVaultTrack), currentMember: { id: member.id, role: member.role } });
  } catch (error) { return crmErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const { member, admin } = await requireCrmContext(["admin"]);
    const body = await request.json();
    const id = spotifyTrackId(String(body.spotifyUrl || body.spotifyTrackId || ""));
    const row = { ...fields(body, id, await metadata(id)), brand_id: member.brand_id, created_by: member.id };
    const result = await admin.from("vault_tracks").insert(row).select("*").single();
    if (result.error) throw new CrmError(result.error.message, result.error.code === "23505" ? 409 : 500, "catalogue_write_failed");
    return NextResponse.json({ track: mapVaultTrack(result.data) }, { status: 201 });
  } catch (error) { return crmErrorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const { member, admin } = await requireCrmContext(["admin"]);
    const body = await request.json();
    if (!body.id) throw new CrmError("Track ID is required", 400, "track_id_required");
    const id = spotifyTrackId(String(body.spotifyUrl || body.spotifyTrackId || ""));
    const result = await admin.from("vault_tracks").update(fields(body, id, await metadata(id))).eq("id", body.id).eq("brand_id", member.brand_id).select("*").single();
    if (result.error) throw new CrmError(result.error.message, 500, "catalogue_write_failed");
    return NextResponse.json({ track: mapVaultTrack(result.data) });
  } catch (error) { return crmErrorResponse(error); }
}

export async function DELETE(request: NextRequest) {
  try {
    const { member, admin } = await requireCrmContext(["admin"]);
    const id = request.nextUrl.searchParams.get("id");
    if (!id) throw new CrmError("Track ID is required", 400, "track_id_required");
    const result = await admin.from("vault_tracks").delete().eq("id", id).eq("brand_id", member.brand_id);
    if (result.error) throw new CrmError(result.error.message, 500, "catalogue_delete_failed");
    return NextResponse.json({ deleted: true });
  } catch (error) { return crmErrorResponse(error); }
}
