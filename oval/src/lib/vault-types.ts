export const VAULT_CHANNELS = ["playstore", "freshdesk", "linkedin", "x", "facebook", "instagram", "youtube", "reddit"] as const;
export type VaultChannel = (typeof VAULT_CHANNELS)[number];
export type VaultValence = "uplifting" | "tense" | "reflective" | "mixed";
export type VaultIntensity = "low" | "medium" | "high";
export type VaultSentiment = "positive" | "neutral" | "negative";
export type EvidencePeriod = "today" | "yesterday" | "7d" | "30d" | "month";

export type VaultTrack = {
  id: string;
  spotifyTrackId: string;
  spotifyUrl: string;
  embedUrl: string;
  title: string;
  artist: string;
  artworkUrl?: string | null;
  valence: VaultValence;
  intensity: VaultIntensity;
  themeTags: string[];
  channelScopes: VaultChannel[];
  priority: number;
  active: boolean;
};

export type VaultEvidenceSlide = {
  id: string;
  sourceRef: string;
  author: string;
  text: string;
  date?: string | null;
  sentiment: VaultSentiment;
  theme?: string | null;
  url?: string | null;
  sourceType?: "owned" | "external" | "support" | "review" | null;
  engagement?: number;
};

export type VaultMood = {
  channel: VaultChannel;
  period: EvidencePeriod;
  coverage: { from: string; to: string; signalCount: number };
  sentiment: { positive: number; neutral: number; negative: number };
  dominantTheme: { name: string; summary: string; clusterIds: string[] };
  mood: {
    valence: VaultValence;
    intensity: VaultIntensity;
    label: string;
    explanation: string;
    confidence: number;
  };
  track: VaultTrack | null;
  slides: VaultEvidenceSlide[];
  algorithmVersion: string;
  warnings: string[];
};

export const VAULT_CHANNEL_META: Record<VaultChannel, { label: string; icon: string }> = {
  playstore: { label: "Play Store", icon: "/platform-icons/play-store.png" },
  freshdesk: { label: "Fresh Desk", icon: "/platform-icons/freshdesk.webp" },
  linkedin: { label: "LinkedIn", icon: "/platform-icons/linkedin.png" },
  x: { label: "X", icon: "/platform-icons/x.svg" },
  facebook: { label: "Facebook", icon: "/platform-icons/facebook.svg" },
  instagram: { label: "Instagram", icon: "/platform-icons/instagram.svg" },
  youtube: { label: "YouTube", icon: "/platform-icons/youtube.webp" },
  reddit: { label: "Reddit", icon: "/platform-icons/reddit.webp" },
};
