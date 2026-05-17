import {
  type NewTransaction,
  type Category,
} from "./schema";
import { DEFAULT_CATEGORIES } from "../lib/categories";
import { nowSec } from "../lib/time";

// Raw row types (snake_case sesuai SQL output dari D1)
export interface TransactionRow {
  id: number;
  user_id: number;
  amount: number;
  currency: string;
  category_id: number | null;
  merchant: string | null;
  description: string | null;
  occurred_at: number;
  receipt_id: string | null;
  source: string;
  raw_input: string | null;
  llm_confidence: number | null;
  items_json: string | null;
  payment_method: string | null;
  is_deleted: number;
  created_at: number;
}

export interface TransactionRowWithCategory extends TransactionRow {
  category_name: string | null;
  category_icon: string | null;
}

// ---- USERS ----

export async function getOrCreateUser(
  d1: D1Database,
  data: { telegramId: number; username?: string; firstName?: string },
) {
  const existing = await d1
    .prepare("SELECT * FROM users WHERE telegram_id = ?")
    .bind(data.telegramId)
    .first<any>();

  if (existing) {
    await d1
      .prepare("UPDATE users SET last_active_at = ?, username = ?, first_name = ? WHERE telegram_id = ?")
      .bind(nowSec(), data.username ?? existing.username, data.firstName ?? existing.first_name, data.telegramId)
      .run();
    return { user: existing, isNew: false };
  }

  const now = nowSec();
  await d1
    .prepare(
      `INSERT INTO users (telegram_id, username, first_name, timezone, currency, language, created_at, last_active_at)
       VALUES (?, ?, ?, 'Asia/Jakarta', 'IDR', 'id', ?, ?)`,
    )
    .bind(data.telegramId, data.username ?? null, data.firstName ?? null, now, now)
    .run();

  // Seed default categories
  const stmts = DEFAULT_CATEGORIES.map((c) =>
    d1
      .prepare(
        `INSERT INTO categories (user_id, name, icon, is_default, created_at) VALUES (?, ?, ?, 1, ?)`,
      )
      .bind(data.telegramId, c.name, c.icon, now),
  );
  await d1.batch(stmts);

  const created = await d1
    .prepare("SELECT * FROM users WHERE telegram_id = ?")
    .bind(data.telegramId)
    .first<any>();
  return { user: created, isNew: true };
}

// ---- CATEGORIES ----

export async function getCategoryByName(d1: D1Database, userId: number, name: string) {
  return d1
    .prepare("SELECT * FROM categories WHERE user_id = ? AND name = ? LIMIT 1")
    .bind(userId, name)
    .first<Category>();
}

export async function listCategories(d1: D1Database, userId: number) {
  return d1
    .prepare("SELECT * FROM categories WHERE user_id = ? ORDER BY name")
    .bind(userId)
    .all<Category>();
}

// ---- RECEIPTS ----

export async function saveReceipt(
  d1: D1Database,
  data: {
    id: string;
    userId: number;
    telegramFileId: string;
    telegramFileUniqueId?: string;
    mime: string;
    sizeBytes?: number;
    ocrJson: string;
  },
) {
  await d1
    .prepare(
      `INSERT INTO receipts (id, user_id, telegram_file_id, telegram_file_unique_id, mime, size_bytes, ocr_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      data.id,
      data.userId,
      data.telegramFileId,
      data.telegramFileUniqueId ?? null,
      data.mime,
      data.sizeBytes ?? null,
      data.ocrJson,
      nowSec(),
    )
    .run();
}

// ---- TRANSACTIONS ----

export async function insertTransaction(
  d1: D1Database,
  t: Omit<NewTransaction, "createdAt">,
) {
  const res = await d1
    .prepare(
      `INSERT INTO transactions
       (user_id, amount, currency, category_id, merchant, description, occurred_at,
        receipt_id, source, raw_input, llm_confidence, items_json, payment_method, is_deleted, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    )
    .bind(
      t.userId,
      t.amount,
      t.currency ?? "IDR",
      t.categoryId ?? null,
      t.merchant ?? null,
      t.description ?? null,
      t.occurredAt,
      t.receiptId ?? null,
      t.source,
      t.rawInput ?? null,
      t.llmConfidence ?? null,
      t.itemsJson ?? null,
      t.paymentMethod ?? null,
      nowSec(),
    )
    .run();
  return res.meta.last_row_id as number;
}

export async function getTransaction(d1: D1Database, id: number, userId: number) {
  return d1
    .prepare("SELECT * FROM transactions WHERE id = ? AND user_id = ? AND is_deleted = 0")
    .bind(id, userId)
    .first<TransactionRow>();
}

export async function updateTransactionCategory(
  d1: D1Database,
  id: number,
  userId: number,
  categoryId: number,
) {
  await d1
    .prepare("UPDATE transactions SET category_id = ? WHERE id = ? AND user_id = ?")
    .bind(categoryId, id, userId)
    .run();
}

export async function updateTransactionAmount(
  d1: D1Database,
  id: number,
  userId: number,
  amount: number,
) {
  await d1
    .prepare("UPDATE transactions SET amount = ? WHERE id = ? AND user_id = ?")
    .bind(amount, id, userId)
    .run();
}

export async function softDeleteTransaction(d1: D1Database, id: number, userId: number) {
  await d1
    .prepare("UPDATE transactions SET is_deleted = 1 WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .run();
}

export async function listTransactionsInRange(
  d1: D1Database,
  userId: number,
  fromSec: number,
  toSec: number,
) {
  return d1
    .prepare(
      `SELECT t.*, c.name AS category_name, c.icon AS category_icon
       FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = ? AND t.is_deleted = 0 AND t.occurred_at >= ? AND t.occurred_at < ?
       ORDER BY t.occurred_at DESC`,
    )
    .bind(userId, fromSec, toSec)
    .all<TransactionRowWithCategory>();
}

export async function aggregateByCategory(
  d1: D1Database,
  userId: number,
  fromSec: number,
  toSec: number,
) {
  return d1
    .prepare(
      `SELECT c.name AS name, c.icon AS icon, SUM(t.amount) AS total, COUNT(*) AS count
       FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = ? AND t.is_deleted = 0 AND t.occurred_at >= ? AND t.occurred_at < ?
       GROUP BY c.id ORDER BY total DESC`,
    )
    .bind(userId, fromSec, toSec)
    .all<{ name: string | null; icon: string | null; total: number; count: number }>();
}

export async function aggregateByMerchant(
  d1: D1Database,
  userId: number,
  fromSec: number,
  toSec: number,
  limit = 5,
) {
  return d1
    .prepare(
      `SELECT merchant AS name, SUM(amount) AS total, COUNT(*) AS count
       FROM transactions
       WHERE user_id = ? AND is_deleted = 0 AND occurred_at >= ? AND occurred_at < ?
         AND merchant IS NOT NULL AND merchant != ''
       GROUP BY merchant ORDER BY total DESC LIMIT ?`,
    )
    .bind(userId, fromSec, toSec, limit)
    .all<{ name: string; total: number; count: number }>();
}

export async function totalInRange(
  d1: D1Database,
  userId: number,
  fromSec: number,
  toSec: number,
): Promise<{ total: number; count: number }> {
  const row = await d1
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
       FROM transactions
       WHERE user_id = ? AND is_deleted = 0 AND occurred_at >= ? AND occurred_at < ?`,
    )
    .bind(userId, fromSec, toSec)
    .first<{ total: number; count: number }>();
  return row ?? { total: 0, count: 0 };
}

// ---- PENDING CONFIRMATIONS ----

export async function savePending(
  d1: D1Database,
  data: {
    id: string;
    userId: number;
    chatId: number;
    messageId?: number;
    payload: unknown;
    ttlSec?: number;
  },
) {
  const now = nowSec();
  await d1
    .prepare(
      `INSERT INTO pending_confirmations (id, user_id, chat_id, message_id, payload_json, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      data.id,
      data.userId,
      data.chatId,
      data.messageId ?? null,
      JSON.stringify(data.payload),
      now,
      now + (data.ttlSec ?? 3600),
    )
    .run();
}

export async function getPending(d1: D1Database, id: string, userId: number) {
  const row = await d1
    .prepare(
      "SELECT * FROM pending_confirmations WHERE id = ? AND user_id = ? AND expires_at > ?",
    )
    .bind(id, userId, nowSec())
    .first<any>();
  if (!row) return null;
  return { ...row, payload: JSON.parse(row.payload_json) };
}

export async function deletePending(d1: D1Database, id: string) {
  await d1.prepare("DELETE FROM pending_confirmations WHERE id = ?").bind(id).run();
}

// ---- USER LIST (for cron) ----

export async function listAllUsers(d1: D1Database) {
  return d1.prepare("SELECT * FROM users").all<any>();
}

// ---- LOGIN LINKS (deep link auth) ----

export async function createLoginLink(d1: D1Database, token: string, ttlSec = 600) {
  const now = nowSec();
  await d1
    .prepare("INSERT INTO login_links (token, expires_at, created_at) VALUES (?, ?, ?)")
    .bind(token, now + ttlSec, now)
    .run();
}

export async function claimLoginLink(d1: D1Database, token: string, userId: number) {
  const r = await d1
    .prepare(
      "UPDATE login_links SET user_id = ?, claimed_at = ? WHERE token = ? AND expires_at > ? AND claimed_at IS NULL",
    )
    .bind(userId, nowSec(), token, nowSec())
    .run();
  return (r.meta.changes ?? 0) > 0;
}

export async function getLoginLink(d1: D1Database, token: string) {
  return d1
    .prepare("SELECT * FROM login_links WHERE token = ? AND expires_at > ?")
    .bind(token, nowSec())
    .first<{ token: string; user_id: number | null; claimed_at: number | null; expires_at: number }>();
}

export async function consumeLoginLink(d1: D1Database, token: string) {
  await d1.prepare("DELETE FROM login_links WHERE token = ?").bind(token).run();
}
