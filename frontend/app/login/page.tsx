"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, login } from "@/lib/products";

function ProductMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none">
      <path d="M5 9.5 16 4l11 5.5v13L16 28 5 22.5v-13Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="m5.5 9.5 10.5 5.2 10.5-5.2M16 15v12M10 7l11 5.7" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then(() => { if (active) router.replace("/"); })
      .catch(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await login(username, password);
      router.replace("/");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Não foi possível entrar.";
      setError(message === "Failed to fetch" ? "Não foi possível conectar ao servidor. Tente novamente." : message);
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) return <main className="auth-loading" aria-live="polite">Verificando acesso…</main>;

  return (
    <main className="login-page">
      <section className="login-visual" aria-label="Armazém, gestão de produtos">
        <a className="brand login-brand" href="/" aria-label="Armazém">
          <span className="brand-mark"><ProductMark /></span>
          <span className="brand-name">armazém<span>.</span></span>
        </a>
        <div className="login-visual-copy">
          <span className="login-rule" />
          <h1>Seu catálogo,<br />em boas mãos.</h1>
          <p>Acesse o espaço de gestão de produtos.</p>
        </div>
        <div className="login-visual-footer"><span>PAINEL DE OPERAÇÕES</span><span>ACESSO RESTRITO&nbsp; / &nbsp;01</span></div>
      </section>

      <section className="login-panel">
        <div className="login-form-wrap">
          <span className="login-overline">ÁREA DE ACESSO</span>
          <h2>Entrar</h2>
          <p className="login-description">Informe seu usuário e senha para continuar.</p>

          <form className="login-form" onSubmit={submit}>
            <label className="field" htmlFor="login-username">
              <span>Usuário</span>
              <input id="login-username" name="username" type="text" autoComplete="username" autoCapitalize="none" value={username} onChange={(event) => setUsername(event.target.value)} required autoFocus />
            </label>
            <label className="field" htmlFor="login-password">
              <span>Senha</span>
              <input id="login-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
            {error && <p className="feedback error" role="alert">{error}</p>}
            <button className="button button-primary login-submit" type="submit" disabled={submitting}>
              {submitting ? "Verificando…" : "Acessar catálogo"}<span aria-hidden="true">↗</span>
            </button>
          </form>

          <div className="login-notice"><span className="lock-icon" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none"><rect x="4" y="8" width="12" height="9" rx="1" stroke="currentColor" strokeWidth="1.4"/><path d="M6.5 8V6a3.5 3.5 0 0 1 7 0v2" stroke="currentColor" strokeWidth="1.4"/></svg></span><span>Sessão protegida e acesso pessoal.</span></div>
        </div>
        <footer className="login-footer"><span>ARMAZÉM&nbsp; / &nbsp;GESTÃO DE PRODUTOS</span><span>ACESSO SEGURO</span></footer>
      </section>
    </main>
  );
}
