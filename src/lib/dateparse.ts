// Deterministic date parser untuk text mentah dari nota Indonesia.
// Tujuan: hilangkan halusinasi tahun dari LLM.

/**
 * Parse raw date text (apa adanya dari nota) → ISO YYYY-MM-DD.
 * Konteks Indonesia: format selalu DD-MM-YYYY atau DD/MM/YY.
 * Returns null kalau tidak bisa parse, ambigu, atau di luar range valid.
 *
 * Aturan:
 * - Format dipisahin: -, /, .,  spasi
 * - Year 2 digit: pilih tahun yang valid (dalam range [today-1y, today])
 *   - Misal today=2026-05-17, "25" → 2025; "26" → 2026; "23" → null (>1y lalu)
 * - Year 4 digit: pakai apa adanya
 * - Validate: date harus dalam [today - 1 tahun, today + 7 hari]
 */
export function parseReceiptDateRaw(
  raw: string | null | undefined,
  today: Date = new Date(),
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Match numeric date DD<sep>MM<sep>YY(YY)
  const m = trimmed.match(/(\d{1,2})\s*[\.\-\/]\s*(\d{1,2})\s*[\.\-\/]\s*(\d{2,4})/);
  if (!m) return null;

  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  let year = parseInt(m[3], 10);

  if (!(day >= 1 && day <= 31)) return null;
  if (!(month >= 1 && month <= 12)) return null;

  const todayY = today.getUTCFullYear();
  const minYear = todayY - 1;
  const maxYear = todayY + 1;

  if (year < 100) {
    // 2-digit year. Coba 2 kandidat: 20YY dan 19YY.
    const candidates = [2000 + year, 1900 + year];
    // Filter yang valid (dalam range minYear..maxYear) lalu pilih yang TIDAK di masa depan
    const valid = candidates.filter((y) => y >= minYear && y <= maxYear);
    if (valid.length === 0) return null;
    // Pilih tahun terbaru yang ≤ today's year (prefer past, not future)
    valid.sort((a, b) => b - a);
    year = valid.find((y) => y <= todayY) ?? valid[0];
  }

  // Build UTC date
  const dateMs = Date.UTC(year, month - 1, day, 12, 0, 0);
  if (isNaN(dateMs)) return null;
  const dateSec = Math.floor(dateMs / 1000);

  // Validate range
  const todaySec = Math.floor(today.getTime() / 1000);
  const minSec = todaySec - 366 * 86400;
  const maxSec = todaySec + 7 * 86400;
  if (dateSec < minSec || dateSec > maxSec) return null;

  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * Self-test (run manually): expects truthy results based on today's date.
 * Kept inline for documentation, not exported automatically.
 */
export function _selfTest(): void {
  const today = new Date("2026-05-17T12:00:00Z");
  const cases: Array<[string | null, string | null]> = [
    ["10-10-2025", "2025-10-10"],     // 4-digit YYYY
    ["11.10.25", "2025-10-11"],       // 2-digit YY → 2025
    ["1/10/25", "2025-10-01"],        // 2-digit, slash
    ["10-10-2005", null],             // > 1 tahun lalu
    ["10-10-2030", null],             // future
    ["", null],
    [null, null],
    ["abc", null],
    ["32-13-2025", null],             // invalid day/month
    ["07/05/26", "2026-05-07"],       // 2-digit YY = today's year
    ["17 5 26", "2026-05-17"],        // space separated
    ["20-05-25", "2025-05-20"],       // 2-digit YY → 2025
  ];
  for (const [input, expected] of cases) {
    const got = parseReceiptDateRaw(input, today);
    const ok = got === expected;
    console.log(`${ok ? "✓" : "✗"} ${JSON.stringify(input)} → ${got} (expected ${expected})`);
  }
}
