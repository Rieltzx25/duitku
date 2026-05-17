import { useEffect, useState } from "react";
import { initTelegram, isDev, tg } from "./telegram";
import { api, type Transaction, type CategoryAgg } from "./api";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E2", "#F8B739", "#52BE80"];

const fmtIDR = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const fmtDate = (sec: number) =>
  new Date(sec * 1000).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });

export function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ total: number; count: number; byCategory: CategoryAgg[] } | null>(null);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    initTelegram();
    if (isDev()) {
      setError("Mode dev: buka via Telegram bot untuk akses data nyata.");
      setLoading(false);
      return;
    }
    Promise.all([api.summary(), api.transactions()])
      .then(([s, t]) => {
        setSummary(s);
        setTxns(t.transactions);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

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

  if (loading) return <div style={styles.center}>Loading…</div>;
  if (error) return <div style={styles.center}>{error}</div>;

  const filtered = filter
    ? txns.filter((t) => t.category_name === filter)
    : txns;

  const chartData = (summary?.byCategory ?? [])
    .filter((c) => c.total > 0 && c.name)
    .map((c) => ({ name: c.name!, value: c.total, icon: c.icon }));

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={styles.headerLabel}>Total bulan ini</div>
        <div style={styles.headerAmount}>{fmtIDR(summary?.total ?? 0)}</div>
        <div style={styles.headerSub}>{summary?.count ?? 0} transaksi</div>
      </header>

      {chartData.length > 0 && (
        <section style={styles.section}>
          <h3 style={styles.h3}>📊 Per Kategori</h3>
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={chartData}
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                >
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => fmtIDR(v as number)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={styles.legend}>
            {chartData.map((c, i) => (
              <button
                key={c.name}
                onClick={() => setFilter(filter === c.name ? null : c.name)}
                style={{
                  ...styles.legendItem,
                  background: filter === c.name ? "var(--tg-theme-button-color, #2481cc)" : "transparent",
                  color: filter === c.name ? "var(--tg-theme-button-text-color, #fff)" : "inherit",
                }}
              >
                <span style={{ background: COLORS[i % COLORS.length], ...styles.swatch }} />
                <span style={{ flex: 1 }}>{c.icon ?? ""} {c.name}</span>
                <span style={{ opacity: 0.7 }}>{fmtIDR(c.value)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section style={styles.section}>
        <h3 style={styles.h3}>
          🧾 Transaksi {filter && <span style={{ fontWeight: "normal", opacity: 0.7 }}>· {filter}</span>}
        </h3>
        {filtered.length === 0 && <div style={{ opacity: 0.6 }}>Belum ada transaksi.</div>}
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
        DuitKu · Free forever 💛
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
  },
  headerLabel: { fontSize: 13, opacity: 0.85, marginBottom: 4 },
  headerAmount: { fontSize: 32, fontWeight: 700, letterSpacing: -0.5 },
  headerSub: { fontSize: 13, opacity: 0.85, marginTop: 4 },
  section: { padding: "16px 16px 0" },
  h3: { fontSize: 15, margin: "16px 0 12px", opacity: 0.85 },
  legend: { display: "flex", flexDirection: "column", gap: 4, marginTop: 12 },
  legendItem: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "8px 10px", borderRadius: 8, border: "none", cursor: "pointer",
    width: "100%", textAlign: "left", fontSize: 14,
  },
  swatch: { width: 12, height: 12, borderRadius: 3, display: "inline-block" },
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
};
