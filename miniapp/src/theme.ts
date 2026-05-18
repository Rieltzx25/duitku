// Design tokens — consistent across app
export const theme = {
  color: {
    bg: "#fff",
    bgSecondary: "#f8f9fb",
    bgTertiary: "#f0f2f5",
    text: "#1a1d24",
    textMuted: "#6b7280",
    textSubtle: "#9ca3af",
    border: "#e5e7eb",
    borderLight: "#f3f4f6",
    primary: "#667eea",
    primaryDark: "#5568d3",
    primaryGradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    success: "#10b981",
    successBg: "#d1fae5",
    warning: "#f59e0b",
    warningBg: "#fef3c7",
    danger: "#ef4444",
    dangerBg: "#fee2e2",
    info: "#3b82f6",
    infoBg: "#dbeafe",
  },
  // chart palette (categorical)
  chart: [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8",
    "#F7DC6F", "#BB8FCE", "#85C1E2", "#F8B739", "#52BE80",
  ],
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 },
  radius: { sm: 6, md: 10, lg: 14, xl: 20, full: 9999 },
  font: {
    size: { xs: 11, sm: 12, md: 14, lg: 16, xl: 18, "2xl": 24, "3xl": 32 },
    weight: { normal: 400, medium: 500, semibold: 600, bold: 700 },
  },
  shadow: {
    sm: "0 1px 2px rgba(0,0,0,0.05)",
    md: "0 2px 8px rgba(0,0,0,0.08)",
    lg: "0 8px 24px rgba(0,0,0,0.12)",
    xl: "0 20px 50px rgba(0,0,0,0.2)",
  },
  duration: { fast: "0.15s", normal: "0.25s", slow: "0.4s" },
};

export const fmtIDR = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

export const fmtIDRShort = (n: number) => {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}rb`;
  return `Rp ${Math.round(n)}`;
};

export const fmtDate = (sec: number, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" }) =>
  new Date(sec * 1000).toLocaleDateString("id-ID", opts);

export const fmtDateLong = (sec: number) =>
  new Date(sec * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

export const fmtRelative = (sec: number) => {
  const now = Date.now() / 1000;
  const diff = now - sec;
  if (diff < 60) return "baru saja";
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} hari lalu`;
  return fmtDate(sec);
};
