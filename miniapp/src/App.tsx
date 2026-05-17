import { useEffect, useState } from "react";
import { initTelegram, isDev, tg } from "./telegram";
import { api, auth, type Transaction, type CategoryAgg } from "./api";
import { Login } from "./Login";

const COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E2", "#F8B739", "#52BE80"];

const fmtIDR = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const fmtDate = (sec: number) =>
  new Date(sec * 1000).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });

type AuthState = "checking" | "loggedIn" | "loggedOut";

export function App() {
  const [authState, setAuthState] = useState<AuthState>("checking");

  useEffect(() => {
    initTelegram();
    // Kalau di dalam Telegram Mini App → langsung loggedIn (auth lewat initData)
    // Kalau di browser biasa → cek JWT
    if (!isDev() || auth.getToken()) {
      setAuthState("loggedIn");
    } else {
      setAuthState("loggedOut");
    }
  }, []);

  if (authState === "checking") {
    return <div style={{ padding: 40, textAlign: "center" }}>Loading…</div>;
  }

  if (authState === "loggedOut") {
    return <Login onLogin={() => setAuthState("loggedIn")} />;
  }

  return <Dashboard onLogout={() => { auth.clear(); setAuthState("loggedOut"); }} />;
}

// Pure SVG donut chart (no external lib)
function DonutChart({ data, colors }: { data: { name: string; value: number }[]; colors: string[] }) {
  const size = 180;
  const stroke = 36;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;
  let offset = 0;
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
      <svg width={size} height={size}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {data.map((d, i) => {
            const frac = d.value / total;
            const dash = frac * c;
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={colors[i % colors.length]}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return el;
          })}
        </g>
        <text x={size / 2} y={size / 2 - 4} textAnchor="middle" fontSize="12" opacity="0.6">
          Total
        </text>
        <text x={size / 2} y={size / 2 + 16} textAnchor="middle" fontSize="16" fontWeight="700">
          Rp {Math.round(total / 1000)}rb
        </text>
      </svg>
    </div>
  );
}

type Period = "month" | "week" | "all";

function periodRange(p: Period): { from?: number; to?: number; label: string } {
  const now = Math.floor(Date.now() / 1000);
  // Asia/Jakarta = UTC+7
  const tzOffset = 7 * 3600;
  const dayStartUtc = Math.floor((Date.now() + tzOffset * 1000) / 86400000) * 86400 - tzOffset;
  if (p === "week") {
    return { from: dayStartUtc - 6 * 86400, to: now + 1, label: "7 hari terakhir" };
  }
  if (p === "month") {
    const d = new Date();
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    const monthStart = Math.floor(Date.UTC(y, m, 1) / 1000) - tzOffset;
    return { from: monthStart, to: now + 1, label: "Bulan ini" };
  }
  return { from: 0, to: now + 1, label: "Semua" };
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [period, setPeriod] = useState<Period>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ total: number; count: number; byCategory: CategoryAgg[] } | null>(null);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const r = periodRange(period);
    Promise.all([api.summary(r.from, r.to), api.transactions(r.from, r.to)])
      .then(([s, t]) => {
        setSummary(s);
        setTxns(t.transactions);
        setError(null);
      })
      .catch((e) => {
        if (String(e).includes("UNAUTHORIZED")) {
          onLogout();
        } else {
          setError(String(e));
        }
      })
      .finally(() => setLoading(false));
  }, [period]);

  const onDelete = async (id: number) => {
    const w = tg();
    const doDelete = async () => {
      await api.deleteTransaction(id);
      setTxns((arr) => arr.filter((t) => t.id !== id));
      w?.HapticFeedback?.notificationOccurred("success");
    };
    if (w) {
      w.showConfirm(`Hapus transaksi #${id}?`, (ok) => ok && doDelete());
    } else {
      if (confirm(`Hapus transaksi #${id}?`)) doDelete();
    }
  };

  if (error) return <div style={styles.center}>{error}</div>;

  const filtered = filter
    ? txns.filter((t) => t.category_name === filter)
    : txns;

  const chartData = (summary?.byCategory ?? [])
    .filter((c) => c.total > 0 && c.name)
    .map((c) => ({ name: c.name!, value: c.total, icon: c.icon }));

  const periodLabel = periodRange(period).label;

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <button style={styles.logoutBtn} onClick={onLogout} title="Logout">⏻</button>
        <div style={styles.headerLabel}>Total — {periodLabel}</div>
        <div style={styles.headerAmount}>{fmtIDR(summary?.total ?? 0)}</div>
        <div style={styles.headerSub}>{summary?.count ?? 0} transaksi</div>
        <div style={styles.periodTabs}>
          {(["all", "month", "week"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                ...styles.periodTab,
                background: period === p ? "rgba(255,255,255,0.3)" : "transparent",
                fontWeight: period === p ? 600 : 400,
              }}
            >
              {p === "all" ? "Semua" : p === "month" ? "Bulan ini" : "7 hari"}
            </button>
          ))}
        </div>
      </header>

      {loading && <div style={styles.center}>Memuat…</div>}

      {!loading && chartData.length > 0 && (
        <section style={styles.section}>
          <h3 style={styles.h3}>📊 Per Kategori</h3>
          <DonutChart data={chartData} colors={COLORS} />
          <div style={styles.legend}>
            {chartData.map((c, i) => {
              const pct = (summary?.total ?? 0) > 0
                ? (c.value / (summary!.total)) * 100
                : 0;
              return (
                <button
                  key={c.name}
                  onClick={() => setFilter(filter === c.name ? null : c.name)}
                  style={{
                    ...styles.legendItem,
                    background: filter === c.name ? "#667eea" : "transparent",
                    color: filter === c.name ? "#fff" : "inherit",
                  }}
                >
                  <span style={{ background: COLORS[i % COLORS.length], ...styles.swatch }} />
                  <span style={{ flex: 1, textAlign: "left" }}>
                    <div>{c.icon ?? ""} {c.name}</div>
                    <div style={styles.barBg}>
                      <div style={{ ...styles.barFill, background: COLORS[i % COLORS.length], width: `${pct}%` }} />
                    </div>
                  </span>
                  <span style={{ opacity: 0.75, whiteSpace: "nowrap" }}>{fmtIDR(c.value)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {!loading && chartData.length === 0 && (
        <div style={styles.empty}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>📝</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Belum ada transaksi</div>
          <div style={{ fontSize: 13, opacity: 0.6 }}>
            Chat bot di Telegram untuk mulai mencatat
          </div>
        </div>
      )}

      <section style={styles.section}>
        <h3 style={styles.h3}>
          🧾 Transaksi {filter && <span style={{ fontWeight: "normal", opacity: 0.7 }}>· {filter}</span>}
        </h3>
        {filtered.length === 0 && txns.length > 0 && (
          <div style={{ opacity: 0.6, fontSize: 13 }}>Tidak ada transaksi di kategori ini.</div>
        )}
        {filtered.map((t) => (
          <div key={t.id} style={styles.txn}>
            <div style={styles.txnIcon}>{t.category_icon ?? "📦"}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={styles.txnTitle}>
                {t.merchant ?? t.description ?? "Tanpa nama"}
              </div>
              <div style={styles.txnMeta}>
                {fmtDate(t.occurred_at)} · {t.category_name ?? "Tanpa kategori"}
                {t.payment_method ? ` · ${t.payment_method}` : ""}
              </div>
            </div>
            <div style={styles.txnAmount}>{fmtIDR(t.amount)}</div>
            <button onClick={() => onDelete(t.id)} style={styles.delBtn} title="Hapus">×</button>
          </div>
        ))}
      </section>

      <footer style={styles.footer}>
        DuitKu · Free forever 💛 ·{" "}
        <a href="https://t.me/Moneymanaget_bot" target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
          Bot
        </a>
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  app: { maxWidth: 600, margin: "0 auto", padding: 0, paddingBottom: 40 },
  header: {
    padding: "32px 20px 24px",
    textAlign: "center",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "#fff",
    position: "relative",
  },
  logoutBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    background: "rgba(255,255,255,0.2)",
    border: "none",
    color: "#fff",
    width: 32,
    height: 32,
    borderRadius: "50%",
    fontSize: 16,
    cursor: "pointer",
  },
  headerLabel: { fontSize: 13, opacity: 0.85, marginBottom: 4 },
  headerAmount: { fontSize: 32, fontWeight: 700, letterSpacing: -0.5 },
  headerSub: { fontSize: 13, opacity: 0.85, marginTop: 4 },
  section: { padding: "16px 16px 0" },
  h3: { fontSize: 15, margin: "16px 0 12px", opacity: 0.85 },
  legend: { display: "flex", flexDirection: "column", gap: 4, marginTop: 12 },
  legendItem: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 12px", borderRadius: 8, border: "none", cursor: "pointer",
    width: "100%", textAlign: "left", fontSize: 14,
  },
  swatch: { width: 12, height: 12, borderRadius: 3, display: "inline-block" },
  empty: { padding: "60px 20px", textAlign: "center" },
  txn: {
    display: "flex", alignItems: "center", gap: 12,
    padding: "12px 4px",
    borderBottom: "1px solid var(--tg-theme-hint-color, #e5e5e5)",
  },
  txnIcon: { fontSize: 24, width: 32, textAlign: "center" },
  txnTitle: { fontSize: 15, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  txnMeta: { fontSize: 12, opacity: 0.65, marginTop: 2 },
  txnAmount: { fontSize: 15, fontWeight: 600, whiteSpace: "nowrap" },
  delBtn: {
    background: "transparent", border: "none", fontSize: 20,
    opacity: 0.4, cursor: "pointer", padding: "0 4px",
    color: "inherit",
  },
  center: { padding: 40, textAlign: "center", opacity: 0.7 },
  footer: { textAlign: "center", padding: 24, fontSize: 12, opacity: 0.5 },
  periodTabs: {
    display: "flex", gap: 4, justifyContent: "center", marginTop: 16,
  },
  periodTab: {
    padding: "6px 16px", borderRadius: 16, border: "none",
    color: "#fff", cursor: "pointer", fontSize: 13,
    transition: "background 0.2s",
  },
  barBg: {
    height: 4, background: "#eee", borderRadius: 2, marginTop: 4, overflow: "hidden",
  },
  barFill: {
    height: "100%", borderRadius: 2, transition: "width 0.4s",
  },
};
