import { useEffect, useState, type ReactNode, type CSSProperties } from "react";
import { theme } from "./theme";

// ---- TOAST SYSTEM ----
type Toast = { id: number; msg: string; kind: "success" | "error" | "info" };
const toastListeners = new Set<(t: Toast) => void>();
let toastSeq = 0;

export const toast = {
  success: (msg: string) => emit(msg, "success"),
  error: (msg: string) => emit(msg, "error"),
  info: (msg: string) => emit(msg, "info"),
};

function emit(msg: string, kind: Toast["kind"]) {
  const t: Toast = { id: ++toastSeq, msg, kind };
  toastListeners.forEach((cb) => cb(t));
}

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const cb = (t: Toast) => {
      setItems((arr) => [...arr, t]);
      setTimeout(() => setItems((arr) => arr.filter((x) => x.id !== t.id)), 3500);
    };
    toastListeners.add(cb);
    return () => { toastListeners.delete(cb); };
  }, []);
  return (
    <div style={styles.toastHost}>
      {items.map((t) => {
        const bg = t.kind === "success" ? theme.color.success : t.kind === "error" ? theme.color.danger : theme.color.info;
        const icon = t.kind === "success" ? "✓" : t.kind === "error" ? "✕" : "ℹ";
        return (
          <div key={t.id} style={{ ...styles.toast, background: bg }}>
            <span style={{ fontWeight: 700, marginRight: 8 }}>{icon}</span>
            {t.msg}
          </div>
        );
      })}
    </div>
  );
}

// ---- MODAL ----
export function Modal({
  open, onClose, title, children, actions, size = "md",
}: {
  open: boolean; onClose: () => void; title: string;
  children: ReactNode; actions?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  const maxW = size === "sm" ? 360 : size === "lg" ? 600 : 480;
  return (
    <div style={styles.modalBackdrop} onClick={onClose}>
      <div style={{ ...styles.modal, maxWidth: maxW }} onClick={(e) => e.stopPropagation()}>
        <header style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>{title}</h3>
          <button onClick={onClose} style={styles.modalClose} aria-label="Tutup">×</button>
        </header>
        <div style={styles.modalBody}>{children}</div>
        {actions && <footer style={styles.modalActions}>{actions}</footer>}
      </div>
    </div>
  );
}

// ---- BUTTON ----
export function Button({
  children, onClick, variant = "primary", size = "md", disabled, fullWidth, type, style: extraStyle,
}: {
  children: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  fullWidth?: boolean;
  type?: "button" | "submit";
  style?: CSSProperties;
}) {
  const baseStyle: CSSProperties = {
    border: "none",
    borderRadius: theme.radius.md,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: `all ${theme.duration.fast}`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    fontSize: size === "sm" ? 13 : size === "lg" ? 15 : 14,
    padding: size === "sm" ? "8px 14px" : size === "lg" ? "14px 22px" : "10px 18px",
    width: fullWidth ? "100%" : undefined,
    fontFamily: "inherit",
  };
  const variantStyle: CSSProperties =
    variant === "primary" ? { background: theme.color.primaryGradient, color: "#fff" } :
    variant === "secondary" ? { background: theme.color.bgTertiary, color: theme.color.text } :
    variant === "ghost" ? { background: "transparent", color: theme.color.text } :
    variant === "danger" ? { background: theme.color.danger, color: "#fff" } :
    { background: theme.color.success, color: "#fff" };
  return (
    <button type={type ?? "button"} onClick={onClick} disabled={disabled} style={{ ...baseStyle, ...variantStyle, ...extraStyle }}>
      {children}
    </button>
  );
}

// ---- INPUT ----
type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "style"> & {
  value: string | number;
  onChange: (v: string) => void;
  style?: CSSProperties;
};
export function Input({ value, onChange, style: extraStyle, type = "text", ...rest }: InputProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...styles.input, ...extraStyle }}
      {...rest}
    />
  );
}

// ---- SELECT ----
export function Select({ value, onChange, options, placeholder, style: extraStyle }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string; style?: CSSProperties;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...styles.input, ...extraStyle, cursor: "pointer" }}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ---- LABEL ----
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
      {children}
      {hint && <div style={styles.hint}>{hint}</div>}
    </div>
  );
}

// ---- SKELETON ----
export function Skeleton({ width, height, radius = theme.radius.sm }: { width?: number | string; height?: number; radius?: number }) {
  return (
    <div
      style={{
        width: width ?? "100%", height: height ?? 16,
        borderRadius: radius,
        background: `linear-gradient(90deg, ${theme.color.bgTertiary} 0%, ${theme.color.borderLight} 50%, ${theme.color.bgTertiary} 100%)`,
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s infinite linear",
      }}
    />
  );
}

// ---- EMPTY STATE ----
export function EmptyState({ icon, title, body, action }: { icon: string; title: string; body: string; action?: ReactNode }) {
  return (
    <div style={styles.empty}>
      <div style={{ fontSize: 56, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 14, color: theme.color.textMuted, maxWidth: 280, lineHeight: 1.5 }}>{body}</div>
      {action && <div style={{ marginTop: 20 }}>{action}</div>}
    </div>
  );
}

// ---- CARD ----
export function Card({ children, style: extraStyle, onClick }: { children: ReactNode; style?: CSSProperties; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: theme.color.bg,
        borderRadius: theme.radius.lg,
        padding: theme.space.lg,
        boxShadow: theme.shadow.sm,
        border: `1px solid ${theme.color.borderLight}`,
        cursor: onClick ? "pointer" : undefined,
        transition: `all ${theme.duration.fast}`,
        ...extraStyle,
      }}
    >
      {children}
    </div>
  );
}

// ---- INJECT GLOBAL CSS (animations) ----
if (typeof document !== "undefined" && !document.getElementById("duitku-css")) {
  const s = document.createElement("style");
  s.id = "duitku-css";
  s.textContent = `
    @keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
    @keyframes slideUp { from { transform: translateY(20px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
    @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
    @keyframes pulseRing { 0% { transform: scale(0.9); opacity: 1 } 100% { transform: scale(1.4); opacity: 0 } }
    * { box-sizing: border-box }
    button:active { transform: translateY(1px) }
    input:focus, select:focus { outline: none; border-color: ${theme.color.primary} !important; box-shadow: 0 0 0 3px ${theme.color.primary}22 }
    a { color: ${theme.color.primary}; text-decoration: none }
    a:hover { text-decoration: underline }
  `;
  document.head.appendChild(s);
}

const styles: Record<string, CSSProperties> = {
  toastHost: {
    position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
    zIndex: 9999, display: "flex", flexDirection: "column", gap: 8,
    pointerEvents: "none",
  },
  toast: {
    color: "#fff", padding: "12px 18px", borderRadius: theme.radius.md,
    fontSize: 14, fontWeight: 500, boxShadow: theme.shadow.lg,
    animation: `slideUp ${theme.duration.normal} ease`, pointerEvents: "auto",
    minWidth: 240, maxWidth: 380,
  },
  modalBackdrop: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
    display: "flex", alignItems: "flex-end", justifyContent: "center",
    zIndex: 1000, padding: 16, animation: `fadeIn ${theme.duration.fast}`,
  },
  modal: {
    background: theme.color.bg, borderRadius: `${theme.radius.xl}px ${theme.radius.xl}px 0 0`,
    width: "100%", maxHeight: "90vh", overflow: "hidden",
    display: "flex", flexDirection: "column",
    animation: `slideUp ${theme.duration.normal} ease`,
    boxShadow: theme.shadow.xl,
  },
  modalHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "16px 20px", borderBottom: `1px solid ${theme.color.borderLight}`,
  },
  modalTitle: { margin: 0, fontSize: 17, fontWeight: 700 },
  modalClose: {
    background: theme.color.bgTertiary, border: "none", width: 32, height: 32,
    borderRadius: "50%", fontSize: 20, cursor: "pointer", color: theme.color.textMuted,
    display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
  },
  modalBody: { padding: 20, overflow: "auto", flex: 1 },
  modalActions: {
    display: "flex", gap: 8, padding: 16, borderTop: `1px solid ${theme.color.borderLight}`,
    justifyContent: "flex-end",
  },
  input: {
    width: "100%", padding: "11px 14px", fontSize: 15,
    border: `1px solid ${theme.color.border}`, borderRadius: theme.radius.md,
    background: theme.color.bg, color: theme.color.text,
    fontFamily: "inherit", transition: `all ${theme.duration.fast}`,
  },
  field: { marginBottom: 16 },
  label: {
    display: "block", fontSize: 13, fontWeight: 600,
    color: theme.color.textMuted, marginBottom: 6,
  },
  hint: { fontSize: 12, color: theme.color.textSubtle, marginTop: 4 },
  empty: {
    textAlign: "center", padding: "60px 20px",
    color: theme.color.text, display: "flex", flexDirection: "column", alignItems: "center",
  },
};

// Bottom sheet variant: full screen modal on mobile (used by mobile-first design)
// Already implemented as Modal with bottom-anchored sliding panel above.

// Tap targets minimum 44px (HCI best practice: Fitts's law)
