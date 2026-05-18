import { Hono } from "hono";
import { webhookCallback } from "grammy";
import type { Env } from "./lib/env";
import { createBot } from "./bot/handlers";
import { miniAppApi } from "./api/miniapp";
import { runMonthlySummary } from "./cron/summary";
import { runDailyBudgetCheck, runWeeklyInsights } from "./cron/alerts";

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
    // Cron triggers: budget daily (3 UTC = 10 WIB), weekly Sunday (4 UTC), monthly 1st (1 UTC = 8 WIB)
    const hour = d.getUTCHours();
    const dayOfMonth = d.getUTCDate();
    const dayOfWeek = d.getUTCDay(); // 0 = Sunday

    if (dayOfMonth === 1 && hour === 1) {
      ctx.waitUntil(runMonthlySummary(env));
    } else if (dayOfWeek === 0 && hour === 4) {
      ctx.waitUntil(runWeeklyInsights(env));
    } else {
      ctx.waitUntil(runDailyBudgetCheck(env));
    }
  },
};
