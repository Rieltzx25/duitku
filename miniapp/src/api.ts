import { getInitData } from "./telegram";

// Production: ke worker yang sudah deployed
const API_BASE = import.meta.env.DEV
  ? "http://localhost:8787/api"
  : "https://duitku.duitku-cliff.workers.dev/api";

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": getInitData(),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

export interface Transaction {
  id: number;
  amount: number;
  currency: string;
  merchant: string | null;
  description: string | null;
  occurred_at: number;
  source: string;
  payment_method: string | null;
  category_name: string | null;
  category_icon: string | null;
  receipt_id: string | null;
}

export interface CategoryAgg {
  name: string | null;
  icon: string | null;
  total: number;
  count: number;
}

export const api = {
  me: () => call<{ userId: number }>("/me"),
  transactions: (from?: number, to?: number) => {
    const q = new URLSearchParams();
    if (from) q.set("from", String(from));
    if (to) q.set("to", String(to));
    return call<{ transactions: Transaction[] }>(`/transactions?${q}`);
  },
  summary: (from?: number, to?: number) => {
    const q = new URLSearchParams();
    if (from) q.set("from", String(from));
    if (to) q.set("to", String(to));
    return call<{ total: number; count: number; byCategory: CategoryAgg[] }>(`/summary?${q}`);
  },
  deleteTransaction: (id: number) => call(`/transactions/${id}`, { method: "DELETE" }),
};
