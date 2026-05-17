import type { Env } from "../lib/env";
import { Bot } from "grammy";
import { listAllUsers } from "../db/queries";
import { buildSummaryFor } from "../bot/handlers";

export async function runMonthlySummary(env: Env): Promise<void> {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  const users = await listAllUsers(env.DB);

  let success = 0;
  let failed = 0;

  for (const u of users.results) {
    try {
      const text = await buildSummaryFor(env, u.telegram_id);
      await bot.api.sendMessage(u.telegram_id, text, { parse_mode: "Markdown" });
      success++;
      // Sedikit delay biar tidak kena rate limit Telegram
      await new Promise((r) => setTimeout(r, 100));
    } catch (e) {
      console.error(`Failed summary for user ${u.telegram_id}:`, e);
      failed++;
    }
  }

  console.log(`Monthly summary sent: ${success} success, ${failed} failed`);
}
