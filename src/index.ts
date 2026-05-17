import { Hono } from "hono";
import { webhookCallback } from "grammy";
import type { Env } from "./lib/env";
import { createBot } from "./bot/handlers";
import { miniAppApi } from "./api/miniapp";
import { runMonthlySummary } from "./cron/summary";

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.text("DuitKu Bot is running 🚀"));

// Telegram webhook
app.post("/webhook/telegram", async (c) => {
  // Verify secret token (Telegram sends X-Telegram-Bot-Api-Secret-Token)
  const secret = c.req.header("X-Telegram-Bot-Api-Secret-Token");
  if (secret !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.text("Forbidden", 403);
  }
  const bot = createBot(c.env);
  const handle = webhookCallback(bot, "hono");
  return handle(c);
});

// Mini App API
app.route("/api", miniAppApi);

// Health check + version
app.get("/health", (c) =>
  c.json({ ok: true, time: new Date().toISOString(), version: "0.1.0" }),
);

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runMonthlySummary(env));
  },
};
