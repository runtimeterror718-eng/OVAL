"use client";

import Link from "next/link";
import { ArrowRight, Hammer } from "lucide-react";

export default function ComingSoonPage() {
  return (
    <div className="grid min-h-[60vh] place-items-center p-6">
      <div className="max-w-md text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-100 text-violet-600">
          <Hammer className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-2xl font-black tracking-tight">Coming soon</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
          This section is still being built. Play Store Intelligence is live now — the rest of the
          platform lands here shortly.
        </p>
        <Link
          href="/playstore"
          className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-black text-white transition-colors duration-200 hover:bg-violet-500"
        >
          Open Play Store Intel <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
