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
  claimLoginLink,
} from "../db/queries";
import { generateSummary } from "../llm/parse";
import { routeReceipt, routeText, type RouterResult } from "../llm/router";
import {
  enqueueJob, logProviderCall, countPendingForUser, getProviderStats,
} from "../db/queries";
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
  startOfDayLocalSec,
  formatIDRFull,
  monthNameID,
} from "../lib/time";
import { parseReceiptDateRaw } from "../lib/dateparse";

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

  // Helper: wrap command handler dengan global error catch + always-reply
  const safeCmd = (name: string, fn: (ctx: Ctx) => Promise<void>) =>
    bot.command(name, async (ctx) => {
      console.log(`[CMD] /${name} from ${ctx.from?.id}`);
      try {
        await fn(ctx);
      } catch (e: any) {
        console.error(`[CMD] /${name} error:`, e?.stack ?? e);
        try {
          await ctx.reply(`❌ Error: ${String(e?.message ?? e).slice(0, 200)}`);
        } catch (_) {}
      }
    });

  bot.command("start", async (ctx) => {
    console.log(`[CMD] /start from ${ctx.from?.id}, arg='${ctx.match}'`);
    try {
      const name = ctx.from?.first_name ?? "kamu";
      const arg = (typeof ctx.match === "string" ? ctx.match : "").trim();

      // Deep-link login flow: /start login_<token>
      if (arg.startsWith("login_") && ctx.from) {
        const token = arg.slice(6);
        const ok = await claimLoginLink(env.DB, token, ctx.from.id);
        if (ok) {
          await ctx.reply(
            `✅ <b>Login berhasil!</b>\n\nBalik ke browser kamu, dashboard akan otomatis terbuka dalam beberapa detik.`,
            { parse_mode: "HTML" },
          );
        } else {
          await ctx.reply(`❌ Link login expired atau invalid. Coba lagi dari browser ya.`);
        }
        return;
      }

      await ctx.reply(
        `Hai <b>${name}</b>! 👋\n\nAku DuitKu — bot pencatat pengeluaran kamu.\n\n${formatHelp(env.MINIAPP_URL)}`,
        { parse_mode: "HTML" },
      );
    } catch (e: any) {
      console.error(`[CMD] /start error:`, e?.stack ?? e);
      try { await ctx.reply(`❌ Error: ${String(e?.message ?? e).slice(0, 200)}`); } catch (_) {}
    }
  });

  safeCmd("help", async (ctx) => {
    await ctx.reply(formatHelp(env.MINIAPP_URL), { parse_mode: "HTML" });
  });

  safeCmd("today", async (ctx) => {
    if (!ctx.from) return;
    const tz = "Asia/Jakarta";
    const todayStart = startOfDayLocalSec(tz);
    const tomorrow = todayStart + 86400;
    const { total, count } = await totalInRange(env.DB, ctx.from.id, todayStart, tomorrow);
    await ctx.reply(
      `<b>Hari ini:</b>\n💰 ${formatIDRFull(total)}\n🧾 ${count} transaksi`,
      { parse_mode: "HTML" },
    );
  });

  safeCmd("month", async (ctx) => {
    if (!ctx.from) return;
    const tz = "Asia/Jakarta";
    const monthStart = startOfMonthSec(tz);
    const now = nowSec();
    const { total, count } = await totalInRange(env.DB, ctx.from.id, monthStart, now + 1);
    const byCat = await aggregateByCategory(env.DB, ctx.from.id, monthStart, now + 1);
    const lines = [
      `<b>📅 ${monthNameID(new Date(), tz)}</b>`,
      ``,
      `💰 Total: ${formatIDRFull(total)}`,
      `🧾 ${count} transaksi`,
    ];
    if (byCat.results.length > 0) {
      lines.push(``, `<b>Per kategori:</b>`);
      for (const c of byCat.results.slice(0, 8)) {
        const pct = total > 0 ? ((c.total / total) * 100).toFixed(0) : "0";
        lines.push(`${c.icon ?? "📦"} ${c.name ?? "Tanpa kategori"}: ${formatIDRFull(c.total)} (${pct}%)`);
      }
    } else {
      lines.push(``, `<i>Belum ada transaksi bulan ini.</i>`);
    }
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  safeCmd("list", async (ctx) => {
    if (!ctx.from) return;
    const tz = "Asia/Jakarta";
    // Last 10 transaksi REGARDLESS of date, biar selalu ada yang ditampilkan
    const txns = await listTransactionsInRange(env.DB, ctx.from.id, 0, nowSec() + 1);
    const top = txns.results.slice(0, 10);
    await ctx.reply(formatList(top, tz), { parse_mode: "HTML" });
  });

  safeCmd("categories", async (ctx) => {
    if (!ctx.from) return;
    const cats = await listCategories(env.DB, ctx.from.id);
    const lines = ["<b>📂 Kategori kamu:</b>", ""];
    for (const c of cats.results) lines.push(`${c.icon} ${c.name}`);
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  safeCmd("dashboard", async (ctx) => {
    await ctx.reply(`📊 Buka dashboard:`, {
      reply_markup: new InlineKeyboard().webApp("Buka Dashboard", env.MINIAPP_URL),
    });
  });

  safeCmd("delete", async (ctx) => {
    if (!ctx.from) return;
    const txns = await listTransactionsInRange(env.DB, ctx.from.id, 0, nowSec() + 1);
    const last = txns.results[0];
    if (!last) {
      await ctx.reply("Belum ada transaksi.");
      return;
    }
    await softDeleteTransaction(env.DB, last.id, ctx.from.id);
    await ctx.reply(
      `🗑 Transaksi terakhir dihapus:\n${formatIDRFull(last.amount)} — ${last.merchant ?? last.description ?? "tanpa nama"}`,
    );
  });

  safeCmd("summary", async (ctx) => {
    if (!ctx.from) return;
    await ctx.replyWithChatAction("typing");
    const reply = await buildSummaryFor(env, ctx.from.id);
    await ctx.reply(reply, { parse_mode: "HTML" });
  });

  safeCmd("budget", async (ctx) => {
    if (!ctx.from) return;
    const { listBudgets, spendByCategory } = await import("../db/queries");
    const tz = "Asia/Jakarta";
    const monthStart = startOfMonthSec(tz);
    const now = nowSec();
    const [budgets, spending, totalRow] = await Promise.all([
      listBudgets(env.DB, ctx.from.id),
      spendByCategory(env.DB, ctx.from.id, monthStart, now + 1),
      totalInRange(env.DB, ctx.from.id, monthStart, now + 1),
    ]);

    if (budgets.results.length === 0) {
      await ctx.reply(
        `<b>💰 Belum ada budget</b>\n\nSet budget di dashboard biar bisa di-monitor pengeluaran kamu.\n\nAtau set langsung di sini:\n<code>/setbudget overall 5000000</code>\n<code>/setbudget Makanan 1500000</code>`,
        { parse_mode: "HTML" },
      );
      return;
    }

    const lines = [`<b>💰 Budget bulan ini</b>`, ``];
    for (const b of budgets.results) {
      const spent = b.category_id === null ? totalRow.total : spending.get(b.category_id) ?? 0;
      const pct = b.amount > 0 ? (spent / b.amount) * 100 : 0;
      const bar = barChart(pct, 10);
      const icon = b.category_icon ?? (b.category_id === null ? "💵" : "📦");
      const name = b.category_name ?? "Overall";
      const status = pct >= 100 ? "🔴" : pct >= 80 ? "🟠" : pct >= 50 ? "🟡" : "🟢";
      lines.push(
        `${status} ${icon} <b>${name}</b>\n${bar} ${pct.toFixed(0)}%\n${formatIDRFull(spent)} / ${formatIDRFull(b.amount)}`,
        ``,
      );
    }
    lines.push(`<i>Set/edit lewat /setbudget atau dashboard</i>`);
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  safeCmd("setbudget", async (ctx) => {
    if (!ctx.from) return;
    const { upsertBudget } = await import("../db/queries");
    const arg = (typeof ctx.match === "string" ? ctx.match : "").trim();
    if (!arg) {
      await ctx.reply(
        `<b>Cara pakai:</b>\n<code>/setbudget overall 5000000</code>\n<code>/setbudget Makanan 1500000</code>\n\nKategori valid: overall, Makanan, Belanja, Transportasi, Tagihan, Hiburan, Kesehatan, Pendidikan, Investasi, Transfer, Lain`,
        { parse_mode: "HTML" },
      );
      return;
    }
    const parts = arg.split(/\s+/);
    if (parts.length < 2) {
      await ctx.reply("Format salah. Contoh: <code>/setbudget Makanan 1500000</code>", { parse_mode: "HTML" });
      return;
    }
    const amtStr = parts[parts.length - 1];
    const catRaw = parts.slice(0, -1).join(" ");
    const amount = parseAmount(amtStr);
    if (!amount || amount <= 0) {
      await ctx.reply("Nominal tidak valid. Contoh: <code>1500000</code> atau <code>1.5jt</code>", { parse_mode: "HTML" });
      return;
    }
    let categoryId: number | null = null;
    let categoryLabel = "Overall";
    if (catRaw.toLowerCase() !== "overall") {
      // Find by partial match
      const cats = await listCategories(env.DB, ctx.from.id);
      const found = cats.results.find((c) =>
        c.name.toLowerCase().includes(catRaw.toLowerCase()),
      );
      if (!found) {
        await ctx.reply(`Kategori "${catRaw}" tidak ditemukan. Ketik /categories untuk lihat list.`);
        return;
      }
      categoryId = found.id;
      categoryLabel = `${found.icon} ${found.name}`;
    }
    await upsertBudget(env.DB, ctx.from.id, categoryId, amount);
    await ctx.reply(`✅ Budget <b>${categoryLabel}</b> di-set ke ${formatIDRFull(amount)}/bulan.`, {
      parse_mode: "HTML",
    });
  });

  safeCmd("stats", async (ctx) => {
    if (!ctx.from) return;
    const stats = await getProviderStats(env.DB, 24);
    const pending = await countPendingForUser(env.DB, ctx.from.id);
    const lines = [
      `<b>📊 System Stats (24 jam)</b>`,
      ``,
      `Queue pending: ${pending}`,
      ``,
      `<b>Provider performance:</b>`,
    ];
    if (stats.results.length === 0) {
      lines.push(`<i>Belum ada data.</i>`);
    } else {
      for (const s of stats.results) {
        const rate = s.total > 0 ? ((s.success / s.total) * 100).toFixed(0) : "0";
        const ms = s.avg_ms ? `${Math.round(s.avg_ms)}ms` : "—";
        const emoji = parseInt(rate) >= 90 ? "🟢" : parseInt(rate) >= 70 ? "🟡" : "🔴";
        lines.push(`${emoji} <code>${s.provider}</code> (${s.kind})`);
        lines.push(`   ${s.success}/${s.total} sukses (${rate}%) · avg ${ms}`);
      }
    }
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  safeCmd("settings", async (ctx) => {
    if (!ctx.from) return;
    const { getUserSettings } = await import("../db/queries");
    const s = await getUserSettings(env.DB, ctx.from.id);
    const fmt = (v: any) => (v ? "✅ ON" : "❌ OFF");
    await ctx.reply(
      `<b>⚙️ Pengaturan Notifikasi</b>\n\n` +
        `Budget alerts: ${fmt(s.budget_alerts_enabled)}\n` +
        `Weekly insights: ${fmt(s.weekly_insights_enabled)}\n` +
        `Monthly summary: ${fmt(s.monthly_summary_enabled)}\n\n` +
        `<i>Toggle dari dashboard → tab Settings</i>`,
      { parse_mode: "HTML" },
    );
  });

  safeCmd("reset", async (ctx) => {
    if (!ctx.from) return;
    // Hitung yg akan dihapus
    const row = await env.DB
      .prepare("SELECT COUNT(*) as c FROM transactions WHERE user_id = ? AND is_deleted = 0")
      .bind(ctx.from.id)
      .first<{ c: number }>();
    const count = row?.c ?? 0;
    const kb = new InlineKeyboard()
      .text("🗑 YA, HAPUS SEMUA", `reset_confirm:${ctx.from.id}`)
      .text("❌ Batal", `reset_cancel`);
    await ctx.reply(
      `⚠️ <b>Reset data?</b>\n\nIni akan menghapus <b>${count} transaksi</b> + semua foto nota kamu permanently. Tidak bisa di-undo.\n\nKategori & akun TIDAK terhapus.`,
      { parse_mode: "HTML", reply_markup: kb },
    );
  });

  bot.callbackQuery(/^reset_confirm:(\d+)$/, async (ctx) => {
    if (!ctx.from) return;
    const targetId = parseInt(ctx.match![1]);
    if (targetId !== ctx.from.id) {
      await ctx.answerCallbackQuery({ text: "Bukan punya kamu" });
      return;
    }
    await env.DB.batch([
      env.DB.prepare("DELETE FROM transactions WHERE user_id = ?").bind(ctx.from.id),
      env.DB.prepare("DELETE FROM receipts WHERE user_id = ?").bind(ctx.from.id),
      env.DB.prepare("DELETE FROM pending_confirmations WHERE user_id = ?").bind(ctx.from.id),
    ]);
    await ctx.answerCallbackQuery({ text: "✅ Reset selesai" });
    await ctx.editMessageText(
      `✅ <b>Data berhasil di-reset.</b>\n\nSemua transaksi & foto nota udah dihapus. Tinggal mulai catat lagi dari nol — kirim foto atau chat aja!`,
      { parse_mode: "HTML" },
    );
  });

  bot.callbackQuery(/^reset_cancel$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Dibatalkan" });
    await ctx.editMessageText("❌ Reset dibatalkan. Data kamu aman.");
  });

  safeCmd("me", async (ctx) => {
    if (!ctx.from) return;
    const stats = await env.DB
      .prepare(
        `SELECT COUNT(*) as txn_count, COALESCE(SUM(amount), 0) as total_spent,
                MIN(occurred_at) as first_txn
         FROM transactions WHERE user_id = ? AND is_deleted = 0`,
      )
      .bind(ctx.from.id)
      .first<{ txn_count: number; total_spent: number; first_txn: number | null }>();
    const lines = [
      `<b>👤 Info akun kamu</b>`,
      ``,
      `Telegram ID: <code>${ctx.from.id}</code>`,
      `Nama: ${ctx.from.first_name ?? "-"}`,
      `Username: ${ctx.from.username ? "@" + ctx.from.username : "-"}`,
      ``,
      `<b>📊 Stats:</b>`,
      `Total transaksi: ${stats?.txn_count ?? 0}`,
      `Total spend: ${formatIDRFull(stats?.total_spent ?? 0)}`,
    ];
    if (stats?.first_txn) {
      lines.push(`Transaksi pertama: ${new Date(stats.first_txn * 1000).toLocaleDateString("id-ID")}`);
    }
    lines.push(``, `<i>Mau reset semua data? Ketik /reset</i>`);
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  safeCmd("export", async (ctx) => {
    if (!ctx.from) return;
    const tz = "Asia/Jakarta";
    // Export ALL data (not just this month)
    const txns = await listTransactionsInRange(env.DB, ctx.from.id, 0, nowSec() + 1);
    if (txns.results.length === 0) {
      await ctx.reply("Belum ada transaksi untuk diexport.");
      return;
    }

    await ctx.replyWithChatAction("upload_document");
    const XLSX = await import("xlsx");

    // Sheet 1: Summary
    const totalAmount = txns.results.reduce((s, t) => s + t.amount, 0);
    const byCat = new Map<string, { total: number; count: number }>();
    const byMonth = new Map<string, { total: number; count: number }>();
    for (const t of txns.results) {
      const catName = t.category_name ?? "(Tanpa kategori)";
      const ce = byCat.get(catName) ?? { total: 0, count: 0 };
      ce.total += t.amount; ce.count++;
      byCat.set(catName, ce);

      const month = new Date(t.occurred_at * 1000).toISOString().slice(0, 7);
      const me = byMonth.get(month) ?? { total: 0, count: 0 };
      me.total += t.amount; me.count++;
      byMonth.set(month, me);
    }

    const summary: (string | number)[][] = [
      ["DuitKu Export", "", "", ""],
      ["Generated", new Date().toISOString(), "", ""],
      ["User", ctx.from.first_name ?? "", "", ""],
      [],
      ["RINGKASAN", "", "", ""],
      ["Total transaksi", txns.results.length, "", ""],
      ["Total nominal (Rp)", Math.round(totalAmount), "", ""],
      ["Rata-rata per transaksi (Rp)", Math.round(totalAmount / txns.results.length), "", ""],
      [],
      ["PER KATEGORI", "", "", ""],
      ["Kategori", "Total (Rp)", "Jumlah Transaksi", "% Total"],
      ...Array.from(byCat.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .map(([name, agg]) => [name, Math.round(agg.total), agg.count, `${((agg.total / totalAmount) * 100).toFixed(1)}%`]),
      [],
      ["PER BULAN", "", "", ""],
      ["Bulan", "Total (Rp)", "Jumlah Transaksi", "Avg per transaksi (Rp)"],
      ...Array.from(byMonth.entries())
        .sort((a, b) => (a[0] > b[0] ? -1 : 1))
        .map(([month, agg]) => [month, Math.round(agg.total), agg.count, Math.round(agg.total / agg.count)]),
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summary);
    wsSummary["!cols"] = [{ wch: 32 }, { wch: 18 }, { wch: 18 }, { wch: 22 }];

    // Sheet 2: Detail Transactions
    const txnData = txns.results.map((t) => ({
      "ID": t.id,
      "Tanggal": new Date(t.occurred_at * 1000).toLocaleDateString("id-ID"),
      "Waktu": new Date(t.occurred_at * 1000).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
      "Merchant": t.merchant ?? "",
      "Deskripsi": t.description ?? "",
      "Kategori": t.category_name ?? "",
      "Nominal (Rp)": Math.round(t.amount),
      "Metode Bayar": t.payment_method ?? "",
      "Source": t.source,
      "Ada Foto?": t.receipt_id ? "Ya" : "Tidak",
    }));
    const wsDetail = XLSX.utils.json_to_sheet(txnData);
    wsDetail["!cols"] = [{ wch: 6 }, { wch: 12 }, { wch: 8 }, { wch: 28 }, { wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 10 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsSummary, "Ringkasan");
    XLSX.utils.book_append_sheet(wb, wsDetail, "Transaksi");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
    const { InputFile } = await import("grammy");
    const fname = `duitku-${new Date().toISOString().slice(0, 10)}.xlsx`;
    await ctx.replyWithDocument(new InputFile(buf, fname), {
      caption: `📊 Export DuitKu — ${txns.results.length} transaksi · ${formatIDRFull(totalAmount)}`,
    });
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

      // Parse dengan router (multi-provider fallback)
      let routeResult: RouterResult<any>;
      try {
        routeResult = await routeReceipt(imageBuffer, mime, env);
      } catch (e: any) {
        // Semua provider gagal → masuk queue, balas user friendly
        console.error("[PHOTO] All providers failed:", e?.message);
        // Log semua attempt ke stats
        // (router sudah log to console; stats logging dilakukan di catch nya kalau ada)
        const jobId = await enqueueJob(env.DB, {
          userId: ctx.from.id,
          chatId: ctx.chat!.id,
          kind: "photo",
          payload: {
            telegramFileId: largest.file_id,
            telegramFileUniqueId: largest.file_unique_id,
            mime,
            replyMessageId: ctx.message.message_id,
          },
          delaySec: 60,
        });
        await ctx.reply(
          `⏳ AI lagi sibuk. Foto kamu udah dimasukin antrian (#${jobId}) — bakal auto-process dalam 1-5 menit.\n\nKalau buru-buru, ketik manual aja:\n<code>[merchant] [nominal]</code>\nContoh: <code>Indomaret 47500</code>`,
          { parse_mode: "HTML" },
        );
        return;
      }
      const parsed = routeResult.data;
      // Log per-attempt stats untuk observability
      for (const a of routeResult.attempts) {
        await logProviderCall(env.DB, {
          provider: a.provider,
          kind: "receipt",
          success: !a.error,
          durationMs: a.durationMs,
          error: a.error,
        });
      }

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

      // Parse tanggal pakai parser deterministik (bukan dari LLM)
      const todaySec = nowSec();
      const parsedDateISO = parseReceiptDateRaw(parsed.dateRaw ?? "", new Date());
      const occurredAt = parsedDateISO
        ? Math.floor(new Date(parsedDateISO + "T12:00:00Z").getTime() / 1000)
        : todaySec;
      if (parsed.dateRaw && !parsedDateISO) {
        console.log(`[PHOTO] dateRaw "${parsed.dateRaw}" gagal di-parse, fallback ke today`);
      }

      // Strip notes yang nyebut tanggal (safety net kalau LLM kasih)
      if (parsed.notes && /(tanggal|date|year|tahun|\d{1,2}[\.\-\/]\d{1,2})/i.test(parsed.notes)) {
        console.log(`[PHOTO] Stripping date mention from notes: ${parsed.notes}`);
        parsed.notes = "";
      }

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

      // Format tanggal yang benar (sama dengan yang disimpan di DB)
      const effectiveDateISO = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date(occurredAt * 1000));

      await ctx.reply(formatReceiptConfirmation(parsed, txnId, effectiveDateISO), {
        parse_mode: "HTML",
        reply_markup: kb,
      });
    } catch (e: any) {
      console.error("Photo handler error:", e?.stack ?? e);
      try {
        await ctx.reply(
          `❌ Gagal proses foto: ${String(e?.message ?? e).slice(0, 200)}\n\nCoba kirim ulang atau ketik manual ya.`,
        );
      } catch (_) {}
    }
  });

  // ---- REPLY HANDLER (edit amount via reply) — harus SEBELUM generic text ----
  bot.on("message:text", async (ctx, next) => {
    const replyTo = ctx.message?.reply_to_message?.text;
    if (!replyTo) return next();
    const m = replyTo.match(/transaksi #(\d+)/);
    if (!m) return next();
    if (!ctx.from) return;
    const id = parseInt(m[1]);
    const newAmt = parseAmount(ctx.message!.text);
    if (newAmt === null) {
      await ctx.reply("❓ Format tidak dikenal. Coba: 75000 atau 75rb");
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
      await ctx.reply("Tulisin lebih lengkap dong, mis: 'kopi 25rb di starbucks'");
      return;
    }

    await ctx.replyWithChatAction("typing");

    try {
      let routeResult: RouterResult<any>;
      try {
        routeResult = await routeText(text, env);
      } catch (e: any) {
        // Queue for retry
        const jobId = await enqueueJob(env.DB, {
          userId: ctx.from.id,
          chatId: ctx.chat!.id,
          kind: "text",
          payload: { text, replyMessageId: ctx.message.message_id },
          delaySec: 60,
        });
        await ctx.reply(
          `⏳ AI lagi sibuk. Pesan kamu dimasukin antrian (#${jobId}) — bakal di-process dalam 1-5 menit.`,
        );
        return;
      }
      const parsed = routeResult.data;
      for (const a of routeResult.attempts) {
        await logProviderCall(env.DB, {
          provider: a.provider, kind: "text",
          success: !a.error, durationMs: a.durationMs, error: a.error,
        });
      }

      if (!parsed.isExpense) {
        await ctx.reply(
          `💵 Ini income/pemasukan ya? Sekarang DuitKu fokus expense dulu. Fitur income coming soon!`,
        );
        return;
      }

      if (parsed.confidence < 0.5) {
        await ctx.reply(
          `❓ Aku kurang yakin sama input ini. Bisa lebih jelas?\nContoh: "kopi 25rb di starbucks" atau "bensin 50000"`,
        );
        return;
      }

      const cat = await getCategoryByName(env.DB, ctx.from.id, parsed.category);
      const todaySec = nowSec();
      const minDateSec = todaySec - 365 * 86400;
      const maxDateSec = todaySec + 7 * 86400;
      let occurredAt = todaySec;
      if (parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) {
        const dateSec = Math.floor(new Date(parsed.date + "T12:00:00Z").getTime() / 1000);
        if (!isNaN(dateSec) && dateSec >= minDateSec && dateSec <= maxDateSec) {
          occurredAt = dateSec;
        }
      }

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
        parse_mode: "HTML",
        reply_markup: kb,
      });
    } catch (e: any) {
      console.error("Text handler error:", e?.stack ?? e);
      try {
        await ctx.reply(`❌ Gagal proses: ${String(e?.message ?? e).slice(0, 200)}`);
      } catch (_) {}
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
    await ctx.editMessageText(`🗑 <i>Dihapus: ${formatIDRFull(t.amount)} — ${t.merchant ?? t.description ?? "-"}</i>`, {
      parse_mode: "HTML",
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
      `Reply pesan ini dengan nominal baru untuk transaksi #${id}.\nContoh: 75000 atau 75rb`,
      {
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
    return `<i>Belum ada transaksi bulan ini. Yuk mulai catat — kirim foto nota atau chat aja!</i>`;
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

  const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = [
    `<b>📊 Summary ${escapeHtml(monthName)}</b>`,
    ``,
    escapeHtml(narrative.headline),
    ``,
    `💰 Total: <b>${formatIDRFull(total)}</b>`,
    `🧾 ${count} transaksi`,
  ];
  if (prevTotal > 0) {
    const diff = total - prevTotal;
    const pct = ((diff / prevTotal) * 100).toFixed(1);
    lines.push(`📈 ${diff > 0 ? "Naik" : "Turun"} ${Math.abs(parseFloat(pct))}% dari bulan lalu`);
  }
  lines.push(``, `<b>Top kategori:</b>`);
  for (const c of topCategories.slice(0, 5)) {
    lines.push(`• ${escapeHtml(c.name)}: ${formatIDRFull(c.total)}`);
  }
  if (narrative.insights.length > 0) {
    lines.push(``, `<b>💡 Insights:</b>`);
    for (const ins of narrative.insights) lines.push(`• ${escapeHtml(ins)}`);
  }
  lines.push(``, `<b>🎯 ${escapeHtml(narrative.coaching)}</b>`);
  return lines.join("\n");
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

function barChart(pct: number, len = 10): string {
  const p = Math.max(0, Math.min(100, pct));
  const filled = Math.round((p / 100) * len);
  return "▰".repeat(filled) + "▱".repeat(len - filled);
}

function csv(s: string | null | undefined): string {
  if (!s) return "";
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
