import type { ParsedReceipt, ParsedText } from "../llm/schemas";
import { formatIDRFull, formatDateID } from "../lib/time";

export function formatReceiptConfirmation(p: ParsedReceipt, txnId: number): string {
  const confidence = p.confidence >= 0.85 ? "✅" : p.confidence >= 0.7 ? "⚠️" : "❓";
  const lines = [
    `${confidence} *Nota tercatat #${txnId}*`,
    ``,
    `🏪 *${escape(p.merchant)}*`,
    `💰 ${formatIDRFull(p.total)}`,
  ];
  if (p.category) lines.push(`📂 ${escape(p.category)}`);
  if (p.date) lines.push(`📅 ${p.date}`);
  if (p.paymentMethod) lines.push(`💳 ${escape(p.paymentMethod)}`);

  if (p.items && p.items.length > 0 && p.items.length <= 5) {
    lines.push(``, `_Detail:_`);
    for (const it of p.items) {
      const qty = it.qty ? `${it.qty}× ` : "";
      const sub = it.subtotal ? ` — ${formatIDRFull(it.subtotal)}` : "";
      lines.push(`• ${qty}${escape(it.name)}${sub}`);
    }
  } else if (p.items && p.items.length > 5) {
    lines.push(``, `_${p.items.length} item — lihat dashboard untuk detail_`);
  }

  if (p.notes) lines.push(``, `📝 _${escape(p.notes)}_`);

  if (p.confidence < 0.7) {
    lines.push(``, `⚠️ _Confidence rendah, cek lagi ya._`);
  }

  return lines.join("\n");
}

export function formatTextConfirmation(p: ParsedText, txnId: number): string {
  const lines = [
    `✅ *Tercatat #${txnId}*`,
    ``,
    `💰 ${formatIDRFull(p.amount)}`,
    `📂 ${escape(p.category)}`,
  ];
  if (p.merchant) lines.push(`🏪 ${escape(p.merchant)}`);
  if (p.description) lines.push(`📝 ${escape(p.description)}`);
  return lines.join("\n");
}

export function formatHelp(miniAppUrl: string): string {
  return `*🎯 Selamat datang di DuitKu!*

Catat pengeluaran semudah chat ke teman.

*Cara pakai:*

📸 *Foto nota* — kirim foto struk/nota/QRIS, aku auto-baca
💬 *Chat aja* — contoh:
  • "kopi 25rb di starbucks"
  • "bensin 50000"
  • "kemarin makan warteg 15rb"

*Command yang tersedia:*

/start — mulai / reset
/today — pengeluaran hari ini
/month — total bulan ini
/summary — summary bulan ini
/list — 10 transaksi terakhir
/categories — list kategori
/dashboard — buka dashboard lengkap 📊
/help — bantuan
/delete — hapus transaksi terakhir
/export — export CSV

💡 Tips: kalau hasil parsing salah, klik tombol *Edit* atau *Hapus* di bawah pesan konfirmasi.

📊 Dashboard: ${miniAppUrl}`;
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
  if (txns.length === 0) return "_Belum ada transaksi. Kirim foto nota atau chat untuk mulai!_";
  const lines = [`*🧾 Transaksi terakhir:*`, ``];
  for (const t of txns) {
    const icon = t.category_icon ?? "📦";
    const label = t.merchant ?? t.description ?? "Tanpa nama";
    lines.push(
      `${icon} \`#${t.id}\` ${formatIDRFull(t.amount)} — ${escape(label)}\n  _${formatDateID(t.occurred_at, tz)}_`,
    );
  }
  return lines.join("\n");
}

// Escape MarkdownV1 special chars (we use Markdown not MarkdownV2 for simpler escaping)
function escape(s: string): string {
  return s.replace(/[*_`\[\]]/g, "");
}
