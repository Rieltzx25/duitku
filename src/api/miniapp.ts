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
  createLoginLink,
  getLoginLink,
  consumeLoginLink,
} from "../db/queries";
import { startOfMonthSec, nowSec } from "../lib/time";
import { signJwt, verifyJwt, verifyTelegramLogin } from "../lib/jwt";

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
    allowHeaders: ["X-Telegram-Init-Data", "Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    maxAge: 86400,
  }),
);

// Deep-link login flow: generate token, user click open Telegram, bot claim, web poll.
miniAppApi.post("/auth/init-link", async (c) => {
  // Generate random URL-safe token (24 bytes → ~32 chars b64)
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const token = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  await createLoginLink(c.env.DB, token, 600); // 10 menit
  return c.json({ token, expiresIn: 600 });
});

miniAppApi.get("/auth/check-link", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ error: "missing token" }, 400);
  const link = await getLoginLink(c.env.DB, token);
  if (!link) return c.json({ ready: false, error: "expired" });
  if (!link.user_id) return c.json({ ready: false });

  // Claimed → issue JWT and consume
  const userRow = await c.env.DB.prepare("SELECT * FROM users WHERE telegram_id = ?")
    .bind(link.user_id)
    .first<any>();
  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJwt(
    {
      sub: link.user_id,
      iat: now,
      exp: now + 60 * 60 * 24 * 30,
      username: userRow?.username,
      firstName: userRow?.first_name,
    },
    c.env.TELEGRAM_WEBHOOK_SECRET,
  );
  await consumeLoginLink(c.env.DB, token);
  return c.json({
    ready: true,
    token: jwt,
    user: { id: link.user_id, username: userRow?.username, firstName: userRow?.first_name },
  });
});

// Legacy: Telegram Login Widget (butuh setdomain di BotFather). Tetap di-keep.
miniAppApi.post("/auth/telegram-login", async (c) => {
  const data = await c.req.json<Record<string, string>>();
  const ok = await verifyTelegramLogin(data, c.env.TELEGRAM_BOT_TOKEN);
  if (!ok) return c.json({ error: "Invalid Telegram login" }, 401);

  const userId = parseInt(data.id);
  await getOrCreateUser(c.env.DB, {
    telegramId: userId,
    username: data.username,
    firstName: data.first_name,
  });

  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt(
    {
      sub: userId,
      iat: now,
      exp: now + 60 * 60 * 24 * 30, // 30 hari
      username: data.username,
      firstName: data.first_name,
    },
    c.env.TELEGRAM_WEBHOOK_SECRET, // reuse secret as JWT signing key
  );
  return c.json({
    token,
    user: { id: userId, username: data.username, firstName: data.first_name },
  });
});

// Auth middleware — accept BOTH X-Telegram-Init-Data (Mini App) OR Bearer JWT (web)
miniAppApi.use("*", async (c, next) => {
  // Skip auth for /auth/* endpoints
  if (c.req.path.includes("/auth/")) {
    return next();
  }

  // Try JWT first (browser users)
  const authHeader = c.req.header("Authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = await verifyJwt(token, c.env.TELEGRAM_WEBHOOK_SECRET);
    if (payload) {
      c.set("userId", payload.sub);
      await next();
      return;
    }
  }

  // Try Telegram Mini App initData
  const initData = c.req.header("X-Telegram-Init-Data") ?? "";
  if (initData) {
    const user = await verifyInitData(initData, c.env.TELEGRAM_BOT_TOKEN);
    if (user) {
      await getOrCreateUser(c.env.DB, {
        telegramId: user.id,
        username: user.username,
        firstName: user.first_name,
      });
      c.set("userId", user.id);
      await next();
      return;
    }
  }

  return c.json({ error: "Unauthorized" }, 401);
});

miniAppApi.get("/me", async (c) => {
  return c.json({ userId: c.get("userId") });
});

function parseRange(c: any): { from: number; to: number } {
  const fromRaw = c.req.query("from");
  const toRaw = c.req.query("to");
  const from = fromRaw !== undefined ? parseInt(fromRaw) : startOfMonthSec("Asia/Jakarta");
  const to = toRaw !== undefined && parseInt(toRaw) > 0 ? parseInt(toRaw) : nowSec() + 1;
  return { from: isNaN(from) ? 0 : from, to: isNaN(to) ? nowSec() + 1 : to };
}

miniAppApi.get("/transactions", async (c) => {
  const userId = c.get("userId");
  const { from, to } = parseRange(c);
  const txns = await listTransactionsInRange(c.env.DB, userId, from, to);
  return c.json({ transactions: txns.results });
});

miniAppApi.get("/summary", async (c) => {
  const userId = c.get("userId");
  const { from, to } = parseRange(c);
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

  // Ambil URL fresh dari Telegram (file URL expire ~1 jam, jadi selalu refresh)
  const infoRes = await fetch(
    `https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${r.telegram_file_id}`,
  );
  const info = (await infoRes.json()) as any;
  if (!info.ok || !info.result?.file_path) {
    return c.json({ error: "file not available", details: info }, 404);
  }
  const fileRes = await fetch(
    `https://api.telegram.org/file/bot${c.env.TELEGRAM_BOT_TOKEN}/${info.result.file_path}`,
  );
  return new Response(fileRes.body, {
    headers: {
      "Content-Type": r.mime,
      "Cache-Control": "private, max-age=600",
    },
  });
});
