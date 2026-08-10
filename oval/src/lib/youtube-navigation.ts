export const PW_YTVERSE_URL = "https://pw-ytverse.vercel.app/login";

export function openPwYtVerse() {
  if (typeof window === "undefined") return;
  document.documentElement.classList.add("ai-opening-ytverse");
  window.setTimeout(() => window.location.assign(PW_YTVERSE_URL), 220);
}
