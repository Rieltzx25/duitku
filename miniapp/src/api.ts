import { getInitData } from "./telegram";

const API_BASE = import.meta.env.DEV
  ? "http://localhost:8787/api"
  : "https://duitku.duitku-cliff.workers.dev/api";

const TOKEN_KEY = "duitku_jwt";

export const auth = {
  getToken(): string | null { return localStorage.getItem(TOKEN_KEY); },
  setToken(t: string) { localStorage.setItem(TOKEN_KEY, t); },
  clear() { localStorage.removeItem(TOKEN_KEY); },
};

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  const initData = getInitData();
  if (initData) headers["X-Telegram-Init-Data"] = initData;
  else {
    const tok = auth.getToken();
    if (tok) headers["Authorization"] = `Bearer ${tok}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    auth.clear();
    throw new Error("UNAUTHORIZED");
  }
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`API ${res.status}: ${txt}`);
  }
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
  category_id: number | null;
}

export interface CategoryAgg {
  name: string | null;
  icon: string | null;
  total: number;
  count: number;
}

export interface Category {
  id: number;
  name: string;
  icon: string;
}

export interface Budget {
  id: number;
  categoryId: number | null;
  categoryName: string | null;
  categoryIcon: string | null;
  amount: number;
  spent: number;
}

export interface Comparison {
  thisMonth: number;
  lastMonth: number;
  thisMonthCount: number;
  lastMonthCount: number;
  avgPerDay: number;
  dayInMonth: number;
}

export interface DailySeries {
  series: { date: string; total: number; count: number }[];
}

export interface Settings {
  budgetAlertsEnabled: boolean;
  weeklyInsightsEnabled: boolean;
  monthlySummaryEnabled: boolean;
}

export interface TelegramAuthData {
  id: number;
  first_name?: string;
  username?: string;
  auth_date: number;
  hash: string;
  [k: string]: any;
}

const q = (params: Record<string, any>) => {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined) u.set(k, String(v)); });
  return u.toString();
};

export const api = {
  me: () => call<{ userId: number }>("/me"),
  loginWithTelegram: (data: TelegramAuthData) =>
    call<{ token: string; user: any }>("/auth/telegram-login", { method: "POST", body: JSON.stringify(data) }),

  transactions: (from?: number, to?: number) =>
    call<{ transactions: Transaction[] }>(`/transactions?${q({ from, to })}`),
  addTransaction: (data: {
    amount: number; merchant?: string; description?: string;
    categoryName?: string; occurredAt?: number; paymentMethod?: string;
  }) => call<{ id: number }>(`/transactions`, { method: "POST", body: JSON.stringify(data) }),
  updateTransaction: (id: number, patch: {
    amount?: number; merchant?: string | null; description?: string | null;
    categoryName?: string | null; occurredAt?: number; paymentMethod?: string | null;
  }) => call(`/transactions/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteTransaction: (id: number) => call(`/transactions/${id}`, { method: "DELETE" }),

  summary: (from?: number, to?: number) =>
    call<{ total: number; count: number; byCategory: CategoryAgg[] }>(`/summary?${q({ from, to })}`),
  comparison: () => call<Comparison>(`/comparison`),
  dailyTrend: (from?: number, to?: number) =>
    call<DailySeries>(`/trends/daily?${q({ from, to })}`),

  categories: () => call<{ categories: Category[] }>(`/categories`),

  budgets: () => call<{ budgets: Budget[] }>(`/budgets`),
  setBudget: (categoryId: number | null, amount: number) =>
    call<{ id: number }>(`/budgets`, { method: "POST", body: JSON.stringify({ categoryId, amount }) }),
  deleteBudget: (id: number) => call(`/budgets/${id}`, { method: "DELETE" }),

  settings: () => call<Settings>(`/settings`),
  updateSettings: (s: Partial<Settings>) =>
    call(`/settings`, { method: "PATCH", body: JSON.stringify(s) }),

  receiptUrl: (id: string) => {
    const tok = auth.getToken();
    if (tok) return `${API_BASE}/receipt/${id}?_t=${tok}`;
    return `${API_BASE}/receipt/${id}`;
  },
};
