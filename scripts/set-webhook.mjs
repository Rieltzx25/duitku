// Script untuk register Telegram webhook ke Cloudflare Worker URL
// Pakai: node scripts/set-webhook.mjs <worker-url> <bot-token> <secret>
// Contoh: node scripts/set-webhook.mjs https://duitku.username.workers.dev BOT_TOKEN SECRET

const [, , workerUrl, botToken, secret] = process.argv;

if (!workerUrl || !botToken || !secret) {
  console.error("Usage: node scripts/set-webhook.mjs <worker-url> <bot-token> <secret>");
  process.exit(1);
}

const webhookUrl = `${workerUrl.replace(/\/$/, "")}/webhook/telegram`;

const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  }),
});

const data = await res.json();
console.log(JSON.stringify(data, null, 2));

if (!data.ok) {
  console.error("❌ Failed to set webhook");
  process.exit(1);
}

console.log(`\n✅ Webhook set: ${webhookUrl}`);

// Verify
const info = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`).then((r) => r.json());
console.log("\nWebhook info:", JSON.stringify(info.result, null, 2));
