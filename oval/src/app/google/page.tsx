"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ExternalLink, Globe, Newspaper, Search, TrendingUp } from "lucide-react";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { fadeUp, stagger } from "@/lib/animations";
import { classifyPwAutocompleteSentiment } from "@/lib/google-autocomplete-sentiment";
import { useLiveData } from "@/lib/use-live-data";
import { cn, formatNumber } from "@/lib/utils";

function sentimentClassName(sentiment: string) {
  if (sentiment === "positive") return "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300";
  if (sentiment === "negative") return "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-300";
  if (sentiment === "warning") return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  return "bg-muted text-muted-foreground";
}

export default function GooglePage() {
  const { data, loading } = useLiveData<any>("/api/google", null);
  if (loading) return <PageSkeleton title="Google Intelligence" color="#4285F4" />;

  const stats = data?.stats || {};
  const autocomplete = data?.autocomplete || [];
  const negativeSuggestions = data?.negativeSuggestions || [];
  const serp = data?.serp || {};
  const serpQueries = data?.serpQueries || [];
  const news = data?.news || [];
  const negRate = stats.totalAutocomplete ? Math.round((stats.negativeAutocomplete || 0) / stats.totalAutocomplete * 100) : 0;

  return (
    <motion.div className="mx-auto max-w-6xl space-y-6 px-4 py-6" variants={stagger as any} initial="hidden" animate="show">
      <motion.div variants={fadeUp as any}>
        <div className="flex items-center gap-3"><Globe className="h-5 w-5 text-[#4285F4]" /><h1 className="text-2xl font-bold tracking-tight">Google Intelligence</h1></div>
        <p className="mt-0.5 text-sm text-muted-foreground">The enrollment front door: autocomplete, news, and search result reality.</p>
      </motion.div>

      <motion.section variants={fadeUp as any} className="rounded-2xl border border-blue-200 bg-card p-5 dark:border-blue-800/40">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#4285F4]">Current Search Read</p>
        <h2 className="mt-2 text-xl font-bold">Google is where parents validate trust before enrollment.</h2>
        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">
          Social channels create narratives, but Google decides what a parent sees at the moment of intent. Autocomplete warnings and negative SERP results should be handled like enrollment risk, not just SEO trivia.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="rounded-xl border border-border p-3"><p className="text-2xl font-bold">{formatNumber(stats.totalAutocomplete || 0)}</p><p className="text-[10px] text-muted-foreground">suggestions</p></div>
          <div className="rounded-xl border border-red-200 p-3"><p className="text-2xl font-bold text-red-600">{negRate}%</p><p className="text-[10px] text-muted-foreground">negative autocomplete</p></div>
          <div className="rounded-xl border border-amber-200 p-3"><p className="text-2xl font-bold text-amber-600">{formatNumber(stats.warningAutocomplete || 0)}</p><p className="text-[10px] text-muted-foreground">warning suggestions</p></div>
          <div className="rounded-xl border border-border p-3"><p className="text-2xl font-bold">{formatNumber(stats.newsArticles || 0)}</p><p className="text-[10px] text-muted-foreground">news items</p></div>
          <div className="rounded-xl border border-border p-3"><p className="text-2xl font-bold">{formatNumber(stats.serpQueries || 0)}</p><p className="text-[10px] text-muted-foreground">SERP queries</p></div>
        </div>
      </motion.section>

      <motion.section variants={fadeUp as any} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-amber-200 bg-amber-50/30 p-5 dark:border-amber-800/40 dark:bg-amber-950/10">
          <div className="mb-3 flex items-center gap-2"><Search className="h-4 w-4 text-amber-600" /><h2 className="text-lg font-bold">Autocomplete audit</h2></div>
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 flex items-center gap-2 border-b border-border pb-2"><div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#4285F4] text-[10px] font-bold text-white">G</div><span className="text-sm text-muted-foreground">physics wallah</span></div>
            <div className="space-y-1">
              {autocomplete.slice(0, 15).map((item: any, index: number) => (
                (() => {
                  const sentiment = item.sentiment || classifyPwAutocompleteSentiment(item.suggestion || "");
                  return (
                    <div key={index} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-muted/50">
                      <Search className="h-3 w-3 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{item.suggestion}</span>
                      <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium", sentimentClassName(sentiment))}>{sentiment}</span>
                    </div>
                  );
                })()
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-600" /><h2 className="text-lg font-bold">Negative and warning asks</h2></div>
          <div className="grid grid-cols-1 gap-2">
            {negativeSuggestions.slice(0, 12).map((item: any, index: number) => (
              <div key={index} className="rounded-xl border border-border p-3">
                <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-medium", sentimentClassName(item.sentiment || "warning"))}>{item.sentiment}</span>
                <p className="mt-2 text-sm font-semibold">{item.suggestion}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      <motion.section variants={fadeUp as any} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-green-600" /><h2 className="text-lg font-bold">Search results leaders should inspect</h2></div>
          <div className="space-y-4">
            {serpQueries.slice(0, 4).map((query: string) => (
              <div key={query} className="rounded-xl border border-border p-3">
                <p className="text-xs font-bold text-[#4285F4]">Search: &ldquo;{query}&rdquo;</p>
                <div className="mt-2 space-y-2">
                  {(serp[query] || []).slice(0, 3).map((result: any) => (
                    <div key={`${query}-${result.organic_position}`} className="flex gap-2 text-sm">
                      <span className="w-6 shrink-0 font-mono text-[10px] text-muted-foreground">#{result.organic_position}</span>
                      <div className="min-w-0 flex-1"><a href={result.organic_url} target="_blank" rel="noopener noreferrer" className="line-clamp-1 font-medium text-[#4285F4] hover:underline">{result.organic_title}</a><p className="line-clamp-1 text-xs text-muted-foreground">{result.organic_snippet}</p></div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2"><Newspaper className="h-4 w-4 text-amber-600" /><h2 className="text-lg font-bold">News radar</h2></div>
          <div className="space-y-2">
            {news.slice(0, 12).map((item: any, index: number) => (
              <div key={index} className="rounded-xl border border-border p-3">
                <div className="mb-1 flex items-center justify-between gap-3"><span className="text-[10px] text-muted-foreground">{item.source || "Unknown"}</span><span className="text-[10px] text-muted-foreground">{item.published?.slice(0, 10)}</span></div>
                <p className="text-sm font-semibold">{item.title}</p>
                {item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-[#4285F4] hover:underline">Read <ExternalLink className="h-3 w-3" /></a> : null}
              </div>
            ))}
          </div>
        </div>
      </motion.section>
    </motion.div>
  );
}
