export interface Env {
  // Bindings
  DB: D1Database;
  AI: Ai; // Cloudflare Workers AI

  // Vars
  DEFAULT_TIMEZONE: string;
  DEFAULT_CURRENCY: string;
  GEMINI_MODEL: string;
  MINIAPP_URL: string;

  // Secrets
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  GEMINI_API_KEY: string;
  GROQ_API_KEY: string;
}
