export const nowSec = (): number => Math.floor(Date.now() / 1000);

// Hitung offset dari UTC ke timezone target (dalam detik)
function tzOffsetSec(tz: string): number {
  const now = new Date();
  const utcParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const tzParts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (parts: Intl.DateTimeFormatPart[], type: string) =>
    parseInt(parts.find((p) => p.type === type)!.value);
  const utcMs = Date.UTC(
    get(utcParts, "year"), get(utcParts, "month") - 1, get(utcParts, "day"),
    get(utcParts, "hour") === 24 ? 0 : get(utcParts, "hour"),
    get(utcParts, "minute"), get(utcParts, "second"),
  );
  const tzMs = Date.UTC(
    get(tzParts, "year"), get(tzParts, "month") - 1, get(tzParts, "day"),
    get(tzParts, "hour") === 24 ? 0 : get(tzParts, "hour"),
    get(tzParts, "minute"), get(tzParts, "second"),
  );
  return Math.round((tzMs - utcMs) / 1000);
}

export const startOfDayLocalSec = (tz: string, ref: Date = new Date()): number => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(ref);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  const offset = tzOffsetSec(tz);
  const utcMs = Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d), 0, 0, 0);
  return Math.floor(utcMs / 1000) - offset;
};

export const startOfMonthSec = (tz: string, ref: Date = new Date()): number => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit",
  }).formatToParts(ref);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const offset = tzOffsetSec(tz);
  const utcMs = Date.UTC(parseInt(y), parseInt(m) - 1, 1, 0, 0, 0);
  return Math.floor(utcMs / 1000) - offset;
};

export const startOfPrevMonthSec = (tz: string, ref: Date = new Date()): number => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit",
  }).formatToParts(ref);
  let y = parseInt(parts.find((p) => p.type === "year")!.value);
  let m = parseInt(parts.find((p) => p.type === "month")!.value);
  m -= 1;
  if (m === 0) { m = 12; y -= 1; }
  const offset = tzOffsetSec(tz);
  const utcMs = Date.UTC(y, m - 1, 1, 0, 0, 0);
  return Math.floor(utcMs / 1000) - offset;
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
