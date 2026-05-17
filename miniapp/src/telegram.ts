declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: { user?: { id: number; first_name?: string; username?: string } };
        ready: () => void;
        expand: () => void;
        themeParams: Record<string, string>;
        colorScheme: "light" | "dark";
        HapticFeedback?: {
          impactOccurred: (style: "light" | "medium" | "heavy") => void;
          notificationOccurred: (type: "error" | "success" | "warning") => void;
        };
        showAlert: (msg: string) => void;
        showConfirm: (msg: string, cb: (ok: boolean) => void) => void;
      };
    };
  }
}

export const tg = () => window.Telegram?.WebApp;

export const initTelegram = () => {
  const w = tg();
  if (!w) return;
  w.ready();
  w.expand();
};

export const getInitData = (): string => {
  return tg()?.initData ?? "";
};

// Untuk dev di browser biasa (tanpa Telegram)
export const isDev = () => !tg() || !tg()!.initData;

export {};
