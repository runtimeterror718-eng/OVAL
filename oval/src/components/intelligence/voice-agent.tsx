"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic2, Pause, Play, Radio, Square, Volume2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type VoiceBriefing = {
  script: string;
  audioUrl?: string | null;
  provider?: {
    preferred?: string;
    audioReady?: boolean;
    fallback?: string;
    note?: string;
  };
  lines?: Array<{ title: string; detail: string; severity: string }>;
  sourceCoverage?: Record<string, boolean>;
};

function canUseSpeech() {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export function VoiceAgent() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [briefing, setBriefing] = useState<VoiceBriefing | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "speaking" | "paused" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechChunksRef = useRef<string[]>([]);
  const speechChunkIndexRef = useRef(0);

  useEffect(() => {
    return () => {
      if (canUseSpeech()) window.speechSynthesis.cancel();
      audioRef.current?.pause();
    };
  }, []);

  async function loadBriefing(withAudio = false) {
    setLoading(true);
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch(`/api/voice-agent${withAudio ? "?audio=1" : ""}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load voice briefing");
      const json = await response.json();
      setBriefing(json);
      setStatus("idle");
      return json as VoiceBriefing;
    } catch (err: any) {
      setError(err?.message || "Voice briefing failed");
      setStatus("error");
      return null;
    } finally {
      setLoading(false);
    }
  }

  function stop() {
    if (canUseSpeech()) window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    speechChunksRef.current = [];
    speechChunkIndexRef.current = 0;
    setStatus("idle");
  }

  function pause() {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setStatus("paused");
      return;
    }
    if (canUseSpeech() && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      setStatus("paused");
    }
  }

  function resume() {
    if (audioRef.current && audioRef.current.paused && briefing?.audioUrl) {
      audioRef.current.play().catch(() => setStatus("error"));
      setStatus("speaking");
      return;
    }
    if (canUseSpeech()) {
      window.speechSynthesis.resume();
      setStatus("speaking");
    }
  }

  function splitForSpeech(script: string) {
    const sentences = script
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const chunks: string[] = [];
    let current = "";

    for (const sentence of sentences) {
      if ((current + " " + sentence).trim().length <= 220) {
        current = (current + " " + sentence).trim();
      } else {
        if (current) chunks.push(current);
        if (sentence.length <= 220) {
          current = sentence;
        } else {
          const words = sentence.split(/\s+/);
          current = "";
          for (const word of words) {
            if ((current + " " + word).trim().length > 220) {
              if (current) chunks.push(current);
              current = word;
            } else {
              current = (current + " " + word).trim();
            }
          }
        }
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  async function play() {
    stop();
    const nextBriefing = briefing || await loadBriefing(false);
    if (!nextBriefing?.script) return;

    if (nextBriefing.audioUrl) {
      const audio = new Audio(nextBriefing.audioUrl);
      audioRef.current = audio;
      audio.onended = () => setStatus("idle");
      audio.onerror = () => {
        setError("MisoTTS audio playback failed. Falling back to browser voice.");
        speakInBrowser(nextBriefing.script);
      };
      setStatus("speaking");
      audio.play().catch(() => speakInBrowser(nextBriefing.script));
      return;
    }

    speakInBrowser(nextBriefing.script);
  }

  function speakInBrowser(script: string) {
    if (!canUseSpeech()) {
      setError("Browser speech synthesis is not available here.");
      setStatus("error");
      return;
    }
    const chunks = splitForSpeech(script);
    if (!chunks.length) {
      setError("There is no briefing text to narrate.");
      setStatus("error");
      return;
    }
    speechChunksRef.current = chunks;
    speechChunkIndexRef.current = 0;
    speakNextBrowserChunk();
  }

  function speakNextBrowserChunk() {
    if (!canUseSpeech()) return;
    const chunk = speechChunksRef.current[speechChunkIndexRef.current];
    if (!chunk) {
      setStatus("idle");
      speechChunkIndexRef.current = 0;
      speechChunksRef.current = [];
      return;
    }

    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.rate = 0.94;
    utterance.pitch = 1;
    utterance.volume = 1;
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find((voice) => /en-IN|India/i.test(`${voice.lang} ${voice.name}`)) || voices.find((voice) => /^en/i.test(voice.lang));
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.onend = () => {
      speechChunkIndexRef.current += 1;
      window.setTimeout(() => speakNextBrowserChunk(), 80);
    };
    utterance.onerror = () => {
      setError("Browser narration failed. Try clicking Narrate again, or connect the MisoTTS service.");
      setStatus("error");
    };
    utteranceRef.current = utterance;
    setStatus("speaking");
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  async function loadMisoAudio() {
    stop();
    const nextBriefing = await loadBriefing(true);
    if (!nextBriefing) return;
    if (!nextBriefing.audioUrl) {
      setError("MisoTTS service is not connected. Browser narration is ready.");
      return;
    }
    setBriefing(nextBriefing);
  }

  const isSpeaking = status === "speaking";
  const isPaused = status === "paused";

  return (
    <div className="fixed bottom-20 right-4 z-50 md:bottom-5 md:right-5">
      {open ? (
        <div className="mb-3 w-[min(calc(100vw-2rem),420px)] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-border p-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-purple text-white">
                  <Mic2 className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-bold">Voice Agent</p>
                  <p className="text-[11px] text-muted-foreground">Narrates all findings at once</p>
                </div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-muted" aria-label="Close voice agent">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3 p-4">
            <div className="rounded-xl border border-border bg-background/50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Provider</p>
                  <p className="mt-1 text-sm font-bold">{briefing?.provider?.preferred === "misotts" ? "MisoTTS" : "Browser voice fallback"}</p>
                </div>
                <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", briefing?.provider?.audioReady ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
                  {briefing?.provider?.audioReady ? "Miso audio ready" : "local narration"}
                </span>
              </div>
              {briefing?.provider?.note ? <p className="mt-2 text-[11px] text-muted-foreground">{briefing.provider.note}</p> : null}
            </div>

            {briefing?.script ? (
              <div className="max-h-40 overflow-y-auto rounded-xl border border-border p-3 text-xs leading-relaxed text-muted-foreground">
                {briefing.script}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">Load the latest leadership briefing, then press play.</p>
            )}

            {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p> : null}

            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => loadBriefing(false)} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-muted disabled:opacity-60">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}
                Load briefing
              </button>
              <button onClick={loadMisoAudio} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-muted disabled:opacity-60">
                <Volume2 className="h-3.5 w-3.5" />
                Try MisoTTS
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={isPaused ? resume : play} disabled={loading} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-purple px-3 py-2.5 text-xs font-bold text-white hover:bg-purple/90 disabled:opacity-60">
                {isPaused ? <Play className="h-4 w-4" /> : isSpeaking ? <Volume2 className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {isPaused ? "Resume" : isSpeaking ? "Speaking" : "Narrate"}
              </button>
              <button onClick={pause} disabled={!isSpeaking} className="rounded-xl border border-border p-2.5 hover:bg-muted disabled:opacity-40" aria-label="Pause narration">
                <Pause className="h-4 w-4" />
              </button>
              <button onClick={stop} className="rounded-xl border border-border p-2.5 hover:bg-muted" aria-label="Stop narration">
                <Square className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <button
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-full border border-purple/30 bg-purple px-4 py-3 text-sm font-bold text-white shadow-xl shadow-purple/20 hover:bg-purple/90"
        aria-label="Open voice agent"
      >
        <Mic2 className="h-4 w-4" />
        Voice brief
      </button>
    </div>
  );
}
