import type { Env } from "../lib/env";
import { Bot } from "grammy";
import {
  listAllUsers,
  listBudgets,
  spendByCategory,
  totalInRange,
  getUserSettings,
  wasAlertSent,
  logAlert,
  listTransactionsInRange,
  aggregateByCategory,
} from "../db/queries";
import { startOfMonthSec, startOfPrevMonthSec, nowSec, formatIDRFull, monthNameID } from "../lib/time";
import { generateSummary } from "../llm/parse";

const TZ = "Asia/Jakarta";

/**
 * Daily run:
 * - Check budget thresholds (50%, 80%, 100%) for each user
 * - Send alert via Telegram if newly crossed (dedup via alert_log)
 */
export async function runDailyBudgetCheck(env: Env): Promise<void> {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  const users = await listAllUsers(env.DB);
  const monthStart = startOfMonthSec(TZ);
  const now = nowSec();
  const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM

  let alertsSent = 0;
  for (const u of users.results) {
    try {
      const settings = await getUserSettings(env.DB, u.telegram_id);
      if (!settings.budget_alerts_enabled) continue;

      const [budgets, spending, totalRow] = await Promise.all([
        listBudgets(env.DB, u.telegram_id),
        spendByCategory(env.DB, u.telegram_id, monthStart, now + 1),
        totalInRange(env.DB, u.telegram_id, monthStart, now + 1),
      ]);
      if (budgets.results.length === 0) continue;

      for (const b of budgets.results) {
        const spent = b.category_id === null ? totalRow.total : spending.get(b.category_id) ?? 0;
        const pct = b.amount > 0 ? (spent / b.amount) * 100 : 0;
        let threshold: 50 | 80 | 100 | null = null;
        if (pct >= 100) threshold = 100;
        else if (pct >= 80) threshold = 80;
        else if (pct >= 50) threshold = 50;
        if (!threshold) continue;

        const kind = `budget_${threshold}`;
        const key = `${monthKey}_${b.category_id ?? "overall"}`;
        if (await wasAlertSent(env.DB, u.telegram_id, kind, key)) continue;

        const label = b.category_id === null ? "Overall" : `${b.category_icon ?? ""} ${b.category_name ?? ""}`;
        const remaining = Math.max(0, b.amount - spent);
        const daysInMonth = 30;
        const daysPassed = Math.floor((now - monthStart) / 86400) + 1;
        const daysLeft = Math.max(0, daysInMonth - daysPassed);
        const dailyBudget = daysLeft > 0 ? remaining / daysLeft : 0;

        let msg = "";
        if (threshold === 100) {
          msg = `🔴 <b>Budget ${label} sudah habis!</b>\n\nTerpakai ${formatIDRFull(spent)} dari ${formatIDRFull(b.amount)} (${pct.toFixed(0)}%).\nMasih ada ${daysLeft} hari lagi di bulan ini.`;
        } else if (threshold === 80) {
          msg = `🟠 <b>Budget ${label} hampir habis</b>\n\nTerpakai ${formatIDRFull(spent)} dari ${formatIDRFull(b.amount)} (${pct.toFixed(0)}%).\nSisa ${formatIDRFull(remaining)} untuk ${daysLeft} hari = ${formatIDRFull(dailyBudget)}/hari.`;
        } else {
          msg = `🟡 <b>Budget ${label} sudah 50%</b>\n\nTerpakai ${formatIDRFull(spent)} dari ${formatIDRFull(b.amount)}.\nSisa ${formatIDRFull(remaining)} untuk ${daysLeft} hari lagi.`;
        }
        try {
          await bot.api.sendMessage(u.telegram_id, msg, { parse_mode: "HTML" });
          await logAlert(env.DB, u.telegram_id, kind, key);
          alertsSent++;
          await new Promise((r) => setTimeout(r, 80));
        } catch (e) {
          console.error(`Alert send fail user ${u.telegram_id}:`, e);
        }
      }
    } catch (e) {
      console.error(`Budget check fail user ${u.telegram_id}:`, e);
    }
  }
  console.log(`Budget alerts sent: ${alertsSent}`);
}

/**
 * Weekly run (Sunday): send AI-powered insights for the week
 */
export async function runWeeklyInsights(env: Env): Promise<void> {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  const users = await listAllUsers(env.DB);
  const now = nowSec();
  const weekStart = now - 7 * 86400;
  const prevWeekStart = now - 14 * 86400;
  const weekKey = new Date().toISOString().slice(0, 10);

  let sent = 0;
  for (const u of users.results) {
    try {
      const settings = await getUserSettings(env.DB, u.telegram_id);
      if (!settings.weekly_insights_enabled) continue;
      if (await wasAlertSent(env.DB, u.telegram_id, "weekly", weekKey)) continue;

      const [thisWeek, lastWeek, cats] = await Promise.all([
        totalInRange(env.DB, u.telegram_id, weekStart, now + 1),
        totalInRange(env.DB, u.telegram_id, prevWeekStart, weekStart),
        aggregateByCategory(env.DB, u.telegram_id, weekStart, now + 1),
      ]);
      if (thisWeek.count === 0) continue;

      const topCategories = cats.results
        .filter((c) => c.name)
        .slice(0, 3)
        .map((c) => ({ name: c.name!, total: c.total, count: c.count }));

      let narrative;
      try {
        narrative = await generateSummary(env, {
          monthName: "minggu ini",
          total: thisWeek.total,
          prevTotal: lastWeek.total > 0 ? lastWeek.total : null,
          topCategories,
          topMerchants: [],
          txnCount: thisWeek.count,
        });
      } catch {
        narrative = {
          headline: `Minggu ini kamu spend ${formatIDRFull(thisWeek.total)}.`,
          insights: topCategories.map((c) => `${c.name}: ${formatIDRFull(c.total)}`),
          coaching: "Review pengeluaran terbesar minggu lalu.",
        };
      }

      const msg = [
        `<b>📊 Insight Mingguan</b>`,
        ``,
        narrative.headline,
        ``,
        `💰 Total: <b>${formatIDRFull(thisWeek.total)}</b>`,
        `🧾 ${thisWeek.count} transaksi`,
        `📈 ${lastWeek.total > 0 ? (thisWeek.total > lastWeek.total ? "Naik" : "Turun") + " " + Math.abs(((thisWeek.total - lastWeek.total) / lastWeek.total) * 100).toFixed(0) + "% dari minggu lalu" : "(belum ada data minggu lalu)"}`,
        ``,
        `<b>💡 Insights:</b>`,
        ...narrative.insights.map((i) => `• ${i}`),
        ``,
        `<b>🎯 ${narrative.coaching}</b>`,
      ].join("\n");

      try {
        await bot.api.sendMessage(u.telegram_id, msg, { parse_mode: "HTML" });
        await logAlert(env.DB, u.telegram_id, "weekly", weekKey);
        sent++;
        await new Promise((r) => setTimeout(r, 80));
      } catch (e) {
        console.error(`Weekly send fail user ${u.telegram_id}:`, e);
      }
    } catch (e) {
      console.error(`Weekly fail user ${u.telegram_id}:`, e);
    }
  }
  console.log(`Weekly insights sent: ${sent}`);
}
