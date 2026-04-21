// Regular US equities session: Mon–Fri 9:30 AM – 4:00 PM ET.
// TODO: account for US market holidays (NYSE calendar). For now, holidays
// fall through to the off-hours UI guardrail, which is safe.

export function isUSMarketOpen(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = get("weekday");
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));

  if (weekday === "Sat" || weekday === "Sun") return false;

  const mins = hour * 60 + minute;
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}
