// Multi-provider LLM abstraction untuk resilience.
// Setiap provider implement ParseProvider interface.
// Router (di router.ts) coba provider berurutan sampai sukses.

import type { Env } from "../lib/env";
import { generateJSON, arrayBufferToBase64 } from "./gemini";
import { RECEIPT_SCHEMA, TEXT_PARSE_SCHEMA, type ParsedReceipt, type ParsedText } from "./schemas";
import { RECEIPT_PROMPT, TEXT_PROMPT } from "./prompts";

export interface ParseProvider {
  name: string;
  parseReceipt(imageBuffer: ArrayBuffer, mime: string, env: Env): Promise<ParsedReceipt>;
  parseText(text: string, env: Env): Promise<ParsedText>;
}

// ============ GEMINI 2.5 FLASH LITE (Primary) ============
export const geminiLite: ParseProvider = {
  name: "gemini-2.5-flash-lite",
  async parseReceipt(buf, mime, env) {
    const todayISO = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    return generateJSON<ParsedReceipt>({
      apiKey: env.GEMINI_API_KEY,
      model: "gemini-2.5-flash-lite",
      parts: [
        { text: RECEIPT_PROMPT(todayISO) },
        { inlineData: { mimeType: mime, data: arrayBufferToBase64(buf) } },
      ],
      responseSchema: RECEIPT_SCHEMA,
      temperature: 0.1,
    });
  },
  async parseText(text, env) {
    return generateJSON<ParsedText>({
      apiKey: env.GEMINI_API_KEY,
      model: "gemini-2.5-flash-lite",
      parts: [{ text: `${TEXT_PROMPT}\n\n"${text}"` }],
      responseSchema: TEXT_PARSE_SCHEMA,
      temperature: 0.1,
    });
  },
};

// ============ GEMINI 2.0 FLASH (Secondary, same key, different model) ============
export const geminiFlash2: ParseProvider = {
  name: "gemini-2.0-flash",
  async parseReceipt(buf, mime, env) {
    const todayISO = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    return generateJSON<ParsedReceipt>({
      apiKey: env.GEMINI_API_KEY,
      model: "gemini-2.0-flash",
      parts: [
        { text: RECEIPT_PROMPT(todayISO) },
        { inlineData: { mimeType: mime, data: arrayBufferToBase64(buf) } },
      ],
      responseSchema: RECEIPT_SCHEMA,
      temperature: 0.1,
    });
  },
  async parseText(text, env) {
    return generateJSON<ParsedText>({
      apiKey: env.GEMINI_API_KEY,
      model: "gemini-2.0-flash",
      parts: [{ text: `${TEXT_PROMPT}\n\n"${text}"` }],
      responseSchema: TEXT_PARSE_SCHEMA,
      temperature: 0.1,
    });
  },
};

// ============ GROQ Llama 4 Scout (Tertiary, super fast) ============
async function groqChat(opts: {
  apiKey: string; model: string;
  messages: any[]; jsonMode?: boolean;
}): Promise<string> {
  const body: any = {
    model: opts.model,
    messages: opts.messages,
    max_tokens: 2048,
    temperature: 0.1,
  };
  if (opts.jsonMode) body.response_format = { type: "json_object" };
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = (await res.json()) as any;
  return data.choices?.[0]?.message?.content ?? "";
}

const RECEIPT_JSON_SCHEMA_DESC = `{
  "type": "receipt" | "qris" | "invoice" | "handwritten" | "unknown",
  "merchant": "string",
  "total": number (in IDR, integer),
  "dateRaw": "string (raw date text from receipt, empty if none)",
  "items": [{"name":"string","qty":number,"unitPrice":number,"subtotal":number}] (optional, max 5),
  "category": one of ["Makanan & Minuman","Belanja","Transportasi","Tagihan & Utilitas","Hiburan","Kesehatan","Pendidikan","Investasi & Tabungan","Transfer","Lain-lain"],
  "paymentMethod": "string" (optional),
  "confidence": number 0-1,
  "notes": "string" (optional, max 1 kalimat, JANGAN bahas tanggal)
}`;

export const groqLlama: ParseProvider = {
  name: "groq-llama-4-scout",
  async parseReceipt(buf, mime, env) {
    const todayISO = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const base64 = arrayBufferToBase64(buf);
    const sys = RECEIPT_PROMPT(todayISO) + `\n\nWAJIB output VALID JSON dengan schema:\n${RECEIPT_JSON_SCHEMA_DESC}`;
    const raw = await groqChat({
      apiKey: env.GROQ_API_KEY,
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: sys },
            { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
          ],
        },
      ],
      jsonMode: true,
    });
    return parseJsonLoose<ParsedReceipt>(raw);
  },
  async parseText(text, env) {
    const sys = TEXT_PROMPT + `\n\nWAJIB output VALID JSON dengan schema:\n${TEXT_PARSE_JSON_DESC}\n\nInput: "${text}"`;
    const raw = await groqChat({
      apiKey: env.GROQ_API_KEY,
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: sys }],
      jsonMode: true,
    });
    return parseJsonLoose<ParsedText>(raw);
  },
};

const TEXT_PARSE_JSON_DESC = `{
  "amount": number (IDR integer),
  "merchant": "string" (optional),
  "description": "string" (optional),
  "category": one of ["Makanan & Minuman","Belanja","Transportasi","Tagihan & Utilitas","Hiburan","Kesehatan","Pendidikan","Investasi & Tabungan","Transfer","Lain-lain"],
  "date": "YYYY-MM-DD" (optional),
  "confidence": number 0-1,
  "isExpense": boolean
}`;

// ============ CLOUDFLARE WORKERS AI (Native fallback, $0) ============
export const workersAi: ParseProvider = {
  name: "cf-workers-ai-llama-3.2-vision",
  async parseReceipt(buf, mime, env) {
    const todayISO = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const sys = RECEIPT_PROMPT(todayISO) + `\n\nWAJIB output VALID JSON saja (tanpa text lain) dengan schema:\n${RECEIPT_JSON_SCHEMA_DESC}`;
    const imgArr = Array.from(new Uint8Array(buf));
    const result = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct" as any, {
      prompt: sys,
      image: imgArr,
      max_tokens: 2048,
    }) as any;
    const txt = typeof result === "string" ? result : (result.response ?? result.result ?? "");
    return parseJsonLoose<ParsedReceipt>(txt);
  },
  async parseText(text, env) {
    const sys = TEXT_PROMPT + `\n\nWAJIB output VALID JSON saja dengan schema:\n${TEXT_PARSE_JSON_DESC}\n\nInput: "${text}"`;
    const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct" as any, {
      prompt: sys,
      max_tokens: 800,
    }) as any;
    const txt = typeof result === "string" ? result : (result.response ?? "");
    return parseJsonLoose<ParsedText>(txt);
  },
};

// Helper: parse JSON dari output LLM yang mungkin ada markdown fence atau extra text
function parseJsonLoose<T>(text: string): T {
  if (!text) throw new Error("Empty LLM output");
  // Try direct
  try { return JSON.parse(text) as T; } catch {}
  // Try strip markdown fence
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try { return JSON.parse(cleaned) as T; } catch {}
  // Try extract JSON object via regex
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]) as T; } catch {}
  }
  throw new Error(`Cannot parse JSON from: ${text.slice(0, 200)}`);
}
