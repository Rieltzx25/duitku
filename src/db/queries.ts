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

// ---- BUDGETS ----

export interface BudgetRow {
  id: number;
  user_id: number;
  category_id: number | null;
  amount: number;
  period: string;
  created_at: number;
  updated_at: number;
}

export async function listBudgets(d1: D1Database, userId: number) {
  return d1
    .prepare(
      `SELECT b.*, c.name AS category_name, c.icon AS category_icon
       FROM budgets b LEFT JOIN categories c ON b.category_id = c.id
       WHERE b.user_id = ? ORDER BY b.category_id IS NULL, c.name`,
    )
    .bind(userId)
    .all<BudgetRow & { category_name: string | null; category_icon: string | null }>();
}

export async function upsertBudget(
  d1: D1Database,
  userId: number,
  categoryId: number | null,
  amount: number,
) {
  const now = nowSec();
  // Try update first
  const existing = await d1
    .prepare(
      "SELECT id FROM budgets WHERE user_id = ? AND " +
        (categoryId === null ? "category_id IS NULL" : "category_id = ?"),
    )
    .bind(...(categoryId === null ? [userId] : [userId, categoryId]))
    .first<{ id: number }>();
  if (existing) {
    await d1
      .prepare("UPDATE budgets SET amount = ?, updated_at = ? WHERE id = ?")
      .bind(amount, now, existing.id)
      .run();
    return existing.id;
  }
  const r = await d1
    .prepare(
      "INSERT INTO budgets (user_id, category_id, amount, period, created_at, updated_at) VALUES (?, ?, ?, 'monthly', ?, ?)",
    )
    .bind(userId, categoryId, amount, now, now)
    .run();
  return r.meta.last_row_id as number;
}

export async function deleteBudget(d1: D1Database, id: number, userId: number) {
  await d1
    .prepare("DELETE FROM budgets WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .run();
}

// Spend per kategori untuk perbandingan budget
export async function spendByCategory(
  d1: D1Database,
  userId: number,
  fromSec: number,
  toSec: number,
): Promise<Map<number, number>> {
  const r = await d1
    .prepare(
      `SELECT category_id, SUM(amount) as total FROM transactions
       WHERE user_id = ? AND is_deleted = 0 AND occurred_at >= ? AND occurred_at < ?
       GROUP BY category_id`,
    )
    .bind(userId, fromSec, toSec)
    .all<{ category_id: number | null; total: number }>();
  const m = new Map<number, number>();
  for (const row of r.results) {
    if (row.category_id !== null) m.set(row.category_id, row.total);
  }
  return m;
}

// ---- ALERT LOG (dedup) ----

export async function wasAlertSent(d1: D1Database, userId: number, kind: string, key: string) {
  const r = await d1
    .prepare("SELECT id FROM alert_log WHERE user_id = ? AND kind = ? AND key = ? LIMIT 1")
    .bind(userId, kind, key)
    .first();
  return !!r;
}

export async function logAlert(d1: D1Database, userId: number, kind: string, key: string) {
  await d1
    .prepare("INSERT INTO alert_log (user_id, kind, key, sent_at) VALUES (?, ?, ?, ?)")
    .bind(userId, kind, key, nowSec())
    .run();
}

// ---- USER SETTINGS ----

export async function getUserSettings(d1: D1Database, userId: number) {
  let r = await d1
    .prepare("SELECT * FROM user_settings WHERE user_id = ?")
    .bind(userId)
    .first<any>();
  if (!r) {
    await d1
      .prepare(
        "INSERT INTO user_settings (user_id, updated_at) VALUES (?, ?)",
      )
      .bind(userId, nowSec())
      .run();
    r = {
      user_id: userId,
      budget_alerts_enabled: 1,
      weekly_insights_enabled: 1,
      monthly_summary_enabled: 1,
      updated_at: nowSec(),
    };
  }
  return r;
}

export async function updateUserSettings(
  d1: D1Database,
  userId: number,
  patch: { budget_alerts_enabled?: boolean; weekly_insights_enabled?: boolean; monthly_summary_enabled?: boolean },
) {
  await getUserSettings(d1, userId); // ensure exists
  const sets: string[] = [];
  const vals: any[] = [];
  if (patch.budget_alerts_enabled !== undefined) {
    sets.push("budget_alerts_enabled = ?");
    vals.push(patch.budget_alerts_enabled ? 1 : 0);
  }
  if (patch.weekly_insights_enabled !== undefined) {
    sets.push("weekly_insights_enabled = ?");
    vals.push(patch.weekly_insights_enabled ? 1 : 0);
  }
  if (patch.monthly_summary_enabled !== undefined) {
    sets.push("monthly_summary_enabled = ?");
    vals.push(patch.monthly_summary_enabled ? 1 : 0);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = ?");
  vals.push(nowSec(), userId);
  await d1
    .prepare(`UPDATE user_settings SET ${sets.join(", ")} WHERE user_id = ?`)
    .bind(...vals)
    .run();
}

// ---- TRANSACTION UPDATE (full) ----

export async function updateTransactionFull(
  d1: D1Database,
  id: number,
  userId: number,
  patch: {
    amount?: number;
    categoryId?: number | null;
    merchant?: string | null;
    description?: string | null;
    occurredAt?: number;
    paymentMethod?: string | null;
  },
) {
  const sets: string[] = [];
  const vals: any[] = [];
  if (patch.amount !== undefined) { sets.push("amount = ?"); vals.push(patch.amount); }
  if (patch.categoryId !== undefined) { sets.push("category_id = ?"); vals.push(patch.categoryId); }
  if (patch.merchant !== undefined) { sets.push("merchant = ?"); vals.push(patch.merchant); }
  if (patch.description !== undefined) { sets.push("description = ?"); vals.push(patch.description); }
  if (patch.occurredAt !== undefined) { sets.push("occurred_at = ?"); vals.push(patch.occurredAt); }
  if (patch.paymentMethod !== undefined) { sets.push("payment_method = ?"); vals.push(patch.paymentMethod); }
  if (sets.length === 0) return;
  vals.push(id, userId);
  await d1
    .prepare(`UPDATE transactions SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`)
    .bind(...vals)
    .run();
}

// ---- DAILY SERIES (for line chart) ----

export async function dailyTotals(
  d1: D1Database,
  userId: number,
  fromSec: number,
  toSec: number,
  tzOffsetSec: number = 7 * 3600,
): Promise<Array<{ date: string; total: number; count: number }>> {
  // Convert occurred_at (UTC sec) → local date by adding offset
  const r = await d1
    .prepare(
      `SELECT strftime('%Y-%m-%d', occurred_at + ${tzOffsetSec}, 'unixepoch') AS date,
              SUM(amount) AS total, COUNT(*) AS count
       FROM transactions
       WHERE user_id = ? AND is_deleted = 0 AND occurred_at >= ? AND occurred_at < ?
       GROUP BY date ORDER BY date`,
    )
    .bind(userId, fromSec, toSec)
    .all<{ date: string; total: number; count: number }>();
  return r.results;
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
