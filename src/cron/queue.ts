import type { Env } from "../lib/env";
import { Bot, InlineKeyboard } from "grammy";
import {
  dueJobs, markJobDone, bumpJobRetry, logProviderCall,
  saveReceipt, insertTransaction, getCategoryByName,
} from "../db/queries";
import { routeReceipt, routeText } from "../llm/router";
import { nowSec } from "../lib/time";
import { parseReceiptDateRaw } from "../lib/dateparse";
import { formatReceiptConfirmation, formatTextConfirmation } from "../bot/format";

/**
 * Process pending jobs queue.
 * Triggered by cron every few minutes.
 * Each job retries up to 5x with exponential backoff (1m, 5m, 15m, 30m, 60m).
 */
export async function runQueueProcessor(env: Env): Promise<void> {
  const jobs = await dueJobs(env.DB, 10);
  if (jobs.results.length === 0) return;
  console.log(`[QUEUE] Processing ${jobs.results.length} due jobs`);

  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  for (const job of jobs.results) {
    try {
      const payload = JSON.parse(job.payload_json);
      if (job.kind === "photo") {
        await processPhotoJob(env, bot, job, payload);
      } else {
        await processTextJob(env, bot, job, payload);
      }
    } catch (e: any) {
      const msg = String(e?.message ?? e).slice(0, 400);
      console.error(`[QUEUE] Job ${job.id} failed:`, msg);
      const backoff = backoffFor(job.attempts + 1);
      await bumpJobRetry(env.DB, job.id, msg, backoff);
      if (job.attempts + 1 >= job.max_attempts) {
        // Final fail — notify user
        try {
          await bot.api.sendMessage(
            job.chat_id,
            `❌ Maaf, gagal proses ${job.kind === "photo" ? "foto nota" : "input"} #${job.id} setelah ${job.max_attempts}x percobaan.\n\nKamu bisa ketik manual aja, contoh:\n<code>Indomaret 47500</code>`,
            { parse_mode: "HTML" },
          );
        } catch (_) {}
      }
    }
  }
}

function backoffFor(attempt: number): number {
  // 1m, 5m, 15m, 30m, 60m
  const schedule = [60, 300, 900, 1800, 3600];
  return schedule[Math.min(attempt - 1, schedule.length - 1)] ?? 3600;
}

async function processPhotoJob(env: Env, bot: Bot, job: any, payload: any) {
  // Re-download from Telegram by file_id
  const fileInfoRes = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${payload.telegramFileId}`,
  );
  const info = (await fileInfoRes.json()) as any;
  if (!info.ok || !info.result?.file_path) {
    throw new Error("Failed to getFile from Telegram");
  }
  const fileRes = await fetch(
    `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${info.result.file_path}`,
  );
  if (!fileRes.ok) throw new Error(`Download fail ${fileRes.status}`);
  const buf = await fileRes.arrayBuffer();

  // Route via providers
  const result = await routeReceipt(buf, payload.mime ?? "image/jpeg", env);
  for (const a of result.attempts) {
    await logProviderCall(env.DB, {
      provider: a.provider, kind: "receipt",
      success: !a.error, durationMs: a.durationMs, error: a.error,
    });
  }

  const parsed = result.data;
  const receiptId = crypto.randomUUID();
  await saveReceipt(env.DB, {
    id: receiptId,
    userId: job.user_id,
    telegramFileId: payload.telegramFileId,
    telegramFileUniqueId: payload.telegramFileUniqueId,
    mime: payload.mime ?? "image/jpeg",
    sizeBytes: buf.byteLength,
    ocrJson: JSON.stringify(parsed),
  });

  const cat = await getCategoryByName(env.DB, job.user_id, parsed.category);
  const todaySec = nowSec();
  const parsedDateISO = parseReceiptDateRaw(parsed.dateRaw ?? "", new Date());
  const occurredAt = parsedDateISO
    ? Math.floor(new Date(parsedDateISO + "T12:00:00Z").getTime() / 1000)
    : todaySec;

  const source: "photo" | "qris" = parsed.type === "qris" ? "qris" : "photo";
  const txnId = await insertTransaction(env.DB, {
    userId: job.user_id,
    amount: parsed.total,
    currency: "IDR",
    categoryId: cat?.id ?? null,
    merchant: parsed.merchant,
    description: null,
    occurredAt,
    receiptId,
    source,
    llmConfidence: parsed.confidence,
    itemsJson: parsed.items ? JSON.stringify(parsed.items) : null,
    paymentMethod: parsed.paymentMethod ?? null,
  });

  await markJobDone(env.DB, job.id);

  const effectiveDateISO = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(occurredAt * 1000));

  const kb = new InlineKeyboard()
    .text("✏️ Edit Nominal", `edit_amt:${txnId}`)
    .text("📂 Pindah Kategori", `edit_cat:${txnId}`)
    .row()
    .text("🗑 Hapus", `del:${txnId}`);

  await bot.api.sendMessage(
    job.chat_id,
    `✅ <i>Antrian #${job.id} berhasil di-process via ${result.provider}</i>\n\n` +
      formatReceiptConfirmation(parsed, txnId, effectiveDateISO),
    { parse_mode: "HTML", reply_markup: kb },
  );
}

async function processTextJob(env: Env, bot: Bot, job: any, payload: any) {
  const result = await routeText(payload.text, env);
  for (const a of result.attempts) {
    await logProviderCall(env.DB, {
      provider: a.provider, kind: "text",
      success: !a.error, durationMs: a.durationMs, error: a.error,
    });
  }
  const parsed = result.data;
  if (!parsed.isExpense) {
    await bot.api.sendMessage(job.chat_id, `💵 Antrian #${job.id}: ini income/pemasukan ya? DuitKu fokus expense dulu.`);
    await markJobDone(env.DB, job.id);
    return;
  }
  if (parsed.confidence < 0.5) {
    await bot.api.sendMessage(job.chat_id, `❓ Antrian #${job.id}: input kurang jelas, coba kirim ulang dengan format jelas.`);
    await markJobDone(env.DB, job.id);
    return;
  }

  const cat = await getCategoryByName(env.DB, job.user_id, parsed.category);
  const todaySec = nowSec();
  const parsedDateISO = parseReceiptDateRaw(parsed.date ?? "", new Date());
  const occurredAt = parsedDateISO
    ? Math.floor(new Date(parsedDateISO + "T12:00:00Z").getTime() / 1000)
    : todaySec;

  const txnId = await insertTransaction(env.DB, {
    userId: job.user_id,
    amount: parsed.amount,
    currency: "IDR",
    categoryId: cat?.id ?? null,
    merchant: parsed.merchant ?? null,
    description: parsed.description ?? null,
    occurredAt,
    source: "text",
    rawInput: payload.text,
    llmConfidence: parsed.confidence,
  });
  await markJobDone(env.DB, job.id);

  const kb = new InlineKeyboard()
    .text("✏️ Edit", `edit_amt:${txnId}`)
    .text("📂 Kategori", `edit_cat:${txnId}`)
    .text("🗑 Hapus", `del:${txnId}`);

  await bot.api.sendMessage(
    job.chat_id,
    `✅ <i>Antrian #${job.id} berhasil di-process via ${result.provider}</i>\n\n` +
      formatTextConfirmation(parsed, txnId),
    { parse_mode: "HTML", reply_markup: kb },
  );
}
