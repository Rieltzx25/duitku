import { useEffect, useRef, useState } from "react";
import { auth } from "./api";

const BOT_USERNAME = "Moneymanaget_bot";
const API_BASE = import.meta.env.DEV
  ? "http://localhost:8787/api"
  : "https://duitku.duitku-cliff.workers.dev/api";

type Status = "idle" | "waiting" | "success" | "error";

export function Login({ onLogin }: { onLogin: () => void }) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startLogin = async () => {
    setStatus("waiting");
    setErrorMsg("");
    try {
      // 1. Init link
      const res = await fetch(`${API_BASE}/auth/init-link`, { method: "POST" });
      const { token } = (await res.json()) as { token: string };

      // 2. Open Telegram bot with login token
      const tgUrl = `https://t.me/${BOT_USERNAME}?start=login_${token}`;
      window.open(tgUrl, "_blank");

      // 3. Poll for claim
      pollRef.current = window.setInterval(async () => {
        try {
          const r = await fetch(`${API_BASE}/auth/check-link?token=${token}`);
          const data = (await r.json()) as { ready: boolean; token?: string; error?: string };
          if (data.error === "expired") {
            clearInterval(pollRef.current!);
            setStatus("error");
            setErrorMsg("Link expired. Coba lagi.");
            return;
          }
          if (data.ready && data.token) {
            clearInterval(pollRef.current!);
            auth.setToken(data.token);
            setStatus("success");
            setTimeout(onLogin, 300);
          }
        } catch (e) {
          console.error(e);
        }
      }, 2000);

      // Auto-stop polling after 10 menit
      setTimeout(() => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          if (status === "waiting") {
            setStatus("error");
            setErrorMsg("Timeout. Coba klik tombol login lagi.");
          }
        }
      }, 600_000);
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(String(e?.message ?? e));
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>💸</div>
        <h1 style={styles.title}>DuitKu</h1>
        <p style={styles.tagline}>Money tracker via Telegram. Free forever.</p>

        <div style={styles.features}>
          <div style={styles.feature}>📸 Foto nota auto-parse</div>
          <div style={styles.feature}>💬 Chat natural: "kopi 25rb"</div>
          <div style={styles.feature}>📊 Insight bulanan AI</div>
        </div>

        {status === "idle" && (
          <>
            <button onClick={startLogin} style={styles.loginBtn}>
              <span style={{ fontSize: 20 }}>🔐</span>
              Login dengan Telegram
            </button>
            <div style={styles.hint}>
              Belum punya akun? Klik tombol di atas — gratis & cuma butuh 5 detik.
            </div>
          </>
        )}

        {status === "waiting" && (
          <div style={styles.waitingBox}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Menunggu konfirmasi...</div>
            <div style={styles.hint}>
              Tab Telegram baru dibuka. Klik tombol <b>START</b> di chat bot, lalu kembali ke sini.
            </div>
            <button onClick={() => setStatus("idle")} style={styles.cancelBtn}>
              Batal
            </button>
          </div>
        )}

        {status === "success" && (
          <div style={styles.successBox}>
            <div style={{ fontSize: 48 }}>✅</div>
            <div style={{ fontWeight: 600, marginTop: 8 }}>Login berhasil!</div>
            <div style={styles.hint}>Memuat dashboard…</div>
          </div>
        )}

        {status === "error" && (
          <div style={styles.errorBox}>
            <div style={{ color: "#c00", marginBottom: 12 }}>❌ {errorMsg}</div>
            <button onClick={() => setStatus("idle")} style={styles.loginBtn}>
              Coba lagi
            </button>
          </div>
        )}

        <div style={styles.footer}>
          <a
            href={`https://t.me/${BOT_USERNAME}`}
            target="_blank"
            rel="noreferrer"
            style={styles.botLink}
          >
            atau pakai bot langsung di Telegram →
          </a>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  },
  card: {
    maxWidth: 420,
    width: "100%",
    background: "#fff",
    borderRadius: 20,
    padding: "40px 28px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
    textAlign: "center",
    color: "#1a1a1a",
  },
  logo: { fontSize: 56, marginBottom: 8 },
  title: { fontSize: 32, fontWeight: 700, margin: "0 0 8px", letterSpacing: -1 },
  tagline: { fontSize: 14, opacity: 0.65, margin: "0 0 28px" },
  features: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 28,
    textAlign: "left",
  },
  feature: {
    background: "#f5f5f7",
    padding: "10px 14px",
    borderRadius: 8,
    fontSize: 14,
  },
  loginBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    padding: "14px 20px",
    fontSize: 16,
    fontWeight: 600,
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    cursor: "pointer",
    marginBottom: 12,
    boxShadow: "0 4px 12px rgba(102, 126, 234, 0.4)",
  },
  cancelBtn: {
    marginTop: 16,
    padding: "10px 20px",
    background: "transparent",
    border: "1px solid #ddd",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13,
  },
  hint: { fontSize: 13, opacity: 0.6, marginBottom: 8 },
  waitingBox: { padding: "20px 0" },
  successBox: { padding: "20px 0" },
  errorBox: { padding: "12px 0" },
  footer: { marginTop: 20, fontSize: 13 },
  botLink: { color: "#667eea", textDecoration: "none", fontWeight: 500 },
};
