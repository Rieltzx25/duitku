import type { Env } from "../lib/env";
import { generateJSON, arrayBufferToBase64 } from "./gemini";
import {
  RECEIPT_SCHEMA,
  TEXT_PARSE_SCHEMA,
  SUMMARY_SCHEMA,
  type ParsedReceipt,
  type ParsedText,
  type SummaryNarrative,
} from "./schemas";
import { RECEIPT_PROMPT, TEXT_PROMPT, SUMMARY_PROMPT } from "./prompts";

export async function parseReceiptImage(
  env: Env,
  imageBuffer: ArrayBuffer,
  mimeType: string,
): Promise<ParsedReceipt> {
  const base64 = arrayBufferToBase64(imageBuffer);
  return generateJSON<ParsedReceipt>({
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL,
    parts: [
      { text: RECEIPT_PROMPT },
      { inlineData: { mimeType, data: base64 } },
    ],
    responseSchema: RECEIPT_SCHEMA,
    temperature: 0.1,
  });
}

export async function parseTextInput(
  env: Env,
  text: string,
): Promise<ParsedText> {
  return generateJSON<ParsedText>({
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL,
    parts: [{ text: `${TEXT_PROMPT}\n\n"${text}"` }],
    responseSchema: TEXT_PARSE_SCHEMA,
    temperature: 0.1,
  });
}

export async function generateSummary(
  env: Env,
  data: Parameters<typeof SUMMARY_PROMPT>[0],
): Promise<SummaryNarrative> {
  return generateJSON<SummaryNarrative>({
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL,
    parts: [{ text: SUMMARY_PROMPT(data) }],
    responseSchema: SUMMARY_SCHEMA,
    temperature: 0.7,
  });
}
