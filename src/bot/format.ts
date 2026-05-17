import type { ParsedReceipt, ParsedText } from "../llm/schemas";
import { formatIDRFull, formatDateID } from "../lib/time";

// HTML escape — safer than Markdown
const h = (s: string | null | undefined): string => {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
};

export function formatReceiptConfirmation(p: ParsedReceipt, txnId: number): string {
  const conf = p.confidence >= 0.85 ? "✅" : p.confidence >= 0.7 ? "⚠️" : "❓";
  const lines = [
    `${conf} <b>Nota tercatat #${txnId}</b>`,
    ``,
    `🏪 <b>${h(p.merchant)}</b>`,
    `💰 ${formatIDRFull(p.total)}`,
  ];
  if (p.category) lines.push(`📂 ${h(p.category)}`);
  if (p.date) lines.push(`📅 ${h(p.date)}`);
  if (p.paymentMethod) lines.push(`💳 ${h(p.paymentMethod)}`);

  if (p.items && p.items.length > 0 && p.items.length <= 5) {
    lines.push(``, `<i>Detail:</i>`);
    for (const it of p.items) {
      const qty = it.qty ? `${it.qty}× ` : "";
      const sub = it.subtotal ? ` — ${formatIDRFull(it.subtotal)}` : "";
      lines.push(`• ${qty}${h(it.name)}${sub}`);
    }
  } else if (p.items && p.items.length > 5) {
    lines.push(``, `<i>${p.items.length} item — lihat dashboard untuk detail</i>`);
  }

  if (p.notes) lines.push(``, `📝 <i>${h(p.notes)}</i>`);
  if (p.confidence < 0.7) lines.push(``, `⚠️ <i>Confidence rendah, cek lagi ya.</i>`);

  return lines.join("\n");
}

export function formatTextConfirmation(p: ParsedText, txnId: number): string {
  const lines = [
    `✅ <b>Tercatat #${txnId}</b>`,
    ``,
    `💰 ${formatIDRFull(p.amount)}`,
    `📂 ${h(p.category)}`,
  ];
  if (p.merchant) lines.push(`🏪 ${h(p.merchant)}`);
  if (p.description) lines.push(`📝 ${h(p.description)}`);
  return lines.join("\n");
}

export function formatHelp(miniAppUrl: string): string {
  return `<b>🎯 Selamat datang di DuitKu!</b>

Catat pengeluaran semudah chat ke teman.

<b>Cara pakai:</b>

📸 <b>Foto nota</b> — kirim foto struk/nota/QRIS
💬 <b>Chat aja:</b>
  • "kopi 25rb di starbucks"
  • "bensin 50000"
  • "kemarin makan warteg 15rb"

<b>Command yang tersedia:</b>

/start — mulai / reset
/today — pengeluaran hari ini
/month — total bulan ini
/summary — summary bulan ini + insight AI
/list — 10 transaksi terakhir
/categories — list kategori
/dashboard — buka dashboard 📊
/help — bantuan
/delete — hapus transaksi terakhir
/export — export CSV

💡 Kalau hasil parsing salah, klik tombol Edit/Hapus di bawah pesan konfirmasi.

📊 Dashboard: ${h(miniAppUrl)}`;
}

export function formatList(
  txns: Array<{
    id: number;
    amount: number;
    merchant: string | null;
    description: string | null;
    category_name: string | null;
    category_icon: string | null;
    occurred_at: number;
  }>,
  tz: string,
): string {
  if (txns.length === 0) return "<i>Belum ada transaksi. Kirim foto nota atau chat untuk mulai!</i>";
  const lines = [`<b>🧾 Transaksi terakhir:</b>`, ``];
  for (const t of txns) {
    const icon = t.category_icon ?? "📦";
    const label = t.merchant ?? t.description ?? "Tanpa nama";
    lines.push(
      `${icon} <code>#${t.id}</code> ${formatIDRFull(t.amount)} — ${h(label)}\n  <i>${h(formatDateID(t.occurred_at, tz))}</i>`,
    );
  }
  return lines.join("\n");
}
