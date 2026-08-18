"use client";

import { useMemo, useState } from "react";
import { Smartphone } from "lucide-react";

const n = (value: unknown) => Number(value || 0);
const fmt = (value: number) => new Intl.NumberFormat("en-IN", { notation: value > 9999 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
const brandForDevice = (device: string) => {
  const code = device.toLowerCase();
  if (/^(gta|a\d{2}x|sm-)/.test(code)) return "Samsung";
  if (/^v\d{4}/.test(code)) return "vivo";
  if (/^re[0-9a-z]+/.test(code)) return "realme";
  if (/^op[0-9a-z]+/.test(code)) return "OnePlus";
  if (["koto", "fogos", "breeze"].includes(code) || /^moto/.test(code)) return "Motorola";
  if (["dandelion", "cattail"].includes(code)) return "Xiaomi / Redmi";
  if (["flame"].includes(code) || /^pixel/.test(code)) return "Google Pixel";
  return "Brand unavailable";
};

export function PlayStoreDeviceIntelligence({ data }: { data: any }) {
  const [selected, setSelected] = useState(0);
  const devices = useMemo(() => {
    const groups = new Map<string, { device: string; reviews: number; negative: number; examples: string[] }>();
    const reviews = Array.isArray(data?.liveReviews) ? data.liveReviews : [];
    reviews.forEach((review: any) => {
      const device = String(review.device || "").trim();
      if (!device || /^unknown$/i.test(device)) return;
      const row = groups.get(device) || { device, reviews: 0, negative: 0, examples: [] };
      row.reviews += 1;
      if (n(review.rating) <= 2) {
        row.negative += 1;
        if (review.text && row.examples.length < 3) row.examples.push(String(review.text));
      }
      groups.set(device, row);
    });
    return Array.from(groups.values())
      .filter((row) => row.reviews >= 8)
      .map((row) => ({ ...row, brand: brandForDevice(row.device), negativeShare: row.negative / row.reviews * 100 }))
      .sort((a, b) => b.negative - a.negative || b.negativeShare - a.negativeShare)
      .slice(0, 8);
  }, [data]);
  if (!devices.length) return null;
  const active = devices[Math.min(selected, devices.length - 1)];
  const maxReviews = Math.max(...devices.map((device) => device.reviews), 1);
  const maxShare = Math.max(...devices.map((device) => device.negativeShare), 1);

  return <section className="pdi-section">
    <header className="pdi-heading"><div><p>DEVICE MODEL INTELLIGENCE</p><h2>Which phones are failing students?</h2></div><span>Model-level diagnostics use captured review volume and low-rating share.</span></header>
    <div className="pdi-layout">
      <div className="pdi-matrix">
        <header><span>LOWER RISK</span><strong>Low-rating share × evidence volume</strong><span>HIGHER RISK</span></header>
        <i className="pdi-v" /><i className="pdi-h" /><span className="pdi-y">Low-rating share ↑</span><span className="pdi-x">Evidence volume →</span>
        {devices.map((device, index) => <button key={device.device} className={selected === index ? "active" : ""} onClick={() => setSelected(index)} style={{ left: `${12 + device.reviews / maxReviews * 72}%`, bottom: `${12 + device.negativeShare / maxShare * 68}%`, width: `${42 + Math.min(25, device.negative)}px`, height: `${42 + Math.min(25, device.negative)}px` }}><b>{device.negativeShare.toFixed(0)}%</b><small>{device.brand}<em>{device.device}</em></small></button>)}
      </div>
      <article className="pdi-detail"><Smartphone size={19} /><p>SELECTED DEVICE</p><h3>{active.brand}</h3><span className="pdi-device-code">Device code · {active.device}</span><strong>{active.negativeShare.toFixed(1)}%</strong><span>low-rating share</span><div><b>{fmt(active.reviews)}</b><small>reviews</small><b>{fmt(active.negative)}</b><small>low ratings</small></div><section><small>REPRESENTATIVE CONCERN</small><p>{active.examples[0] ? `“${active.examples[0].slice(0, 180)}${active.examples[0].length > 180 ? "…" : ""}”` : "No written low-rating review is available for this device."}</p></section></article>
    </div>
    <div className="pdi-table"><header><span>Brand</span><span>Device code</span><span>Reviews</span><span>Low ratings</span><span>Low-rating share</span></header>{devices.map((device, index) => <button key={device.device} className={selected === index ? "active" : ""} onClick={() => setSelected(index)}><strong className="pdi-brand">{device.brand}</strong><span>{device.device}</span><span>{fmt(device.reviews)}</span><span>{fmt(device.negative)}</span><strong>{device.negativeShare.toFixed(1)}%</strong></button>)}</div>
  </section>;
}
