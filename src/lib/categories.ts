export const DEFAULT_CATEGORIES = [
  { name: "Makanan & Minuman", icon: "🍔" },
  { name: "Belanja", icon: "🛒" },
  { name: "Transportasi", icon: "🚗" },
  { name: "Tagihan & Utilitas", icon: "💡" },
  { name: "Hiburan", icon: "🎮" },
  { name: "Kesehatan", icon: "💊" },
  { name: "Pendidikan", icon: "📚" },
  { name: "Investasi & Tabungan", icon: "💰" },
  { name: "Transfer", icon: "💸" },
  { name: "Lain-lain", icon: "📦" },
] as const;

export type DefaultCategoryName = (typeof DEFAULT_CATEGORIES)[number]["name"];
