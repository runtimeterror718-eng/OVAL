"use client";

import "./page-skeleton.css";

export type SkeletonVariant = "platform" | "overview" | "integrations" | "vault" | "issues";

type LoadingProps = {
  embedded?: boolean;
  variant?: SkeletonVariant;
};

function Line({ size = "medium" }: { size?: "tiny" | "small" | "medium" | "large" }) {
  return <span className={`oval-skeleton-block line-${size}`} />;
}

function MetricCard() {
  return <article className="oval-skeleton-card metric-card"><Line size="small" /><Line size="large" /><Line /></article>;
}

function ContentCard({ rows = 3 }: { rows?: number }) {
  return <article className="oval-skeleton-card content-card"><Line size="small" /><Line size="large" />{Array.from({ length: rows }, (_, index) => <Line key={index} size={index === rows - 1 ? "small" : "medium"} />)}</article>;
}

export function OvalLoadingSkeleton({ embedded = false, variant = "platform" }: LoadingProps) {
  const cardCount = variant === "integrations" ? 4 : variant === "overview" ? 5 : variant === "vault" ? 4 : 5;

  return <section className={`oval-page-skeleton ${embedded ? "is-embedded" : ""} variant-${variant}`} aria-busy="true" aria-label="Loading page content">
    <span className="sr-only">Loading page content</span>
    <div className="oval-skeleton-hero">
      <div className="oval-skeleton-copy"><Line size="tiny" /><Line size="large" /><Line size="large" /><Line /><Line size="small" /></div>
      <div className="oval-skeleton-feature"><Line size="small" /><Line size="large" /><Line /><Line size="small" /></div>
    </div>
    {variant !== "integrations" && <div className="oval-skeleton-filters"><i /><i /><i /><i /><span /></div>}
    <div className="oval-skeleton-card-grid">
      {Array.from({ length: cardCount }, (_, index) => variant === "issues" ? <MetricCard key={index} /> : <ContentCard key={index} rows={variant === "integrations" ? 4 : 2} />)}
    </div>
    {variant !== "integrations" && <div className="oval-skeleton-content-grid">
      <ContentCard rows={5} />
      <article className="oval-skeleton-card list-card"><Line size="small" />{Array.from({ length: 5 }, (_, index) => <div className="oval-skeleton-list-row" key={index}><span className="oval-skeleton-block avatar" /><span><Line /><Line size="small" /></span></div>)}</article>
    </div>}
  </section>;
}

export function PageSkeleton({ title: _title, color: _color }: { title: string; color: string }) {
  return <OvalLoadingSkeleton embedded variant="platform" />;
}

export function MetricsSkeleton({ count = 6 }: { count?: number }) {
  return <div className="oval-skeleton-card-grid">{Array.from({ length: count }, (_, index) => <MetricCard key={index} />)}</div>;
}

export function ChartSkeleton() {
  return <ContentCard rows={5} />;
}

export function PostListSkeleton({ count = 5 }: { count?: number }) {
  return <article className="oval-skeleton-card list-card">{Array.from({ length: count }, (_, index) => <div className="oval-skeleton-list-row" key={index}><span className="oval-skeleton-block avatar" /><span><Line /><Line size="small" /></span></div>)}</article>;
}

export function AnalysisSkeleton() {
  return <div className="oval-skeleton-content-grid"><ChartSkeleton /><PostListSkeleton count={4} /></div>;
}
