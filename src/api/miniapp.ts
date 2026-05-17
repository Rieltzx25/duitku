import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "../lib/env";
import {
  listTransactionsInRange,
  totalInRange,
  aggregateByCategory,
  listCategories,
  softDeleteTransaction,
  updateTransactionCategory,
  updateTransactionAmount,
  getOrCreateUser,
} from "../db/queries";
import { startOfMonthSec, nowSec } from "../lib/time";

// Telegram Mini App initData validation
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
async function verifyInitData(initData: string, botToken: string): Promise<any | null> {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  // HMAC-SHA256(secret = HMAC-SHA256("WebAppData", botToken), dataCheckString)
  const enc = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    "raw",
    enc.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const secret = await crypto.subtle.sign("HMAC", secretKey, enc.encode(botToken));

  const checkKey = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", checkKey, enc.encode(dataCheckString));
  const computedHash = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (computedHash !== hash) return null;

  // Check freshness (24 jam)
  const authDate = parseInt(params.get("auth_date") ?? "0");
  if (Date.now() / 1000 - authDate > 86400) return null;

  const userJson = params.get("user");
  if (!userJson) return null;
  return JSON.parse(userJson);
}

export const miniAppApi = new Hono<{ Bindings: Env; Variables: { userId: number } }>();

miniAppApi.use(
  "*",
  cors({
    origin: (origin) => origin ?? "*",
    allowHeaders: ["X-Telegram-Init-Data", "Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);

// Auth middleware
miniAppApi.use("*", async (c, next) => {
  const initData = c.req.header("X-Telegram-Init-Data") ?? "";
  if (!initData) {
    return c.json({ error: "Missing X-Telegram-Init-Data" }, 401);
  }
  const user = await verifyInitData(initData, c.env.TELEGRAM_BOT_TOKEN);
  if (!user) {
    return c.json({ error: "Invalid initData" }, 401);
  }
  await getOrCreateUser(c.env.DB, {
    telegramId: user.id,
    username: user.username,
    firstName: user.first_name,
  });
  c.set("userId", user.id);
  await next();
});

miniAppApi.get("/me", async (c) => {
  return c.json({ userId: c.get("userId") });
});

miniAppApi.get("/transactions", async (c) => {
  const userId = c.get("userId");
  const from = parseInt(c.req.query("from") ?? "0") || startOfMonthSec("Asia/Jakarta");
  const to = parseInt(c.req.query("to") ?? "0") || nowSec() + 1;
  const txns = await listTransactionsInRange(c.env.DB, userId, from, to);
  return c.json({ transactions: txns.results });
});

miniAppApi.get("/summary", async (c) => {
  const userId = c.get("userId");
  const tz = "Asia/Jakarta";
  const from = parseInt(c.req.query("from") ?? "0") || startOfMonthSec(tz);
  const to = parseInt(c.req.query("to") ?? "0") || nowSec() + 1;
  const total = await totalInRange(c.env.DB, userId, from, to);
  const byCategory = await aggregateByCategory(c.env.DB, userId, from, to);
  return c.json({
    total: total.total,
    count: total.count,
    byCategory: byCategory.results,
  });
});

miniAppApi.get("/categories", async (c) => {
  const userId = c.get("userId");
  const cats = await listCategories(c.env.DB, userId);
  return c.json({ categories: cats.results });
});

miniAppApi.delete("/transactions/:id", async (c) => {
  const userId = c.get("userId");
  const id = parseInt(c.req.param("id"));
  await softDeleteTransaction(c.env.DB, id, userId);
  return c.json({ ok: true });
});

miniAppApi.put("/transactions/:id", async (c) => {
  const userId = c.get("userId");
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json<{ amount?: number; categoryId?: number }>();
  if (typeof body.amount === "number") {
    await updateTransactionAmount(c.env.DB, id, userId, body.amount);
  }
  if (typeof body.categoryId === "number") {
    await updateTransactionCategory(c.env.DB, id, userId, body.categoryId);
  }
  return c.json({ ok: true });
});

miniAppApi.get("/receipt/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  // verify ownership
  const r = await c.env.DB.prepare("SELECT * FROM receipts WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<any>();
  if (!r) return c.json({ error: "not found" }, 404);
  const obj = await c.env.RECEIPTS.get(r.r2_key);
  if (!obj) return c.json({ error: "not found in r2" }, 404);
  return new Response(obj.body, {
    headers: { "Content-Type": r.mime, "Cache-Control": "private, max-age=3600" },
  });
});
