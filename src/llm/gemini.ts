// Direct REST client untuk Gemini API (Workers-compatible, no Node deps)

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string }; // base64
}

export interface GenerateOptions {
  model: string;
  apiKey: string;
  parts: GeminiPart[];
  systemInstruction?: string;
  responseSchema?: object;
  temperature?: number;
  maxOutputTokens?: number;
}

export async function generate(opts: GenerateOptions): Promise<string> {
  const body: any = {
    contents: [{ role: "user", parts: opts.parts }],
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      maxOutputTokens: opts.maxOutputTokens ?? 2048,
    },
  };

  if (opts.systemInstruction) {
    body.systemInstruction = { parts: [{ text: opts.systemInstruction }] };
  }

  if (opts.responseSchema) {
    body.generationConfig.responseMimeType = "application/json";
    body.generationConfig.responseSchema = opts.responseSchema;
  }

  const url = `${API_BASE}/models/${opts.model}:generateContent?key=${opts.apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(`Gemini returned no text. Response: ${JSON.stringify(data)}`);
  }
  return text;
}

export async function generateJSON<T = unknown>(opts: GenerateOptions): Promise<T> {
  const text = await generate(opts);
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    // Sometimes wrapped in markdown code fences
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    return JSON.parse(cleaned) as T;
  }
}

// Convert ArrayBuffer ke base64 (Workers-compatible, no Buffer)
export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}
