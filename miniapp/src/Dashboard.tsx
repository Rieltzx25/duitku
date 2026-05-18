import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { api, auth, type Transaction, type Budget, type Category, type Comparison } from "./api";
import { theme, fmtIDR, fmtIDRShort, fmtDate, fmtDateLong } from "./theme";
import { Button, Card, EmptyState, Field, Input, Modal, Select, Skeleton, toast } from "./ui";
import { DonutChart, LineChart, ProgressBar } from "./charts";

type Tab = "overview" | "transactions" | "budget" | "settings";
type Period = "month" | "week" | "all";

function periodRange(p: Period): { from: number; to: number; label: string } {
  const now = Math.floor(Date.now() / 1000);
  const tzOffset = 7 * 3600;
  if (p === "week") {
    const todayStartUtc = Math.floor((Date.now() + tzOffset * 1000) / 86400000) * 86400 - tzOffset;
    return { from: todayStartUtc - 6 * 86400, to: now + 1, label: "7 hari terakhir" };
  }
  if (p === "month") {
    const d = new Date();
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    const monthStart = Math.floor(Date.UTC(y, m, 1) / 1000) - tzOffset;
    return { from: monthStart, to: now + 1, label: "Bulan ini" };
  }
  return { from: 0, to: now + 1, label: "Semua" };
}

export function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [period, setPeriod] = useState<Period>("month");
  const [categories, setCategories] = useState<Category[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    api.categories()
      .then((r) => setCategories(r.categories))
      .catch((e) => { if (String(e).includes("UNAUTHORIZED")) onLogout(); });
  }, []);

  return (
    <div style={styles.app}>
      <Header />

      <nav style={styles.tabnav} role="tablist">
        {([
          { k: "overview", l: "🏠 Overview" },
          { k: "transactions", l: "🧾 Transaksi" },
          { k: "budget", l: "💰 Budget" },
          { k: "settings", l: "⚙️ Pengaturan" },
        ] as { k: Tab; l: string }[]).map((t) => (
          <button
            key={t.k}
            role="tab"
            aria-selected={tab === t.k}
            onClick={() => setTab(t.k)}
            style={{
              ...styles.tabBtn,
              color: tab === t.k ? theme.color.primary : theme.color.textMuted,
              borderBottom: `2px solid ${tab === t.k ? theme.color.primary : "transparent"}`,
              fontWeight: tab === t.k ? 700 : 500,
            }}
          >
            {t.l}
          </button>
        ))}
      </nav>

      <main style={styles.content}>
        {tab === "overview" && <OverviewTab period={period} setPeriod={setPeriod} refreshKey={refreshKey} />}
        {tab === "transactions" && <TransactionsTab categories={categories} refresh={refresh} refreshKey={refreshKey} />}
        {tab === "budget" && <BudgetTab categories={categories} refreshKey={refreshKey} refresh={refresh} />}
        {tab === "settings" && <SettingsTab onLogout={onLogout} refresh={refresh} />}
      </main>
    </div>
  );
}

function Header() {
  return (
    <header style={styles.header}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={styles.logo}>💸</div>
        <div>
          <h1 style={styles.brand}>DuitKu</h1>
          <div style={styles.tagline}>Money tracker pribadimu</div>
        </div>
      </div>
    </header>
  );
}

// ───────── OVERVIEW TAB ─────────
function OverviewTab({ period, setPeriod, refreshKey }: { period: Period; setPeriod: (p: Period) => void; refreshKey: number }) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<{ total: number; count: number; byCategory: any[] } | null>(null);
  const [trend, setTrend] = useState<{ date: string; total: number }[]>([]);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [recent, setRecent] = useState<Transaction[]>([]);

  useEffect(() => {
    setLoading(true);
    const r = periodRange(period);
    Promise.all([
      api.summary(r.from, r.to),
      api.dailyTrend(r.from, r.to),
      api.comparison(),
      api.transactions(r.from, r.to),
    ])
      .then(([s, t, c, txns]) => {
        setSummary(s);
        setTrend(t.series.map((d) => ({ date: d.date, total: d.total })));
        setComparison(c);
        setRecent(txns.transactions.slice(0, 5));
      })
      .catch((e) => toast.error(String(e)))
      .finally(() => setLoading(false));
  }, [period, refreshKey]);

  const pct = comparison && comparison.lastMonth > 0
    ? ((comparison.thisMonth - comparison.lastMonth) / comparison.lastMonth) * 100
    : null;

  const chartData = (summary?.byCategory ?? [])
    .filter((c) => c.total > 0 && c.name)
    .map((c, i) => ({ name: c.name, value: c.total, color: theme.chart[i % theme.chart.length], icon: c.icon }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PeriodTabs value={period} onChange={setPeriod} />

      {/* KPI CARDS */}
      <div style={styles.kpiGrid}>
        <KpiCard
          label="Total periode"
          value={loading ? <Skeleton width={120} height={24} /> : fmtIDR(summary?.total ?? 0)}
          sub={loading ? <Skeleton width={70} height={12} /> : `${summary?.count ?? 0} transaksi`}
        />
        <KpiCard
          label="Bulan lalu"
          value={loading ? <Skeleton width={120} height={24} /> : fmtIDR(comparison?.lastMonth ?? 0)}
          sub={pct !== null ? (
            <span style={{ color: pct > 0 ? theme.color.danger : theme.color.success, fontWeight: 600 }}>
              {pct > 0 ? "↑" : "↓"} {Math.abs(pct).toFixed(0)}%
            </span>
          ) : "—"}
        />
        <KpiCard
          label="Avg per hari"
          value={loading ? <Skeleton width={120} height={24} /> : fmtIDRShort(comparison?.avgPerDay ?? 0)}
          sub={`${comparison?.dayInMonth ?? 0} hari`}
        />
      </div>

      {/* LINE CHART */}
      <Card>
        <SectionHeader title="📈 Tren Harian" subtitle={periodRange(period).label} />
        {loading ? <Skeleton height={180} /> : trend.length > 0 ? (
          <LineChart data={trend.map((d) => ({ date: d.date, value: d.total }))} />
        ) : (
          <EmptyState icon="📊" title="Belum ada data tren" body="Mulai catat transaksi untuk lihat tren harian kamu." />
        )}
      </Card>

      {/* DONUT */}
      {!loading && chartData.length > 0 && (
        <Card>
          <SectionHeader title="🍩 Pengeluaran per Kategori" />
          <DonutChart
            data={chartData}
            centerLabel="Total"
            centerValue={fmtIDRShort(summary?.total ?? 0)}
          />
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
            {chartData.map((c) => (
              <div key={c.name} style={styles.legendRow}>
                <span style={{ ...styles.dot, background: c.color }} />
                <span style={{ flex: 1 }}>{c.icon} {c.name}</span>
                <span style={{ fontWeight: 600 }}>{fmtIDR(c.value)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* RECENT */}
      <Card>
        <SectionHeader title="🕐 Transaksi Terbaru" />
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Array(3).fill(0).map((_, i) => <Skeleton key={i} height={48} />)}
          </div>
        ) : recent.length === 0 ? (
          <EmptyState icon="📝" title="Belum ada transaksi" body="Chat bot di Telegram atau klik tombol + di tab Transaksi." />
        ) : (
          recent.map((t) => <TxnRowSimple key={t.id} t={t} />)
        )}
      </Card>
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: theme.color.textMuted, fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 12, color: theme.color.textMuted }}>{sub}</div>
    </Card>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{title}</h3>
      {subtitle && <div style={{ fontSize: 12, color: theme.color.textMuted, marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

function PeriodTabs({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div style={styles.pillTabs} role="tablist" aria-label="Periode">
      {(["month", "week", "all"] as Period[]).map((p) => (
        <button
          key={p}
          role="tab"
          aria-selected={value === p}
          onClick={() => onChange(p)}
          style={{
            ...styles.pillBtn,
            background: value === p ? theme.color.primary : "transparent",
            color: value === p ? "#fff" : theme.color.textMuted,
            fontWeight: value === p ? 600 : 500,
          }}
        >
          {p === "month" ? "Bulan ini" : p === "week" ? "7 hari" : "Semua"}
        </button>
      ))}
    </div>
  );
}

function TxnRowSimple({ t }: { t: Transaction }) {
  return (
    <div style={styles.txnSimple}>
      <div style={styles.txnIcon}>{t.category_icon ?? "📦"}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={styles.txnTitle}>{t.merchant ?? t.description ?? "Tanpa nama"}</div>
        <div style={styles.txnMeta}>
          {fmtDate(t.occurred_at)} · {t.category_name ?? "Tanpa kategori"}
        </div>
      </div>
      <div style={styles.txnAmount}>{fmtIDR(t.amount)}</div>
    </div>
  );
}

// ───────── TRANSACTIONS TAB ─────────
function TransactionsTab({ categories, refresh, refreshKey }: { categories: Category[]; refresh: () => void; refreshKey: number }) {
  const [loading, setLoading] = useState(true);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("");
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [adding, setAdding] = useState(false);
  const [viewReceipt, setViewReceipt] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.transactions()
      .then((r) => setTxns(r.transactions))
      .catch((e) => toast.error(String(e)))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const filtered = useMemo(() => {
    let arr = txns;
    if (filter) arr = arr.filter((t) => t.category_name === filter);
    if (search) {
      const s = search.toLowerCase();
      arr = arr.filter((t) =>
        (t.merchant ?? "").toLowerCase().includes(s) ||
        (t.description ?? "").toLowerCase().includes(s) ||
        String(t.amount).includes(s),
      );
    }
    return arr;
  }, [txns, search, filter]);

  const categoryOptions = [{ value: "", label: "Semua kategori" }, ...categories.map((c) => ({ value: c.name, label: `${c.icon} ${c.name}` }))];

  const onDelete = async (id: number) => {
    if (!confirm(`Hapus transaksi #${id}? Tidak bisa di-undo.`)) return;
    try {
      await api.deleteTransaction(id);
      setTxns((arr) => arr.filter((t) => t.id !== id));
      toast.success("Transaksi dihapus");
    } catch (e) { toast.error(String(e)); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Card>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <Input
            value={search}
            onChange={setSearch}
            placeholder="🔍 Cari merchant, deskripsi, nominal..."
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Select value={filter} onChange={setFilter} options={categoryOptions} />
          <Button onClick={() => setAdding(true)} size="md">
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Tambah
          </Button>
        </div>
      </Card>

      <Card style={{ padding: 8 }}>
        {loading ? (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {Array(5).fill(0).map((_, i) => <Skeleton key={i} height={56} />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={txns.length === 0 ? "📝" : "🔍"}
            title={txns.length === 0 ? "Belum ada transaksi" : "Tidak ada hasil"}
            body={txns.length === 0 ? "Tambah transaksi pertama kamu via tombol di atas atau chat bot." : "Coba kata kunci atau filter lain."}
            action={txns.length === 0 && <Button onClick={() => setAdding(true)}>+ Tambah Transaksi</Button>}
          />
        ) : (
          <div>
            <div style={{ padding: "8px 12px", fontSize: 12, color: theme.color.textMuted }}>
              {filtered.length} transaksi · Total {fmtIDR(filtered.reduce((s, t) => s + t.amount, 0))}
            </div>
            {filtered.map((t) => (
              <TxnRow
                key={t.id} t={t}
                onEdit={() => setEditing(t)}
                onDelete={() => onDelete(t.id)}
                onViewReceipt={() => t.receipt_id && setViewReceipt(t.receipt_id)}
              />
            ))}
          </div>
        )}
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="✏️ Edit Transaksi"
        actions={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Batal</Button>
            {editing && <Button type="submit" onClick={() => document.getElementById("edit-form-submit")?.click()}>Simpan</Button>}
          </>
        }
      >
        {editing && (
          <TxnForm
            init={editing}
            categories={categories}
            onSubmit={async (data) => {
              try {
                await api.updateTransaction(editing.id, data);
                toast.success("Tersimpan");
                setEditing(null);
                refresh();
              } catch (e) { toast.error(String(e)); }
            }}
          />
        )}
      </Modal>

      <Modal open={adding} onClose={() => setAdding(false)} title="➕ Tambah Transaksi"
        actions={
          <>
            <Button variant="ghost" onClick={() => setAdding(false)}>Batal</Button>
            <Button onClick={() => document.getElementById("add-form-submit")?.click()}>Tambah</Button>
          </>
        }
      >
        <TxnForm
          formId="add-form-submit"
          categories={categories}
          onSubmit={async (data) => {
            try {
              await api.addTransaction({
                amount: data.amount!,
                merchant: data.merchant ?? undefined,
                description: data.description ?? undefined,
                categoryName: data.categoryName ?? undefined,
                occurredAt: data.occurredAt,
                paymentMethod: data.paymentMethod ?? undefined,
              });
              toast.success("Transaksi ditambahkan");
              setAdding(false);
              refresh();
            } catch (e) { toast.error(String(e)); }
          }}
        />
      </Modal>

      <Modal open={!!viewReceipt} onClose={() => setViewReceipt(null)} title="📸 Foto Nota" size="lg">
        {viewReceipt && (
          <img src={api.receiptUrl(viewReceipt)} alt="Receipt" style={{ width: "100%", borderRadius: 8 }} />
        )}
      </Modal>
    </div>
  );
}

function TxnRow({ t, onEdit, onDelete, onViewReceipt }: {
  t: Transaction; onEdit: () => void; onDelete: () => void; onViewReceipt: () => void;
}) {
  return (
    <div style={styles.txnRow}>
      <div style={styles.txnIcon}>{t.category_icon ?? "📦"}</div>
      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={onEdit}>
        <div style={styles.txnTitle}>{t.merchant ?? t.description ?? "Tanpa nama"}</div>
        <div style={styles.txnMeta}>
          {fmtDate(t.occurred_at)} · {t.category_name ?? "Tanpa kategori"}
          {t.payment_method ? ` · ${t.payment_method}` : ""}
          {t.receipt_id ? " · 📸" : ""}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        <div style={styles.txnAmount}>{fmtIDR(t.amount)}</div>
        <div style={{ display: "flex", gap: 4 }}>
          {t.receipt_id && (
            <button onClick={onViewReceipt} style={styles.iconBtn} title="Lihat nota">📸</button>
          )}
          <button onClick={onEdit} style={styles.iconBtn} title="Edit">✏️</button>
          <button onClick={onDelete} style={{ ...styles.iconBtn, color: theme.color.danger }} title="Hapus">🗑</button>
        </div>
      </div>
    </div>
  );
}

function TxnForm({ init, categories, onSubmit, formId = "edit-form-submit" }: {
  init?: Transaction;
  categories: Category[];
  onSubmit: (data: { amount?: number; merchant?: string | null; description?: string | null; categoryName?: string | null; occurredAt?: number; paymentMethod?: string | null }) => void;
  formId?: string;
}) {
  const [amount, setAmount] = useState(init ? String(init.amount) : "");
  const [merchant, setMerchant] = useState(init?.merchant ?? "");
  const [description, setDescription] = useState(init?.description ?? "");
  const [categoryName, setCategoryName] = useState(init?.category_name ?? "");
  const [paymentMethod, setPaymentMethod] = useState(init?.payment_method ?? "");
  const [date, setDate] = useState(init ? new Date(init.occurred_at * 1000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount.replace(/[.,]/g, ""));
    if (!amt || amt <= 0) { toast.error("Nominal harus > 0"); return; }
    onSubmit({
      amount: amt,
      merchant: merchant || null,
      description: description || null,
      categoryName: categoryName || null,
      occurredAt: Math.floor(new Date(date + "T12:00:00").getTime() / 1000),
      paymentMethod: paymentMethod || null,
    });
  };

  return (
    <form onSubmit={submit}>
      <Field label="Nominal (Rp)">
        <Input value={amount} onChange={setAmount} placeholder="50000" inputMode="numeric" autoFocus={!init} />
      </Field>
      <Field label="Merchant / Toko" hint="Opsional">
        <Input value={merchant} onChange={setMerchant} placeholder="Starbucks" />
      </Field>
      <Field label="Deskripsi" hint="Opsional">
        <Input value={description} onChange={setDescription} placeholder="kopi sore" />
      </Field>
      <Field label="Kategori">
        <Select
          value={categoryName}
          onChange={setCategoryName}
          options={[{ value: "", label: "— pilih —" }, ...categories.map((c) => ({ value: c.name, label: `${c.icon} ${c.name}` }))]}
        />
      </Field>
      <Field label="Tanggal">
        <Input value={date} onChange={setDate} type="date" />
      </Field>
      <Field label="Metode Bayar" hint="Opsional, mis. Cash, QRIS, Debit BCA">
        <Input value={paymentMethod} onChange={setPaymentMethod} placeholder="Cash" />
      </Field>
      <button id={formId} type="submit" style={{ display: "none" }} />
    </form>
  );
}

// ───────── BUDGET TAB ─────────
function BudgetTab({ categories, refresh, refreshKey }: { categories: Category[]; refresh: () => void; refreshKey: number }) {
  const [loading, setLoading] = useState(true);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);

  useEffect(() => {
    setLoading(true);
    api.budgets()
      .then((r) => setBudgets(r.budgets))
      .catch((e) => toast.error(String(e)))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const onDelete = async (id: number) => {
    if (!confirm("Hapus budget ini?")) return;
    try {
      await api.deleteBudget(id);
      setBudgets((arr) => arr.filter((b) => b.id !== id));
      toast.success("Budget dihapus");
    } catch (e) { toast.error(String(e)); }
  };

  // Filter categories yang sudah ada budget-nya (utk modal add)
  const availableCategories = categories.filter((c) => !budgets.some((b) => b.categoryId === c.id));
  const hasOverall = budgets.some((b) => b.categoryId === null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Card>
        <SectionHeader title="💰 Budget Bulanan" subtitle="Set limit per kategori. Bot akan kirim alert kalau mendekati limit." />
        <Button onClick={() => setAdding(true)} fullWidth>
          <span style={{ fontSize: 18 }}>+</span> Tambah Budget
        </Button>
      </Card>

      {loading ? (
        <Card><Skeleton height={80} /></Card>
      ) : budgets.length === 0 ? (
        <EmptyState
          icon="🎯"
          title="Belum ada budget"
          body="Set budget untuk kategori-kategori utama kamu biar bisa dimonitor."
          action={<Button onClick={() => setAdding(true)}>+ Budget Pertama</Button>}
        />
      ) : (
        budgets.map((b) => (
          <Card key={b.id}>
            <BudgetItem budget={b} onEdit={() => setEditing(b)} onDelete={() => onDelete(b.id)} />
          </Card>
        ))
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="🎯 Tambah Budget"
        actions={
          <>
            <Button variant="ghost" onClick={() => setAdding(false)}>Batal</Button>
            <Button onClick={() => document.getElementById("budget-form-submit")?.click()}>Tambah</Button>
          </>
        }
      >
        <BudgetForm
          availableCategories={availableCategories}
          hasOverall={hasOverall}
          onSubmit={async (data) => {
            try {
              await api.setBudget(data.categoryId, data.amount);
              toast.success("Budget di-set");
              setAdding(false);
              refresh();
            } catch (e) { toast.error(String(e)); }
          }}
        />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="✏️ Edit Budget"
        actions={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Batal</Button>
            <Button onClick={() => document.getElementById("budget-edit-submit")?.click()}>Simpan</Button>
          </>
        }
      >
        {editing && (
          <BudgetForm
            availableCategories={categories}
            hasOverall={false}
            formId="budget-edit-submit"
            init={{ categoryId: editing.categoryId, amount: editing.amount }}
            disableCategory
            onSubmit={async (data) => {
              try {
                await api.setBudget(data.categoryId, data.amount);
                toast.success("Budget diupdate");
                setEditing(null);
                refresh();
              } catch (e) { toast.error(String(e)); }
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function BudgetItem({ budget, onEdit, onDelete }: { budget: Budget; onEdit: () => void; onDelete: () => void }) {
  const pct = budget.amount > 0 ? (budget.spent / budget.amount) * 100 : 0;
  const label = budget.categoryName ? `${budget.categoryIcon ?? ""} ${budget.categoryName}` : "💵 Overall";
  const status = pct >= 100 ? "danger" : pct >= 80 ? "warning" : "ok";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{label}</div>
          <div style={{ fontSize: 13, color: theme.color.textMuted, marginTop: 2 }}>
            {fmtIDR(budget.spent)} dari {fmtIDR(budget.amount)} · sisa {fmtIDR(Math.max(0, budget.amount - budget.spent))}
          </div>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: status === "danger" ? theme.color.danger : status === "warning" ? theme.color.warning : theme.color.success }}>
          {pct.toFixed(0)}%
        </div>
      </div>
      <ProgressBar value={budget.spent} max={budget.amount} />
      <div style={{ display: "flex", gap: 6, marginTop: 10, justifyContent: "flex-end" }}>
        <Button variant="ghost" size="sm" onClick={onEdit}>Edit</Button>
        <Button variant="ghost" size="sm" onClick={onDelete} style={{ color: theme.color.danger }}>Hapus</Button>
      </div>
    </div>
  );
}

function BudgetForm({
  availableCategories, hasOverall, onSubmit, formId = "budget-form-submit", init, disableCategory,
}: {
  availableCategories: Category[];
  hasOverall: boolean;
  onSubmit: (data: { categoryId: number | null; amount: number }) => void;
  formId?: string;
  init?: { categoryId: number | null; amount: number };
  disableCategory?: boolean;
}) {
  const [categoryId, setCategoryId] = useState<string>(init ? (init.categoryId === null ? "overall" : String(init.categoryId)) : (hasOverall ? "" : "overall"));
  const [amount, setAmount] = useState(init ? String(init.amount) : "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId) { toast.error("Pilih kategori"); return; }
    const amt = parseFloat(amount.replace(/[.,]/g, ""));
    if (!amt || amt <= 0) { toast.error("Nominal harus > 0"); return; }
    onSubmit({
      categoryId: categoryId === "overall" ? null : parseInt(categoryId),
      amount: amt,
    });
  };

  const opts = [
    ...(!hasOverall ? [{ value: "overall", label: "💵 Overall (semua kategori)" }] : []),
    ...availableCategories.map((c) => ({ value: String(c.id), label: `${c.icon} ${c.name}` })),
  ];

  return (
    <form onSubmit={submit}>
      <Field label="Kategori">
        <Select value={categoryId} onChange={setCategoryId} options={[{ value: "", label: "— pilih kategori —" }, ...opts]} />
      </Field>
      <Field label="Budget per bulan (Rp)" hint="Bot akan kirim alert saat 50%, 80%, 100% terpakai">
        <Input value={amount} onChange={setAmount} placeholder="1500000" inputMode="numeric" autoFocus />
      </Field>
      <button id={formId} type="submit" style={{ display: "none" }} />
    </form>
  );
}

// ───────── SETTINGS TAB ─────────
function SettingsTab({ onLogout, refresh }: { onLogout: () => void; refresh: () => void }) {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<{ budgetAlertsEnabled: boolean; weeklyInsightsEnabled: boolean; monthlySummaryEnabled: boolean } | null>(null);

  useEffect(() => {
    api.settings()
      .then(setSettings)
      .catch((e) => toast.error(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const toggle = async (key: keyof NonNullable<typeof settings>, value: boolean) => {
    if (!settings) return;
    const next = { ...settings, [key]: value };
    setSettings(next);
    try {
      await api.updateSettings({ [key]: value } as any);
      toast.success("Tersimpan");
    } catch (e) {
      toast.error(String(e));
      setSettings(settings);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Card>
        <SectionHeader title="🔔 Notifikasi" subtitle="Pilih notifikasi mana yang mau diterima dari bot" />
        {loading || !settings ? (
          <Skeleton height={140} />
        ) : (
          <>
            <ToggleRow
              label="Budget Alerts"
              hint="Notif kalau pengeluaran kategori mencapai 50%, 80%, 100% budget"
              value={settings.budgetAlertsEnabled}
              onChange={(v) => toggle("budgetAlertsEnabled", v)}
            />
            <ToggleRow
              label="Weekly Insights"
              hint="Setiap Minggu pagi, ringkasan + insight AI minggu lalu"
              value={settings.weeklyInsightsEnabled}
              onChange={(v) => toggle("weeklyInsightsEnabled", v)}
            />
            <ToggleRow
              label="Monthly Summary"
              hint="Setiap tanggal 1, summary lengkap bulan lalu"
              value={settings.monthlySummaryEnabled}
              onChange={(v) => toggle("monthlySummaryEnabled", v)}
            />
          </>
        )}
      </Card>

      <Card>
        <SectionHeader title="🤖 Bot Telegram" />
        <div style={{ fontSize: 14, color: theme.color.textMuted, marginBottom: 12 }}>
          Chat di Telegram untuk catat dengan foto nota atau text natural.
        </div>
        <Button onClick={() => window.open("https://t.me/Moneymanaget_bot", "_blank")} variant="secondary" fullWidth>
          🔗 Buka @Moneymanaget_bot
        </Button>
      </Card>

      <Card>
        <SectionHeader title="📤 Export" />
        <div style={{ fontSize: 14, color: theme.color.textMuted, marginBottom: 12 }}>
          Download semua transaksi sebagai Excel (.xlsx) lewat bot:
        </div>
        <code style={{ background: theme.color.bgTertiary, padding: "8px 12px", borderRadius: 6, fontSize: 13 }}>/export</code>
      </Card>

      <Card>
        <SectionHeader title="⚠️ Zona Bahaya" />
        <Button
          variant="danger"
          fullWidth
          onClick={async () => {
            if (!confirm("Logout dari dashboard?")) return;
            onLogout();
          }}
        >
          🚪 Logout
        </Button>
        <div style={{ height: 8 }} />
        <Button
          variant="ghost"
          fullWidth
          style={{ color: theme.color.danger }}
          onClick={async () => {
            if (!confirm("Hapus SEMUA data kamu? Ketik /reset di bot Telegram untuk konfirmasi.")) return;
            toast.info("Buka bot Telegram & ketik /reset");
          }}
        >
          🗑 Reset Data (via Bot)
        </Button>
      </Card>

      <div style={{ textAlign: "center", padding: 20, fontSize: 12, color: theme.color.textSubtle }}>
        DuitKu v0.2 · Free forever 💛<br />
        Made with care for everyone
      </div>
    </div>
  );
}

function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={styles.toggleRow}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: theme.color.textMuted, marginTop: 2 }}>{hint}</div>}
      </div>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        style={{
          ...styles.toggle,
          background: value ? theme.color.primary : theme.color.border,
        }}
      >
        <span style={{
          ...styles.toggleDot,
          transform: value ? "translateX(20px)" : "translateX(2px)",
        }} />
      </button>
    </div>
  );
}

// ───────── STYLES ─────────
const styles: Record<string, CSSProperties> = {
  app: { maxWidth: 720, margin: "0 auto", paddingBottom: 40, minHeight: "100vh" },
  header: {
    padding: "20px 16px 16px",
    background: theme.color.primaryGradient, color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  logo: { fontSize: 32, width: 44, height: 44, background: "rgba(255,255,255,0.2)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" },
  brand: { fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: -0.5 },
  tagline: { fontSize: 12, opacity: 0.85 },
  tabnav: {
    display: "flex", overflowX: "auto", borderBottom: `1px solid ${theme.color.borderLight}`,
    position: "sticky", top: 0, background: theme.color.bg, zIndex: 10,
  },
  tabBtn: {
    flex: "0 0 auto", padding: "14px 16px", background: "transparent",
    border: "none", cursor: "pointer", fontSize: 13,
    transition: "all 0.15s", whiteSpace: "nowrap",
    fontFamily: "inherit",
  },
  content: { padding: 16, display: "flex", flexDirection: "column", gap: 12 },
  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 },
  pillTabs: { display: "flex", gap: 6, padding: 4, background: theme.color.bgTertiary, borderRadius: theme.radius.full, justifyContent: "center" },
  pillBtn: {
    flex: 1, padding: "8px 12px", border: "none", borderRadius: theme.radius.full,
    cursor: "pointer", fontSize: 13, transition: "all 0.15s",
    fontFamily: "inherit",
  },
  legendRow: { display: "flex", alignItems: "center", gap: 10, padding: "6px 0", fontSize: 13 },
  dot: { width: 12, height: 12, borderRadius: 3, display: "inline-block" },
  txnRow: {
    display: "flex", alignItems: "center", gap: 12,
    padding: "12px 12px",
    borderBottom: `1px solid ${theme.color.borderLight}`,
  },
  txnSimple: { display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${theme.color.borderLight}` },
  txnIcon: { fontSize: 24, width: 36, textAlign: "center" },
  txnTitle: { fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  txnMeta: { fontSize: 11, color: theme.color.textMuted, marginTop: 2 },
  txnAmount: { fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" },
  iconBtn: {
    background: "transparent", border: "none", cursor: "pointer", fontSize: 14,
    padding: "4px 6px", borderRadius: 6, color: theme.color.textMuted,
    transition: "background 0.15s", fontFamily: "inherit",
  },
  toggleRow: {
    display: "flex", alignItems: "center", gap: 12,
    padding: "12px 0", borderBottom: `1px solid ${theme.color.borderLight}`,
  },
  toggle: {
    width: 44, height: 24, borderRadius: 12, border: "none",
    cursor: "pointer", position: "relative", padding: 0,
    transition: "background 0.2s",
  },
  toggleDot: {
    width: 20, height: 20, borderRadius: "50%", background: "#fff",
    display: "block", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
    transition: "transform 0.2s",
  },
};
