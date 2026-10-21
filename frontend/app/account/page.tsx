"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgentChat } from "@/app/agent-chat";
import { getCurrentUser, logout, updateAccount } from "@/lib/products";

function AccountMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="12" r="5.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6.5 27c0-5.2 4.3-9 9.5-9s9.5 3.8 9.5 9" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [username, setUsername] = useState("");
  const [form, setForm] = useState({ username: "", currentPassword: "", newPassword: "", confirmPassword: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((user) => {
        if (!active) return;
        setUsername(user.username);
        setForm((current) => ({ ...current, username: user.username }));
        setAuthorized(true);
      })
      .catch(() => {
        if (active) router.replace("/login");
      });
    return () => { active = false; };
  }, [router]);

  function change(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
    setNotice("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    const nextUsername = form.username.trim();
    const nextPassword = form.newPassword;

    if (nextUsername.length < 2) {
      setError("Informe um usuário com pelo menos 2 caracteres.");
      return;
    }
    if (nextPassword && nextPassword.length < 8) {
      setError("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (nextPassword !== form.confirmPassword) {
      setError("A confirmação não confere com a nova senha.");
      return;
    }
    if (!nextPassword && nextUsername === username) {
      setError("Informe um novo usuário ou uma nova senha.");
      return;
    }

    setSaving(true);
    try {
      const user = await updateAccount({
        current_password: form.currentPassword,
        username: nextUsername,
        ...(nextPassword ? { new_password: nextPassword } : {}),
      });
      setUsername(user.username);
      setForm({ username: user.username, currentPassword: "", newPassword: "", confirmPassword: "" });
      setNotice("Dados de acesso atualizados.");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Não foi possível salvar os dados.";
      setError(message === "Failed to fetch" ? "Não foi possível conectar ao servidor. Tente novamente." : message);
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    try {
      await logout();
    } finally {
      router.replace("/login");
    }
  }

  if (!authorized) {
    return <main className="auth-loading" aria-live="polite">Validando sessão…</main>;
  }

  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Armazém, catálogo de produtos">
          <span className="brand-mark"><AccountMark /></span>
          <span className="brand-name">armazém<span>.</span></span>
        </Link>

        <div className="side-section-label">GESTÃO</div>
        <Link className="nav-item" href="/dashboard">Dashboard</Link>
        <Link className="nav-item" href="/">Produtos</Link>
        <Link className="nav-item" href="/categories">Categorias</Link>
        <Link className="nav-item" href="/suppliers">Fornecedores</Link>
        <Link className="nav-item" href="/sales">Vendas</Link>
        <Link className="nav-item" href="/purchase-orders">Pedidos</Link>
        <Link className="nav-item" href="/inventory">Estoque</Link>
        <Link className="nav-item" href="/replenishment">Agente</Link>
        <div className="side-section-label">CONTA</div>
        <Link className="nav-item active" href="/account" aria-current="page">
          <svg className="nav-glyph" aria-hidden="true" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7.2" r="3" stroke="currentColor" strokeWidth="1.4" /><path d="M4.2 16.5c0-2.9 2.6-4.8 5.8-4.8s5.8 1.9 5.8 4.8" stroke="currentColor" strokeWidth="1.4" /></svg> Conta
        </Link>
        <div className="side-note"><span className="status-dot" /><span>Acesso pessoal</span></div>

        <div className="sidebar-bottom">
          <span className="sidebar-rule" />
          <span className="sidebar-caption">DADOS DE ACESSO</span>
          <span className="sidebar-edition">PAINEL DE OPERAÇÕES&nbsp; / &nbsp;09</span>
        </div>
      </aside>

      <main className="main-content" id="account">
        <header className="topbar">
          <div className="breadcrumb"><span>ESTOQUE</span><span className="crumb-slash">/</span><strong>Minha conta</strong></div>
          <div className="topbar-right"><AgentChat /><span className="topbar-date">CONTA&nbsp; · &nbsp;BR</span><Link className="user-name" href="/account">{username}</Link><button className="logout-button" onClick={() => void signOut()}>Sair</button></div>
        </header>

        <div className="content-wrap">
          <section className="page-heading">
            <div>
              <h1>Minha conta</h1>
              <p className="heading-copy">Atualize seu usuário e a senha da sua sessão.</p>
            </div>
            <div className="catalog-total"><span className="total-number">01</span><span>usuário conectado</span></div>
          </section>

          <section className="overview-strip" aria-label="Resumo da conta">
            <div className="overview-cell"><span className="overview-label">USUÁRIO ATUAL</span><strong>{username}</strong></div>
            <div className="overview-cell"><span className="overview-label">SESSÃO</span><strong>Protegida</strong></div>
            <div className="overview-cell overview-context"><span className="overview-label">CONFIRMAÇÃO</span><span>Alterações validadas com a senha atual</span></div>
          </section>

          <div className="section-title-row">
            <div><span className="section-index">01</span><h2>Alteração de dados</h2></div>
            <span className="editing-label">ACESSO&nbsp; / &nbsp;{username.toUpperCase()}</span>
          </div>

          <section className="form-sheet" aria-label="Alterar dados da conta">
            <div className="form-intro">
              <span className="form-mark"><AccountMark /></span>
              <span>FICHA DE ACESSO</span>
              <span className="form-ref">REG&nbsp; / &nbsp;____</span>
            </div>
            <form onSubmit={submit}>
              <div className="form-grid">
                <label className="field field-wide" htmlFor="account-username">
                  <span>Usuário <b>*</b></span>
                  <input id="account-username" value={form.username} onChange={(event) => change("username", event.target.value)} autoComplete="username" autoCapitalize="none" minLength={2} maxLength={80} required />
                </label>
                <label className="field" htmlFor="account-current-password">
                  <span>Senha atual <b>*</b></span>
                  <input id="account-current-password" type="password" value={form.currentPassword} onChange={(event) => change("currentPassword", event.target.value)} autoComplete="current-password" required />
                </label>
                <label className="field" htmlFor="account-new-password">
                  <span>Nova senha <small>OPCIONAL</small></span>
                  <input id="account-new-password" type="password" value={form.newPassword} onChange={(event) => change("newPassword", event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} />
                </label>
                <label className="field" htmlFor="account-confirm-password">
                  <span>Confirmar nova senha <small>OPCIONAL</small></span>
                  <input id="account-confirm-password" type="password" value={form.confirmPassword} onChange={(event) => change("confirmPassword", event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} />
                </label>
                <div className="field">
                  <span>Requisitos <small>NOVA SENHA</small></span>
                  <small className="field-help">Mínimo de 8 caracteres. Deixe em branco para manter a senha atual.</small>
                </div>
              </div>
              {error && <p className="feedback error" role="alert">{error}</p>}
              {notice && <p className="feedback success" role="status">{notice}</p>}
              <div className="form-actions">
                <span className="required-note"><b>*</b> Campos obrigatórios</span>
                <button className="button button-primary" type="submit" disabled={saving}>
                  {saving ? "Salvando…" : "Salvar alterações"}<span aria-hidden="true">↗</span>
                </button>
              </div>
            </form>
          </section>

          <footer className="page-footer"><span>ARMAZÉM&nbsp; / &nbsp;DADOS DE ACESSO</span><span>USUÁRIO E SENHA</span></footer>
        </div>
      </main>
    </div>
  );
}
