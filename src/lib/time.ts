export const nowSec = (): number => Math.floor(Date.now() / 1000);

export const startOfMonthSec = (tz: string, ref: Date = new Date()): number => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ref);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  // Build local midnight first of month, convert back
  // Simpler: assume tz offset is consistent in same month
  const iso = `${y}-${m}-01T00:00:00`;
  // We need offset for tz. Use trick: format the same moment in tz to get offset.
  const tzNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: tz }),
  ).getTime();
  const offset = tzNow - Date.now();
  return Math.floor((new Date(iso).getTime() - offset) / 1000);
};

export const startOfPrevMonthSec = (tz: string, ref: Date = new Date()): number => {
  const d = new Date(ref);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return startOfMonthSec(tz, d);
};

export const formatIDR = (n: number): string => {
  if (n >= 1_000_000) {
    const jt = n / 1_000_000;
    return `Rp ${jt.toFixed(jt < 10 ? 2 : 1).replace(/\.0$/, "")}jt`;
  }
  if (n >= 1_000) {
    return `Rp ${Math.round(n / 1000)}rb`;
  }
  return `Rp ${Math.round(n)}`;
};

export const formatIDRFull = (n: number): string => {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
};

export const monthNameID = (date: Date, tz: string): string => {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: tz,
    month: "long",
    year: "numeric",
  }).format(date);
};

export const formatDateID = (sec: number, tz: string): string => {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: tz,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(sec * 1000));
};
