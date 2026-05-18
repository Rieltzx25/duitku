// Multi-provider router dengan fallback chain.
// Strategi: coba provider berurutan. Kalau gagal, langsung fallback.
// Auto-retry per provider 1x dengan backoff untuk transient errors.

import type { Env } from "../lib/env";
import type { ParsedReceipt, ParsedText } from "./schemas";
import { geminiLite, geminiFlash2, groqLlama, workersAi, type ParseProvider } from "./providers";

const RECEIPT_CHAIN: ParseProvider[] = [geminiLite, geminiFlash2, groqLlama, workersAi];
const TEXT_CHAIN: ParseProvider[] = [geminiLite, geminiFlash2, groqLlama, workersAi];

export interface RouterResult<T> {
  data: T;
  provider: string;
  attempts: { provider: string; error?: string; durationMs: number }[];
}

// Check apakah error itu "transient" (worth retry) atau permanent (langsung fallback)
function isTransient(err: any): boolean {
  const msg = String(err?.message ?? err);
  if (/\b(429|500|502|503|504)\b/.test(msg)) return true;
  if (/timeout|fetch failed|network/i.test(msg)) return true;
  if (/high demand|overloaded|busy/i.test(msg)) return true;
  return false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callWithRetry<T>(
  provider: ParseProvider,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (e1) {
    if (!isTransient(e1)) throw e1;
    console.log(`[LLM] ${provider.name} transient error, retrying in 1.5s...`);
    await sleep(1500);
    return await fn();
  }
}

export async function routeReceipt(
  imageBuffer: ArrayBuffer,
  mime: string,
  env: Env,
): Promise<RouterResult<ParsedReceipt>> {
  const attempts: RouterResult<ParsedReceipt>["attempts"] = [];
  let lastError: any = null;
  for (const provider of RECEIPT_CHAIN) {
    const start = Date.now();
    try {
      const data = await callWithRetry(provider, () => provider.parseReceipt(imageBuffer, mime, env));
      const durationMs = Date.now() - start;
      attempts.push({ provider: provider.name, durationMs });
      console.log(`[LLM] ✓ ${provider.name} OK in ${durationMs}ms`);
      return { data, provider: provider.name, attempts };
    } catch (e: any) {
      const durationMs = Date.now() - start;
      const msg = String(e?.message ?? e).slice(0, 200);
      attempts.push({ provider: provider.name, error: msg, durationMs });
      console.log(`[LLM] ✗ ${provider.name} failed in ${durationMs}ms: ${msg}`);
      lastError = e;
    }
  }
  throw new Error(`All providers failed. Last: ${String(lastError?.message ?? lastError)}`);
}

export async function routeText(
  text: string,
  env: Env,
): Promise<RouterResult<ParsedText>> {
  const attempts: RouterResult<ParsedText>["attempts"] = [];
  let lastError: any = null;
  for (const provider of TEXT_CHAIN) {
    const start = Date.now();
    try {
      const data = await callWithRetry(provider, () => provider.parseText(text, env));
      const durationMs = Date.now() - start;
      attempts.push({ provider: provider.name, durationMs });
      console.log(`[LLM] ✓ ${provider.name} OK in ${durationMs}ms`);
      return { data, provider: provider.name, attempts };
    } catch (e: any) {
      const durationMs = Date.now() - start;
      const msg = String(e?.message ?? e).slice(0, 200);
      attempts.push({ provider: provider.name, error: msg, durationMs });
      console.log(`[LLM] ✗ ${provider.name} failed in ${durationMs}ms: ${msg}`);
      lastError = e;
    }
  }
  throw new Error(`All providers failed. Last: ${String(lastError?.message ?? lastError)}`);
}
