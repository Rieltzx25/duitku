# 💸 DuitKu

> Money tracker via Telegram + Gemini AI. **Free forever.**

Catat pengeluaran semudah chat ke teman. Kirim foto nota → auto-parse. Atau ketik aja "kopi 25rb di starbucks" → tercatat.

## ✨ Fitur

- 📸 **Foto Nota → Auto-parse** dengan Gemini Vision (struk thermal, tulisan tangan, invoice PDF, QRIS)
- 💬 **Input chat natural** — "bensin 50rb", "kemarin makan warteg 15000"
- 📊 **Dashboard Mini App** di dalam Telegram — grafik per kategori, filter, hapus
- 🤖 **Summary bulanan otomatis** dengan insight cerdas (LLM-generated)
- 🗂 **10 kategori default** + bisa custom
- 📤 **Export CSV** kapan saja
- 🔐 **Privacy-first** — data hanya kamu yang lihat, semua di akun Cloudflare-mu sendiri

## 🛠 Stack

| Layer | Tech | Biaya |
|---|---|---|
| Chat | Telegram Bot API | Gratis |
| Bot Runtime | Cloudflare Workers (grammY + Hono) | Gratis (100K req/hari) |
| LLM | Gemini 2.5 Flash Lite (vision + text) | Gratis (1500 req/hari) |
| Database | Cloudflare D1 (SQLite) | Gratis (5GB) |
| File Storage | Cloudflare R2 | Gratis (10GB) |
| Dashboard | Telegram Mini App (Vite + React) di Cloudflare Pages | Gratis |

**Estimasi total biaya untuk ratusan user pertama: Rp 0 / bulan.**

---

## 🚀 Setup dari Nol

### 1. Prerequisites

- Node.js 20+ dan `pnpm`
- Akun [Cloudflare](https://cloudflare.com) (gratis, no CC)
- Akun [Google AI Studio](https://aistudio.google.com) → buat API key
- Bot Telegram (chat [@BotFather](https://t.me/BotFather) → `/newbot` → catat token)

### 2. Install dependencies

```powershell
pnpm install
cd miniapp; pnpm install; cd ..
```

### 3. Login Cloudflare

```powershell
npx wrangler login
```

### 4. Buat D1 database + R2 bucket

```powershell
npx wrangler d1 create duitku_db
# → copy "database_id" yang muncul ke wrangler.toml (ganti REPLACE_WITH_YOUR_D1_ID_AFTER_CREATE)

npx wrangler r2 bucket create duitku-receipts
```

### 5. Apply migrations

```powershell
# Local (untuk dev)
pnpm db:migrate:local

# Production (setelah deploy nanti)
pnpm db:migrate:remote
```

### 6. Set secrets (production)

```powershell
npx wrangler secret put TELEGRAM_BOT_TOKEN
# paste token dari BotFather

npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
# bikin string random panjang, mis: openssl rand -hex 32
# atau di PowerShell: -join ((1..32) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })

npx wrangler secret put GEMINI_API_KEY
# paste dari AI Studio
```

> **Untuk local dev:** isi file `.dev.vars` (sudah ada template, tinggal ganti nilai)

### 7. Deploy worker

```powershell
pnpm deploy
# Output: https://duitku.YOUR-SUBDOMAIN.workers.dev
```

### 8. Register webhook Telegram

```powershell
node scripts/set-webhook.mjs https://duitku.YOUR-SUBDOMAIN.workers.dev YOUR_BOT_TOKEN YOUR_WEBHOOK_SECRET
```

### 9. Deploy Mini App ke Cloudflare Pages

```powershell
# Edit miniapp/src/api.ts → ganti API_BASE production URL ke worker-mu
pnpm miniapp:deploy
# Catat URL output, mis: https://duitku-miniapp.pages.dev
```

### 10. Update Mini App URL di wrangler.toml

```toml
[vars]
MINIAPP_URL = "https://duitku-miniapp.pages.dev"
```

Lalu deploy lagi: `pnpm deploy`

### 11. Set Mini App di BotFather

1. Chat [@BotFather](https://t.me/BotFather)
2. `/mybots` → pilih bot → **Bot Settings** → **Menu Button** → **Configure Menu Button**
3. Title: `📊 Dashboard`
4. URL: `https://duitku-miniapp.pages.dev`

---

## 💻 Local Development

```powershell
# Terminal 1: bot worker
pnpm dev

# Terminal 2: mini app
pnpm miniapp:dev

# Untuk test webhook lokal, pakai cloudflared tunnel atau ngrok:
# cloudflared tunnel --url http://localhost:8787
# lalu daftarin URL tunnel-nya ke Telegram via set-webhook.mjs
```

---

## 📱 Cara Pakai (untuk user)

1. Chat bot di Telegram → ketik `/start`
2. **Foto nota** → tunggu ~3 detik → bot kasih konfirmasi
3. **Atau chat aja**: "kopi 25rb di starbucks"
4. Klik tombol Dashboard untuk lihat grafik

### Commands

| Command | Fungsi |
|---|---|
| `/start` | Mulai / lihat help |
| `/today` | Pengeluaran hari ini |
| `/month` | Total bulan ini + breakdown |
| `/summary` | Summary bulanan dengan insight AI |
| `/list` | 10 transaksi terakhir |
| `/categories` | Lihat semua kategori |
| `/dashboard` | Buka Mini App dashboard |
| `/delete` | Hapus transaksi terakhir |
| `/export` | Download CSV bulan ini |
| `/help` | Bantuan |

---

## 🔒 Privacy

- Semua data di Cloudflare account *kamu sendiri* (kalau self-host).
- Foto nota disimpan di R2 milik kamu.
- Tidak ada tracking pihak ketiga, tidak ada analytics.
- User Telegram ID = primary key, tidak collect data lain.
- Mau hapus semua data? Drop D1 database & R2 bucket.

---

## 🤝 Contributing

Open source MIT. PR welcome.

## 📜 License

MIT
