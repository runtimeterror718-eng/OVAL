"use client";

import { FormEvent, useEffect, useState } from "react";
import { Disc3, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { VaultNav } from "./vault-nav";
import type { VaultTrack } from "@/lib/vault-types";

const empty = { spotifyUrl: "", title: "", artist: "", valence: "mixed", intensity: "medium", themeTags: "conversation, community", priority: 50 };

export function VaultLibrary() {
  const [tracks, setTracks] = useState<VaultTrack[]>([]);
  const [role, setRole] = useState("");
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const load = () => fetch("/api/vault/tracks", { cache: "no-store" }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setTracks(data.tracks || []); setRole(data.currentMember?.role || ""); }).catch((reason) => setError(reason.message));
  useEffect(() => { void load(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      const response = await fetch("/api/vault/tracks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, themeTags: form.themeTags.split(",").map((value) => value.trim()).filter(Boolean) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      toast.success("Track added to the approved Vault catalogue"); setForm(empty); load();
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Track could not be saved"); } finally { setSaving(false); }
  }

  async function mutate(track: VaultTrack, action: "toggle" | "delete") {
    const response = await fetch(action === "delete" ? `/api/vault/tracks?id=${track.id}` : "/api/vault/tracks", action === "delete" ? { method: "DELETE" } : { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: track.id, spotifyTrackId: track.spotifyTrackId, title: track.title, artist: track.artist, valence: track.valence, intensity: track.intensity, themeTags: track.themeTags, channelScopes: track.channelScopes, priority: track.priority, active: !track.active }) });
    const data = await response.json(); if (!response.ok) return toast.error(data.error || "Catalogue update failed");
    toast.success(action === "delete" ? "Track removed" : "Track availability updated"); load();
  }

  return <main className="vault-page vault-library-page"><VaultNav role={role} library />
    <section className="vault-library-hero"><div><p>ADMIN · APPROVED MUSIC ONLY</p><h1>Vault Library</h1><span>OVAL selects exclusively from this catalogue. It never searches Spotify or introduces unapproved tracks automatically.</span></div><Disc3 /></section>
    {error ? <section className="vault-state"><p>{error}</p><span>Apply the Sentiment Vault migration before managing the catalogue.</span></section> : role && role !== "admin" ? <section className="vault-state"><p>Admin access is required to manage the music catalogue.</p></section> : <>
      <form className="vault-track-form" onSubmit={submit}><header><Plus size={18} /><div><strong>Add an approved track</strong><span>Paste a canonical Spotify track URL. Metadata is resolved server-side when available.</span></div></header><label>Spotify track URL<input required value={form.spotifyUrl} onChange={(event) => setForm({ ...form, spotifyUrl: event.target.value })} placeholder="https://open.spotify.com/track/…" /></label><label>Title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Resolved automatically" /></label><label>Artist<input value={form.artist} onChange={(event) => setForm({ ...form, artist: event.target.value })} placeholder="Resolved automatically" /></label><label>Valence<select value={form.valence} onChange={(event) => setForm({ ...form, valence: event.target.value })}>{["uplifting", "tense", "reflective", "mixed"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Intensity<select value={form.intensity} onChange={(event) => setForm({ ...form, intensity: event.target.value })}>{["low", "medium", "high"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Theme tags<input value={form.themeTags} onChange={(event) => setForm({ ...form, themeTags: event.target.value })} /></label><label>Priority<input type="number" min="0" max="100" value={form.priority} onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })} /></label><button disabled={saving}><Save size={15} />{saving ? "Saving…" : "Approve track"}</button></form>
      <section className="vault-catalogue"><header><div><p>ACTIVE CATALOGUE</p><h2>{tracks.length} approved tracks</h2></div><span>Four valences · three intensity levels</span></header><div>{tracks.map((track) => <article key={track.id} className={!track.active ? "inactive" : ""}><div className="vault-vinyl small"><span><i /></span></div><span><small>{track.valence} · {track.intensity}</small><strong>{track.title}</strong><p>{track.artist}</p></span><div className="vault-track-tags">{track.themeTags.slice(0, 3).map((tag) => <i key={tag}>{tag}</i>)}</div><button onClick={() => mutate(track, "toggle")}>{track.active ? "Deactivate" : "Activate"}</button><button className="danger" onClick={() => mutate(track, "delete")} aria-label={`Delete ${track.title}`}><Trash2 size={15} /></button></article>)}</div></section>
    </>}
  </main>;
}
