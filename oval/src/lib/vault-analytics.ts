"use client";

export function trackVaultEvent(event: "vault_opened" | "vault_room_opened" | "slide_navigated" | "archive_selected" | "spotify_embed_loaded" | "spotify_outbound_clicked", properties: Record<string, string | number | boolean | null | undefined> = {}) {
  const body = JSON.stringify({ event, properties, occurredAt: new Date().toISOString() });
  if (typeof navigator !== "undefined" && navigator.sendBeacon) navigator.sendBeacon("/api/vault/events", new Blob([body], { type: "application/json" }));
  else void fetch("/api/vault/events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true });
}
