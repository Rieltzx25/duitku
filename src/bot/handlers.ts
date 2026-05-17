import { Bot, InlineKeyboard, type Context } from "grammy";
import type { Env } from "../lib/env";
import {
  getOrCreateUser,
  getCategoryByName,
  listCategories,
  saveReceipt,
  insertTransaction,
  getTransaction,
  updateTransactionCategory,
  updateTransactionAmount,
  softDeleteTransaction,
  listTransactionsInRange,
  totalInRange,
  aggregateByCategory,
  aggregateByMerchant,
} from "../db/queries";
import { parseReceiptImage, parseTextInput, generateSummary } from "../llm/parse";
import {
  formatReceiptConfirmation,
  formatTextConfirmation,
  formatHelp,
  formatList,
} from "./format";
import {
  nowSec,
  startOfMonthSec,
  startOfPrevMonthSec,
  formatIDRFull,
  monthNameID,
} from "../lib/time";

type Ctx = Context & { env: Env };

const MAX_PHOTO_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
const TG_FILE_LIMIT = 20 * 1024 * 1024;

export function createBot(env: Env): Bot<Ctx> {
  const bot = new Bot<Ctx>(env.TELEGRAM_BOT_TOKEN);

  // Middleware: inject env
  bot.use((ctx, next) => {
    (ctx as Ctx).env = env;
    return next();
  });

  // Middleware: ensure user exists
  bot.use(async (ctx, next) => {
    if (ctx.from) {
      await getOrCreateUser(env.DB, {
        telegramId: ctx.from.id,
        username: ctx.from.username,
        firstName: ctx.from.first_name,
      });
    }
    return next();
  });

  // ---- COMMANDS ----

  bot.command("start", async (ctx) => {
    const name = ctx.from?.first_name ?? "kamu";
    await ctx.reply(
      `Hai *${name}*! 👋\n\nAku DuitKu — bot pencatat pengeluaran kamu.\n\n${formatHelp(env.MINIAPP_URL)}`,
      { parse_mode: "Markdown" },
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(formatHelp(env.MINIAPP_URL), { parse_mode: "Markdown" });
  });

  bot.command("today", async (ctx) => {
    if (!ctx.from) return;
    const tz = "Asia/Jakarta";
    const todayStart = startOfDayLocalSec(tz);
    const tomorrow = todayStart + 86400;
    const { total, count } = await totalInRange(env.DB, ctx.from.id, todayStart, tomorrow);
    await ctx.reply(
      `*Hari ini:*\n💰 ${formatIDRFull(total)}\n🧾 ${count} transaksi`,
      { parse_mode: "Markdown" },
    );
  });

  bot.command("month", async (ctx) => {
    if (!ctx.from) return;
    const tz = "Asia/Jakarta";
    const monthStart = startOfMonthSec(tz);
    const now = nowSec();
    const { total, count } = await totalInRange(env.DB, ctx.from.id, monthStart, now + 1);
    const byCat = await aggregateByCategory(env.DB, ctx.from.id, monthStart, now + 1);
    const lines = [
      `*📅 ${monthNameID(new Date(), tz)}*`,
      ``,
      `💰 Total: ${formatIDRFull(total)}`,
      `🧾 ${count} transaksi`,
      ``,
      `*Per kategori:*`,
    ];
    for (const c of byCat.results.slice(0, 8)) {
      const pct = total > 0 ? ((c.total / total) * 100).toFixed(0) : "0";
      lines.push(`${c.icon ?? "📦"} ${c.name ?? "Tanpa kategori"}: ${formatIDRFull(c.total)} (${pct}%)`);
    }
    await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
  });

  bot.command("list", async (ctx) => {
    if (!ctx.from) return;
    const tz = "Asia/Jakarta";
    const monthStart = startOfMonthSec(tz);
    const txns = await listTransactionsInRange(env.DB, ctx.from.id, monthStart, nowSec() + 1);
    const top = txns.results.slice(0, 10);
    await ctx.reply(formatList(top, tz), { parse_mode: "Markdown" });
  });

  bot.command("categories", async (ctx) => {
    if (!ctx.from) return;
    const cats = await listCategories(env.DB, ctx.from.id);
    const lines = ["*📂 Kategori kamu:*", ""];
    for (const c of cats.results) lines.push(`${c.icon} ${c.name}`);
    await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
  });

  bot.command("dashboard", async (ctx) => {
    await ctx.reply(`📊 Buka dashboard:`, {
      reply_markup: new InlineKeyboard().webApp("Buka Dashboard", env.MINIAPP_URL),
    });
  });

  bot.command("delete", async (ctx) => {
    if (!ctx.from) return;
    const tz = "Asia/Jakarta";
    const txns = await listTransactionsInRange(
      env.DB,
      ctx.from.id,
      startOfMonthSec(tz),
      nowSec() + 1,
    );
    const last = txns.results[0];
    if (!last) {
      await ctx.reply("_Belum ada transaksi bulan ini._", { parse_mode: "Markdown" });
      return;
    }
    await softDeleteTransaction(env.DB, last.id, ctx.from.id);
    await ctx.reply(
      `🗑 Transaksi terakhir dihapus:\n${formatIDRFull(last.amount)} — ${last.merchant ?? last.description ?? "tanpa nama"}`,
    );
  });

  bot.command("summary", async (ctx) => {
    if (!ctx.from) return;
    await ctx.replyWithChatAction("typing");
    const reply = await buildSummaryFor(env, ctx.from.id);
    await ctx.reply(reply, { parse_mode: "Markdown" });
  });

  bot.command("export", async (ctx) => {
    if (!ctx.from) return;
    const tz = "Asia/Jakarta";
    const monthStart = startOfMonthSec(tz);
    const txns = await listTransactionsInRange(env.DB, ctx.from.id, monthStart, nowSec() + 1);
    const header = "id,occurred_at,amount,currency,merchant,description,category,source,payment_method\n";
    const rows = txns.results
      .map((t) =>
        [
          t.id,
          new Date(t.occurred_at * 1000).toISOString(),
          t.amount,
          t.currency,
          csv(t.merchant),
          csv(t.description),
          csv(t.category_name),
          t.source,
          csv(t.payment_method),
        ].join(","),
      )
      .join("\n");
    const csvText = header + rows;
    const blob = new Blob([csvText], { type: "text/csv" });
    const buf = await blob.arrayBuffer();
    await ctx.replyWithDocument(
      new (await import("grammy")).InputFile(new Uint8Array(buf), `duitku-${monthNameID(new Date(), tz).replace(" ", "-")}.csv`),
    );
  });

  // ---- PHOTO HANDLER ----
  bot.on(":photo", async (ctx) => {
    if (!ctx.from || !ctx.message?.photo) return;
    await ctx.replyWithChatAction("typing");

    try {
      // Ambil foto resolusi tertinggi
      const photos = ctx.message.photo;
      const largest = photos[photos.length - 1];

      if (largest.file_size && largest.file_size > MAX_PHOTO_SIZE_BYTES) {
        await ctx.reply("⚠️ Foto terlalu besar (max 8MB). Coba kompres dulu ya.");
        return;
      }

      // Download dari Telegram
      const file = await ctx.api.getFile(largest.file_id);
      if (!file.file_path) throw new Error("No file path");

      const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      const res = await fetch(fileUrl);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const imageBuffer = await res.arrayBuffer();

      // Pakai Telegram sebagai storage: cuma simpan file_id-nya
      const receiptId = crypto.randomUUID();
      const ext = file.file_path.split(".").pop() ?? "jpg";
      const mime = ext === "png" ? "image/png" : "image/jpeg";

      // Parse dengan Gemini (foto sudah didownload ke memory)
      const parsed = await parseReceiptImage(env, imageBuffer, mime);

      // Save receipt record (cuma metadata + telegram file_id)
      await saveReceipt(env.DB, {
        id: receiptId,
        userId: ctx.from.id,
        telegramFileId: largest.file_id,
        telegramFileUniqueId: largest.file_unique_id,
        mime,
        sizeBytes: imageBuffer.byteLength,
        ocrJson: JSON.stringify(parsed),
      });

      // Find category
      const cat = await getCategoryByName(env.DB, ctx.from.id, parsed.category);

      const occurredAt = parsed.date
        ? Math.floor(new Date(parsed.date + "T12:00:00").getTime() / 1000)
        : nowSec();

      // Insert transaction
      const source: "photo" | "qris" = parsed.type === "qris" ? "qris" : "photo";
      const txnId = await insertTransaction(env.DB, {
        userId: ctx.from.id,
        amount: parsed.total,
        currency: "IDR",
        categoryId: cat?.id ?? null,
        merchant: parsed.merchant,
        description: null,
        occurredAt,
        receiptId,
        source,
        rawInput: null,
        llmConfidence: parsed.confidence,
        itemsJson: parsed.items ? JSON.stringify(parsed.items) : null,
        paymentMethod: parsed.paymentMethod ?? null,
      });

      const kb = new InlineKeyboard()
        .text("✏️ Edit Nominal", `edit_amt:${txnId}`)
        .text("📂 Pindah Kategori", `edit_cat:${txnId}`)
        .row()
        .text("🗑 Hapus", `del:${txnId}`);

      await ctx.reply(formatReceiptConfirmation(parsed, txnId), {
        parse_mode: "Markdown",
        reply_markup: kb,
      });
    } catch (e: any) {
      console.error("Photo handler error:", e);
      await ctx.reply(
        `❌ Gagal proses foto: ${e?.message ?? "error"}\n\nCoba kirim ulang atau ketik manual ya.`,
      );
    }
  });

  // ---- REPLY HANDLER (edit amount via reply) — harus SEBELUM generic text ----
  bot.on("message:text", async (ctx, next) => {
    const replyTo = ctx.message?.reply_to_message?.text;
    if (!replyTo) return next();
    const m = replyTo.match(/transaksi \*?#(\d+)\*?/);
    if (!m) return next();
    if (!ctx.from) return;
    const id = parseInt(m[1]);
    const newAmt = parseAmount(ctx.message!.text);
    if (newAmt === null) {
      await ctx.reply("❓ Format tidak dikenal. Coba: `75000` atau `75rb`", { parse_mode: "Markdown" });
      return;
    }
    await updateTransactionAmount(env.DB, id, ctx.from.id, newAmt);
    await ctx.reply(`✅ Nominal #${id} diubah jadi ${formatIDRFull(newAmt)}`);
  });

  // ---- TEXT HANDLER (untuk pesan non-command) ----
  bot.on("message:text", async (ctx) => {
    if (!ctx.from || !ctx.message) return;
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return; // commands sudah dihandle
    if (text.length < 3) {
      await ctx.reply("_Tulisin lebih lengkap dong, mis: 'kopi 25rb di starbucks'_", {
        parse_mode: "Markdown",
      });
      return;
    }

    await ctx.replyWithChatAction("typing");

    try {
      const parsed = await parseTextInput(env, text);

      if (!parsed.isExpense) {
        await ctx.reply(
          `💵 Ini income/pemasukan ya? Sekarang DuitKu fokus expense dulu. Fitur income coming soon!`,
        );
        return;
      }

      if (parsed.confidence < 0.5) {
        await ctx.reply(
          `❓ Aku kurang yakin sama input ini. Bisa lebih jelas?\nContoh: "*kopi 25rb di starbucks*" atau "*bensin 50000*"`,
          { parse_mode: "Markdown" },
        );
        return;
      }

      const cat = await getCategoryByName(env.DB, ctx.from.id, parsed.category);
      const occurredAt = parsed.date
        ? Math.floor(new Date(parsed.date + "T12:00:00").getTime() / 1000)
        : nowSec();

      const txnId = await insertTransaction(env.DB, {
        userId: ctx.from.id,
        amount: parsed.amount,
        currency: "IDR",
        categoryId: cat?.id ?? null,
        merchant: parsed.merchant ?? null,
        description: parsed.description ?? null,
        occurredAt,
        source: "text",
        rawInput: text,
        llmConfidence: parsed.confidence,
      });

      const kb = new InlineKeyboard()
        .text("✏️ Edit", `edit_amt:${txnId}`)
        .text("📂 Kategori", `edit_cat:${txnId}`)
        .text("🗑 Hapus", `del:${txnId}`);

      await ctx.reply(formatTextConfirmation(parsed, txnId), {
        parse_mode: "Markdown",
        reply_markup: kb,
      });
    } catch (e: any) {
      console.error("Text handler error:", e);
      await ctx.reply(`❌ Gagal proses: ${e?.message ?? "error"}`);
    }
  });

  // ---- CALLBACK QUERIES (inline button) ----

  bot.callbackQuery(/^del:(\d+)$/, async (ctx) => {
    if (!ctx.from) return;
    const id = parseInt(ctx.match![1]);
    const t = await getTransaction(env.DB, id, ctx.from.id);
    if (!t) {
      await ctx.answerCallbackQuery({ text: "Transaksi tidak ditemukan" });
      return;
    }
    await softDeleteTransaction(env.DB, id, ctx.from.id);
    await ctx.answerCallbackQuery({ text: "🗑 Dihapus" });
    await ctx.editMessageText(`🗑 _Dihapus: ${formatIDRFull(t.amount)} — ${t.merchant ?? t.description ?? "-"}_`, {
      parse_mode: "Markdown",
    });
  });

  bot.callbackQuery(/^edit_cat:(\d+)$/, async (ctx) => {
    if (!ctx.from) return;
    const id = parseInt(ctx.match![1]);
    const cats = await listCategories(env.DB, ctx.from.id);
    const kb = new InlineKeyboard();
    let i = 0;
    for (const c of cats.results) {
      kb.text(`${c.icon} ${c.name}`, `set_cat:${id}:${c.id}`);
      i++;
      if (i % 2 === 0) kb.row();
    }
    kb.row().text("« Batal", `cancel_edit:${id}`);
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: kb });
  });

  bot.callbackQuery(/^set_cat:(\d+):(\d+)$/, async (ctx) => {
    if (!ctx.from) return;
    const id = parseInt(ctx.match![1]);
    const catId = parseInt(ctx.match![2]);
    await updateTransactionCategory(env.DB, id, ctx.from.id, catId);
    await ctx.answerCallbackQuery({ text: "✅ Kategori diubah" });
    const kb = new InlineKeyboard()
      .text("✏️ Edit Nominal", `edit_amt:${id}`)
      .text("📂 Pindah Kategori", `edit_cat:${id}`)
      .row()
      .text("🗑 Hapus", `del:${id}`);
    await ctx.editMessageReplyMarkup({ reply_markup: kb });
  });

  bot.callbackQuery(/^cancel_edit:(\d+)$/, async (ctx) => {
    const id = parseInt(ctx.match![1]);
    const kb = new InlineKeyboard()
      .text("✏️ Edit Nominal", `edit_amt:${id}`)
      .text("📂 Pindah Kategori", `edit_cat:${id}`)
      .row()
      .text("🗑 Hapus", `del:${id}`);
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: kb });
  });

  bot.callbackQuery(/^edit_amt:(\d+)$/, async (ctx) => {
    const id = parseInt(ctx.match![1]);
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `Reply pesan ini dengan nominal baru untuk transaksi *#${id}*.\nContoh: \`75000\` atau \`75rb\``,
      {
        parse_mode: "Markdown",
        reply_markup: { force_reply: true, selective: true },
      },
    );
  });

  // ---- DEFAULT ----
  bot.on("message", async (ctx) => {
    await ctx.reply("Aku belum ngerti pesan ini. Coba /help ya 🙏");
  });

  return bot;
}

// Helper: build summary teks untuk command /summary atau cron
export async function buildSummaryFor(env: Env, userId: number): Promise<string> {
  const tz = "Asia/Jakarta";
  const now = nowSec();
  const monthStart = startOfMonthSec(tz);
  const prevStart = startOfPrevMonthSec(tz);
  const monthName = monthNameID(new Date(), tz);

  const { total, count } = await totalInRange(env.DB, userId, monthStart, now + 1);
  if (count === 0) {
    return `_Belum ada transaksi bulan ini. Yuk mulai catat!_`;
  }

  const { total: prevTotal } = await totalInRange(env.DB, userId, prevStart, monthStart);
  const cats = await aggregateByCategory(env.DB, userId, monthStart, now + 1);
  const merchants = await aggregateByMerchant(env.DB, userId, monthStart, now + 1, 5);

  const topCategories = cats.results
    .filter((c) => c.name)
    .slice(0, 5)
    .map((c) => ({ name: c.name!, total: c.total, count: c.count }));
  const topMerchants = merchants.results.map((m) => ({ name: m.name, total: m.total, count: m.count }));

  let narrative;
  try {
    narrative = await generateSummary(env, {
      monthName,
      total,
      prevTotal: prevTotal > 0 ? prevTotal : null,
      topCategories,
      topMerchants,
      txnCount: count,
    });
  } catch (e) {
    console.error("Summary LLM error:", e);
    narrative = {
      headline: `Bulan ${monthName} kamu spend ${formatIDRFull(total)}.`,
      insights: topCategories.slice(0, 3).map((c) => `${c.name}: ${formatIDRFull(c.total)}`),
      coaching: "Coba review pengeluaran terbesar minggu ini.",
    };
  }

  const lines = [
    `*📊 Summary ${monthName}*`,
    ``,
    narrative.headline,
    ``,
    `💰 Total: *${formatIDRFull(total)}*`,
    `🧾 ${count} transaksi`,
  ];
  if (prevTotal > 0) {
    const diff = total - prevTotal;
    const pct = ((diff / prevTotal) * 100).toFixed(1);
    lines.push(`📈 ${diff > 0 ? "Naik" : "Turun"} ${Math.abs(parseFloat(pct))}% dari bulan lalu`);
  }
  lines.push(``, `*Top kategori:*`);
  for (const c of topCategories.slice(0, 5)) {
    lines.push(`• ${c.name}: ${formatIDRFull(c.total)}`);
  }
  lines.push(``, `*💡 Insights:*`);
  for (const ins of narrative.insights) lines.push(`• ${ins}`);
  lines.push(``, `*🎯 ${narrative.coaching}*`);
  return lines.join("\n");
}

function startOfDayLocalSec(tz: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  const tzNow = new Date(new Date().toLocaleString("en-US", { timeZone: tz })).getTime();
  const offset = tzNow - Date.now();
  return Math.floor((new Date(`${y}-${m}-${d}T00:00:00`).getTime() - offset) / 1000);
}

function parseAmount(s: string): number | null {
  const cleaned = s.trim().toLowerCase().replace(/\s+/g, "").replace(/^rp/, "");
  const m = cleaned.match(/^([\d.,]+)(rb|ribu|k|jt|juta|m)?$/);
  if (!m) return null;
  // Hapus semua titik/koma sebagai thousand sep
  let n = parseFloat(m[1].replace(/[.,]/g, ""));
  if (isNaN(n)) return null;
  const unit = m[2];
  if (unit === "rb" || unit === "ribu" || unit === "k") n *= 1000;
  else if (unit === "jt" || unit === "juta") n *= 1_000_000;
  else if (unit === "m") n *= 1_000_000_000;
  return n;
}

function csv(s: string | null | undefined): string {
  if (!s) return "";
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
