"use client";

import { useRef, useState, useEffect, type ReactNode } from "react";
import { motion } from "framer-motion";

interface AnimatedChartProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

/**
 * Wrapper that animates chart entrance when it scrolls into view.
 * Children render immediately — Recharts handles its own data animation.
 */
export function AnimatedChart({ children, delay = 0, className }: AnimatedChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.05 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={isVisible ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 24, scale: 0.97 }}
      transition={{
        duration: 0.6,
        delay,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Animated number counter — counts up from 0 to target value.
 */
export function AnimatedNumber({ value, duration = 1.2, prefix = "", suffix = "" }: {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [displayValue, setDisplayValue] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Fallback: if IntersectionObserver is unavailable, start immediately.
    if (typeof IntersectionObserver === "undefined") { setStarted(true); return; }
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setStarted(true); },
      { threshold: 0 }
    );
    observer.observe(el);
    // Safety net: if the observer never fires (already in view, layout quirks),
    // start the animation anyway so the value is never stuck at 0.
    const timer = setTimeout(() => setStarted(true), 200);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!started) return;
    if (!value) { setDisplayValue(0); return; }

    const startTime = Date.now();
    const tick = () => {
      const progress = Math.min((Date.now() - startTime) / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(eased * value));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [started, value, duration]);

  // Until the animation starts, show the real value (never a stuck 0).
  const shown = started ? displayValue : value;

  return (
    <span ref={ref}>
      {prefix}{(shown || 0).toLocaleString("en-IN")}{suffix}
    </span>
  );
}
