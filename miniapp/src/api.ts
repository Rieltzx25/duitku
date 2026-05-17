import { getInitData } from "./telegram";

// Production: ke worker yang sudah deployed
const API_BASE = import.meta.env.DEV
  ? "http://localhost:8787/api"
  : "https://duitku.duitku-cliff.workers.dev/api";

const TOKEN_KEY = "duitku_jwt";

export const auth = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  setToken(t: string) {
    localStorage.setItem(TOKEN_KEY, t);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
  },
};

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };

  // Prefer Telegram initData (Mini App), else JWT (browser)
  const initData = getInitData();
  if (initData) {
    headers["X-Telegram-Init-Data"] = initData;
  } else {
    const tok = auth.getToken();
    if (tok) headers["Authorization"] = `Bearer ${tok}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    auth.clear();
    throw new Error("UNAUTHORIZED");
  }
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

export interface TelegramAuthData {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export const api = {
  me: () => call<{ userId: number }>("/me"),
  loginWithTelegram: (data: TelegramAuthData) =>
    call<{ token: string; user: { id: number; username?: string; firstName?: string } }>(
      "/auth/telegram-login",
      { method: "POST", body: JSON.stringify(data) },
    ),
  transactions: (from?: number, to?: number) => {
    const q = new URLSearchParams();
    if (from !== undefined) q.set("from", String(from));
    if (to !== undefined) q.set("to", String(to));
    return call<{ transactions: Transaction[] }>(`/transactions?${q}`);
  },
  summary: (from?: number, to?: number) => {
    const q = new URLSearchParams();
    if (from !== undefined) q.set("from", String(from));
    if (to !== undefined) q.set("to", String(to));
    return call<{ total: number; count: number; byCategory: CategoryAgg[] }>(`/summary?${q}`);
  },
  deleteTransaction: (id: number) => call(`/transactions/${id}`, { method: "DELETE" }),
};
