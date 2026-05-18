import { useEffect, useState } from "react";
import { initTelegram, isDev } from "./telegram";
import { auth } from "./api";
import { Login } from "./Login";
import { Dashboard } from "./Dashboard";
import { ToastHost } from "./ui";

type AuthState = "checking" | "loggedIn" | "loggedOut";

export function App() {
  const [authState, setAuthState] = useState<AuthState>("checking");

  useEffect(() => {
    initTelegram();
    if (!isDev() || auth.getToken()) {
      setAuthState("loggedIn");
    } else {
      setAuthState("loggedOut");
    }
  }, []);

  return (
    <>
      <ToastHost />
      {authState === "checking" && <div style={{ padding: 40, textAlign: "center" }}>Loading…</div>}
      {authState === "loggedOut" && <Login onLogin={() => setAuthState("loggedIn")} />}
      {authState === "loggedIn" && <Dashboard onLogout={() => { auth.clear(); setAuthState("loggedOut"); }} />}
    </>
  );
}
