import { Hono } from "hono";
import { webhookCallback } from "grammy";
import type { Env } from "./lib/env";
import { createBot } from "./bot/handlers";
import { miniAppApi } from "./api/miniapp";
import { runMonthlySummary } from "./cron/summary";
import { runDailyBudgetCheck, runWeeklyInsights } from "./cron/alerts";
import { runQueueProcessor } from "./cron/queue";

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
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const d = new Date(event.scheduledTime);
    const hour = d.getUTCHours();
    const minute = d.getUTCMinutes();
    const dayOfMonth = d.getUTCDate();
    const dayOfWeek = d.getUTCDay();

    // Always process queue (runs every 5 min via */5 cron)
    ctx.waitUntil(runQueueProcessor(env));

    // Daily/weekly/monthly tasks based on time
    if (dayOfMonth === 1 && hour === 1 && minute < 10) {
      ctx.waitUntil(runMonthlySummary(env));
    } else if (dayOfWeek === 0 && hour === 4 && minute < 10) {
      ctx.waitUntil(runWeeklyInsights(env));
    } else if (hour === 3 && minute < 10) {
      ctx.waitUntil(runDailyBudgetCheck(env));
    }
  },
};
