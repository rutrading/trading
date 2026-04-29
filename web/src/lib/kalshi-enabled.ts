/**
 * Server-side master kill switch. Mirrors the backend's KALSHI_ENABLED gate
 * so every UI entry point (sidebar nav, /kalshi page, settings + onboarding
 * create buttons, createKalshiAccount server action) reads the same source
 * of truth. Default true so a missing env var doesn't take Kalshi offline.
 */
export function isKalshiEnabled(): boolean {
  const raw = process.env.KALSHI_ENABLED;
  if (raw === undefined) return true;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}
