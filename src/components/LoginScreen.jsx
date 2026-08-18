import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";

export default function LoginScreen({ message = "" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [language, setLanguage] = useState("ja");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const translations = {
    ja: {
      subtitle: "設備保全システムへログイン",
      email: "メールアドレス",
      password: "パスワード",
      login: "ログイン",
      loading: "ログイン中...",
      help: "アカウントがない場合は管理者へ連絡してください。",
      invalid: "メールアドレスまたはパスワードを確認してください。",
    },
    en: {
      subtitle: "Sign in to the maintenance system",
      email: "Email",
      password: "Password",
      login: "Sign In",
      loading: "Signing in...",
      help: "Contact an administrator if you do not have an account.",
      invalid: "Check your email address and password.",
    },
    es: {
      subtitle: "Iniciar sesión en el sistema de mantenimiento",
      email: "Correo electrónico",
      password: "Contraseña",
      login: "Iniciar sesión",
      loading: "Ingresando...",
      help: "Contacte a un administrador si no tiene una cuenta.",
      invalid: "Verifique el correo electrónico y la contraseña.",
    },
    th: {
      subtitle: "เข้าสู่ระบบบำรุงรักษาเครื่องจักร",
      email: "อีเมล",
      password: "รหัสผ่าน",
      login: "เข้าสู่ระบบ",
      loading: "กำลังเข้าสู่ระบบ...",
      help: "หากไม่มีบัญชี กรุณาติดต่อผู้ดูแลระบบ",
      invalid: "กรุณาตรวจสอบอีเมลและรหัสผ่าน",
    },
  };

  const ui = translations[language] || translations.ja;

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      console.error("Login error:", err);
      setError(ui.invalid);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      padding: "20px",
      background:
        "radial-gradient(circle at top left,rgba(59,130,246,.24),transparent 35%),linear-gradient(135deg,#eff6ff,#f8fafc 52%,#eef2ff)",
      fontFamily: "Arial,'Noto Sans Thai','Yu Gothic',sans-serif",
    }}>
      <form
        onSubmit={submit}
        style={{
          width: "min(440px,100%)",
          padding: "30px",
          borderRadius: "28px",
          background: "rgba(255,255,255,.96)",
          border: "1px solid #dbeafe",
          boxShadow: "0 30px 80px rgba(15,23,42,.16)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "22px" }}>
          <div style={{
            width: "70px",
            height: "70px",
            margin: "0 auto 14px",
            borderRadius: "22px",
            display: "grid",
            placeItems: "center",
            color: "#fff",
            background: "linear-gradient(135deg,#1d4ed8,#2563eb)",
            fontSize: "34px",
            boxShadow: "0 14px 35px rgba(37,99,235,.3)",
          }}>
            🛠️
          </div>
          <h1 style={{ margin: 0, fontSize: "28px", color: "#0f172a" }}>
            MIYAMA Maintenance
          </h1>
          <p style={{ color: "#64748b", marginTop: "8px" }}>{ui.subtitle}</p>
        </div>

        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          aria-label="Language"
          style={{
            width: "100%",
            minHeight: "44px",
            marginBottom: "14px",
            borderRadius: "12px",
            border: "1px solid #cbd5e1",
            padding: "0 12px",
            background: "#fff",
          }}
        >
          <option value="ja">🇯🇵 日本語</option>
          <option value="en">🇺🇸 English</option>
          <option value="es">🇪🇸 Español</option>
          <option value="th">🇹🇭 ภาษาไทย</option>
        </select>

        <label style={{ display: "grid", gap: "6px", marginBottom: "14px", fontWeight: 800 }}>
          {ui.email}
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: "100%",
              boxSizing: "border-box",
              minHeight: "48px",
              borderRadius: "13px",
              border: "1px solid #cbd5e1",
              padding: "0 14px",
              fontSize: "16px",
            }}
          />
        </label>

        <label style={{ display: "grid", gap: "6px", marginBottom: "18px", fontWeight: 800 }}>
          {ui.password}
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              width: "100%",
              boxSizing: "border-box",
              minHeight: "48px",
              borderRadius: "13px",
              border: "1px solid #cbd5e1",
              padding: "0 14px",
              fontSize: "16px",
            }}
          />
        </label>

        {(message || error) && (
          <div style={{
            marginBottom: "14px",
            padding: "11px 13px",
            borderRadius: "12px",
            background: "#fee2e2",
            color: "#991b1b",
            fontWeight: 800,
          }}>
            {error || message}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            minHeight: "50px",
            border: 0,
            borderRadius: "14px",
            color: "#fff",
            background: "linear-gradient(135deg,#2563eb,#1d4ed8)",
            fontWeight: 900,
            fontSize: "16px",
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? .65 : 1,
          }}
        >
          🔐 {loading ? ui.loading : ui.login}
        </button>

        <p style={{
          textAlign: "center",
          color: "#64748b",
          fontSize: "13px",
          lineHeight: 1.6,
          margin: "16px 0 0",
        }}>
          {ui.help}
        </p>
      </form>
    </div>
  );
}
