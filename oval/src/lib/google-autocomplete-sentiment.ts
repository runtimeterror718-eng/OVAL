export type AutocompleteSentiment = "positive" | "neutral" | "warning" | "negative";

const PW_AUTOCOMPLETE_OVERRIDES: Record<string, AutocompleteSentiment> = {
  "physics wallah": "neutral",
  "pw vidyapeeth faridabad": "neutral",
  "alakh pandey net worth": "warning",
  "pw complaint status": "neutral",
  "pw refund policy in hindi": "neutral",
  "pw refund form link": "neutral",
  "pw refund policy for offline": "neutral",
  "pw refund customer care number": "neutral",
  "pw refund policy online": "neutral",
  "pw refund policy for books": "neutral",
  "pw refund form": "neutral",
  "pw refund helpline number": "neutral",
  "pw refund policy": "neutral",
  "password scams on facebook": "neutral",
  "physicswallah worth": "neutral",
};

function normalizeSuggestion(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function getPwAutocompleteOverride(suggestion: string) {
  return PW_AUTOCOMPLETE_OVERRIDES[normalizeSuggestion(suggestion)];
}

export function classifyPwAutocompleteSentiment(suggestion: string): AutocompleteSentiment {
  const normalized = normalizeSuggestion(suggestion);
  const override = PW_AUTOCOMPLETE_OVERRIDES[normalized];
  if (override) return override;

  if (/\b(scam|fraud|fake|cheat|consumer court|complaint|complaints|lawsuit|case against)\b/.test(normalized)) {
    return "negative";
  }

  if (/\b(net worth|controversy|refund|salary|customer care|helpline|worth)\b/.test(normalized)) {
    return "warning";
  }

  if (/\b(best|good|success|result|scholarship|vidyapeeth|admission|course|batch|app)\b/.test(normalized)) {
    return "positive";
  }

  return "neutral";
}

export function withPwAutocompleteSentiment<T extends { suggestion?: string; sentiment?: string | null }>(item: T) {
  const suggestion = String(item.suggestion || "");
  return {
    ...item,
    sentiment: getPwAutocompleteOverride(suggestion) || item.sentiment || classifyPwAutocompleteSentiment(suggestion),
  };
}
