import type { ElementType, ReactNode } from "react";
import { ChevronDown, Filter, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "brand" | "success" | "warning" | "danger" | "neutral";

const toneClasses: Record<Tone, string> = {
  brand: "border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300",
  success: "border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300",
  warning: "border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300",
  danger: "border-red-100 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300",
  neutral: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300",
};

export function DashboardPanel({
  children,
  className,
  as: Comp = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
}) {
  return (
    <Comp className={cn("rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-slate-800 dark:bg-slate-950", className)}>
      {children}
    </Comp>
  );
}

export function PanelHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", toneClasses[tone], className)}>
      {children}
    </span>
  );
}

export function MetricCard({
  title,
  value,
  delta,
  tone = "neutral",
  icon: Icon,
  children,
  className,
}: {
  title: string;
  value: string;
  delta?: string;
  tone?: Tone;
  icon?: LucideIcon;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <DashboardPanel className={cn("flex min-h-[136px] flex-col justify-between p-5", className)} as="article">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
          <p className="mt-2 truncate text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</p>
        </div>
        {Icon ? (
          <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl border", toneClasses[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        {delta ? <StatusBadge tone={tone}>{delta}</StatusBadge> : <span />}
        {children ? <div className="min-w-[88px] max-w-[132px] flex-1">{children}</div> : null}
      </div>
    </DashboardPanel>
  );
}

export function FilterButton({
  children,
  active,
  className,
  icon: Icon = Filter,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors",
        active
          ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900",
        className
      )}
      {...props}
    >
      <Icon className="h-4 w-4" />
      {children}
      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
    </button>
  );
}

export function DataTableShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950", className)}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
