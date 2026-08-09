"use client";

import { X } from "lucide-react";

export type FilterOption = { value: string; label: string };

export function PageHeader({ coverage, freshness }: { coverage: string; freshness?: string }) {
  return <div className="oval-page-meta"><span>Source coverage: {coverage}</span><span>{freshness || "Freshness unavailable"}</span></div>;
}

export function DashboardFilterBar({ filters, values, onChange, onClear }: { filters: { key: string; label: string; options: FilterOption[] }[]; values: Record<string, string>; onChange: (key: string, value: string) => void; onClear?: () => void }) {
  return <div className="oval-filter-bar" aria-label="Dashboard filters">
    {filters.map((filter) => <label key={filter.key}><span>{filter.label}</span><select value={values[filter.key] || ""} onChange={(event) => onChange(filter.key, event.target.value)}>{filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}
    {onClear ? <button type="button" onClick={onClear}><X aria-hidden="true" /> Clear filters</button> : null}
  </div>;
}

export function KpiCard({ label, value, context, onClick }: { label: string; value: string | number; context: string; onClick?: () => void }) {
  const content = <><p>{label}</p><strong>{value}</strong><span>{context}</span></>;
  return onClick ? <button type="button" className="oval-kpi-card" onClick={onClick}>{content}</button> : <div className="oval-kpi-card">{content}</div>;
}

export function DataFreshnessIndicator({ value }: { value?: string | null }) { return <span className="oval-freshness">Updated {value || "unknown"}</span>; }

export function EmptyState({ message }: { message: string }) { return <div className="oval-state">{message}</div>; }
export function ErrorState({ message }: { message: string }) { return <div className="oval-state oval-state-error">{message}</div>; }
export function LoadingState({ label = "Loading data" }: { label?: string }) { return <div className="oval-state" aria-live="polite">{label}…</div>; }
