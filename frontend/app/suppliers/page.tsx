"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgentChat } from "@/app/agent-chat";
import { getCurrentUser, getSuppliers, logout, removeSupplier, saveSupplier } from "@/lib/products";
import type { Supplier, SupplierInput } from "@/lib/products";

const emptyForm: SupplierInput = {
  name: "",
  document: "",
  contact_name: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
};

function SupplierMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none">
      <path d="M5 26V9h14v17M19 14h8v12M9 13h6M9 17h6M9 21h6M23 18h1M23 22h1M3 26h26" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export default function SuppliersPage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState<SupplierInput>(emptyForm);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [username, setUsername] = useState("");
  const searchReady = useRef(false);

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((user) => {
        if (!active) return;
        setUsername(user.username);
        setAuthorized(true);
      })
      .catch(() => { if (active) router.replace("/login"); });
    return () => { active = false; };
  }, [router]);

  const refresh = useCallback(async (term: string) => {
    setLoading(true);
    try {
      setSuppliers(await getSuppliers(term));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar os fornecedores.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (authorized) void refresh(""); }, [authorized, refresh]);

  useEffect(() => {
    if (!authorized) return;
    if (!searchReady.current) {
      searchReady.current = true;
      return;
    }
    const timer = window.setTimeout(() => void refresh(search), 240);
    return () => window.clearTimeout(timer);
  }, [authorized, search, refresh]);

  function change<K extends keyof SupplierInput>(field: K, value: SupplierInput[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function startEdit(supplier: Supplier) {
    setEditing(supplier);
    setForm({
      name: supplier.name,
      document: supplier.document,
      contact_name: supplier.contact_name ?? "",
      email: supplier.email ?? "",
      phone: supplier.phone ?? "",
      address: supplier.address ?? "",
      notes: supplier.notes ?? "",
    });
    setError("");
    setNotice("");
    document.getElementById("supplier-name")?.focus();
  }

  function resetForm() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await saveSupplier(form, editing?.id);
      setNotice(editing ? "Fornecedor atualizado." : "Fornecedor adicionado.");
      resetForm();
      await refresh(search);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar o fornecedor.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSupplier(supplier: Supplier) {
    if (!window.confirm(`Remover o fornecedor “${supplier.name}”?`)) return;
    setError("");
    setNotice("");
    try {
      await removeSupplier(supplier.id);
      if (editing?.id === supplier.id) resetForm();
      setNotice("Fornecedor removido.");
      await refresh(search);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível remover o fornecedor.");
    }
  }

  async function signOut() {
    try { await logout(); } finally { router.replace("/login"); }
  }

  if (!authorized) return <main className="auth-loading" aria-live="polite">Validando sessão…</main>;

  const withContact = suppliers.filter((supplier) => supplier.email || supplier.phone).length;

  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Armazém, catálogo de produtos"><span className="brand-mark"><SupplierMark /></span><span className="brand-name">armazém<span>.</span></span></Link>
        <div className="side-section-label">GESTÃO</div>
        <Link className="nav-item" href="/dashboard">Dashboard</Link>
        <Link className="nav-item" href="/"><svg className="nav-glyph" aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M4 5h12M4 9h12M4 13h8M4 16h12" stroke="currentColor" strokeWidth="1.4" /></svg> Produtos</Link>
        <Link className="nav-item" href="/categories"><svg className="nav-glyph" aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M3.5 5.5h5l1.5 2h6.5v7h-13v-9Z" stroke="currentColor" strokeWidth="1.4" /></svg> Categorias</Link>
        <Link className="nav-item active" href="/suppliers" aria-current="page"><svg className="nav-glyph" aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M3 17V5h9v12M12 9h5v8M6 8h3M6 11h3M2 17h16" stroke="currentColor" strokeWidth="1.3" /></svg> Fornecedores<span className="nav-count">{suppliers.length}</span></Link>
        <Link className="nav-item" href="/sales"><svg className="nav-glyph" aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M5 3h10v14l-2-1.5-2 1.5-2-1.5L7 17l-2-1.5V3ZM8 7h4M8 10h4" stroke="currentColor" strokeWidth="1.3" /></svg> Vendas</Link>
        <Link className="nav-item" href="/purchase-orders">Pedidos</Link>
        <Link className="nav-item" href="/inventory">Estoque</Link>
        <Link className="nav-item" href="/replenishment">Agente</Link>
        <div className="side-section-label">CONTA</div>
        <Link className="nav-item" href="/account">Conta</Link>
        <div className="side-note"><span className="status-dot" /><span>Catálogo conectado</span></div>
        <div className="sidebar-bottom"><span className="sidebar-rule" /><span className="sidebar-caption">CADASTRO DE FORNECEDORES</span><span className="sidebar-edition">PAINEL DE OPERAÇÕES&nbsp; / &nbsp;03</span></div>
      </aside>

      <main className="main-content" id="suppliers">
        <header className="topbar"><div className="breadcrumb"><span>ESTOQUE</span><span className="crumb-slash">/</span><strong>Fornecedores</strong></div><div className="topbar-right"><AgentChat /><span className="topbar-date">CATÁLOGO&nbsp; · &nbsp;BR</span><Link className="user-name" href="/account">{username}</Link><button className="logout-button" onClick={() => void signOut()}>Sair</button></div></header>

        <div className="content-wrap">
          <section className="page-heading"><div><h1>Fornecedores</h1><p className="heading-copy">Mantenha parceiros e contatos de compra organizados.</p></div><div className="catalog-total"><span className="total-number">{suppliers.length.toString().padStart(2, "0")}</span><span>fornecedores</span></div></section>
          <section className="overview-strip" aria-label="Resumo dos fornecedores"><div className="overview-cell"><span className="overview-label">FORNECEDORES</span><strong>{suppliers.length.toString().padStart(2, "0")}</strong></div><div className="overview-cell"><span className="overview-label">COM CONTATO</span><strong>{withContact.toString().padStart(2, "0")}</strong></div><div className="overview-cell overview-context"><span className="overview-label">BASE COMERCIAL</span><span>Dados para compras e relacionamento</span></div><div className="overview-stamp"><span>AR</span><span>REDE DE<br />PARCEIROS</span></div></section>

          <div className="section-title-row"><div><span className="section-index">01</span><h2>Registro de fornecedor</h2></div>{editing && <span className="editing-label">EDITANDO FORNECEDOR&nbsp; #{editing.id.toString().padStart(4, "0")}</span>}</div>
          <section className="form-sheet" aria-label={editing ? "Editar fornecedor" : "Cadastrar fornecedor"}>
            <div className="form-intro"><span className="form-mark"><SupplierMark /></span><span>{editing ? "ATUALIZAÇÃO DE FORNECEDOR" : "NOVO FORNECEDOR"}</span><span className="form-ref">FOR&nbsp; / &nbsp;{editing ? editing.id.toString().padStart(4, "0") : "____"}</span></div>
            <form onSubmit={submit}>
              <div className="supplier-form-grid">
                <label className="field supplier-name" htmlFor="supplier-name"><span>Nome / razão social <b>*</b></span><input id="supplier-name" value={form.name} onChange={(event) => change("name", event.target.value)} placeholder="Ex.: Distribuidora Horizonte" minLength={2} maxLength={120} required /></label>
                <label className="field" htmlFor="supplier-document"><span>CPF / CNPJ / documento <b>*</b></span><input id="supplier-document" value={form.document} onChange={(event) => change("document", event.target.value)} placeholder="Ex.: 12.345.678/0001-90" minLength={3} maxLength={30} required /></label>
                <label className="field" htmlFor="supplier-contact"><span>Pessoa de contato <small>OPCIONAL</small></span><input id="supplier-contact" value={form.contact_name ?? ""} onChange={(event) => change("contact_name", event.target.value)} placeholder="Ex.: Marina Costa" maxLength={120} /></label>
                <label className="field" htmlFor="supplier-email"><span>E-mail <small>OPCIONAL</small></span><input id="supplier-email" type="email" value={form.email ?? ""} onChange={(event) => change("email", event.target.value)} placeholder="compras@fornecedor.com.br" maxLength={254} /></label>
                <label className="field" htmlFor="supplier-phone"><span>Telefone <small>OPCIONAL</small></span><input id="supplier-phone" type="tel" value={form.phone ?? ""} onChange={(event) => change("phone", event.target.value)} placeholder="(11) 99999-9999" maxLength={30} /></label>
                <label className="field supplier-address" htmlFor="supplier-address"><span>Endereço <small>OPCIONAL</small></span><input id="supplier-address" value={form.address ?? ""} onChange={(event) => change("address", event.target.value)} placeholder="Rua, número, cidade e estado" maxLength={500} /></label>
                <label className="field supplier-notes" htmlFor="supplier-notes"><span>Observações <small>OPCIONAL</small></span><textarea id="supplier-notes" value={form.notes ?? ""} onChange={(event) => change("notes", event.target.value)} placeholder="Condições comerciais, prazos ou detalhes relevantes" maxLength={2000} rows={2} /></label>
              </div>
              {error && <p className="feedback error" role="alert">{error}</p>}
              {notice && <p className="feedback success" role="status">{notice}</p>}
              <div className="form-actions">{editing && <button className="button button-quiet" type="button" onClick={resetForm}>Cancelar edição</button>}<span className="required-note"><b>*</b> Campos obrigatórios</span><button className="button button-primary" type="submit" disabled={saving}>{saving ? "Salvando…" : editing ? "Salvar alterações" : "Adicionar fornecedor"}<span aria-hidden="true">↗</span></button></div>
            </form>
          </section>

          <section className="catalog-section" aria-labelledby="supplier-list-title">
            <div className="section-title-row catalog-title-row"><div><span className="section-index">02</span><h2 id="supplier-list-title">Fornecedores cadastrados</h2></div><label className="search-box" htmlFor="supplier-search"><svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><circle cx="8.8" cy="8.8" r="5.8" stroke="currentColor" strokeWidth="1.5" /><path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.5" /></svg><input id="supplier-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar fornecedor" /></label></div>
            <div className="table-frame supplier-table">
              <div className="supplier-table-head"><span>FORNECEDOR</span><span>DOCUMENTO</span><span>CONTATO</span><span>TELEFONE</span><span className="sr-only">Ações</span></div>
              {loading ? <div className="table-state"><span className="loader" />Carregando fornecedores…</div> : error && suppliers.length === 0 ? <div className="table-state state-error"><strong>Não foi possível abrir os fornecedores.</strong><span>{error}</span><button className="text-button" onClick={() => void refresh(search)}>Tentar novamente ↗</button></div> : suppliers.length === 0 ? <div className="table-state empty-state"><span className="empty-symbol"><SupplierMark /></span><strong>{search ? "Nenhum fornecedor encontrado." : "Ainda não há fornecedores."}</strong><span>{search ? "Experimente buscar por nome, documento ou contato." : "Cadastre o primeiro parceiro usando o formulário acima."}</span></div> : <div className="table-body">{suppliers.map((supplier, index) => <article className="supplier-row" key={supplier.id}><span className="row-number">{(index + 1).toString().padStart(2, "0")}</span><div className="supplier-list-name"><strong>{supplier.name}</strong><span>{supplier.email || supplier.address || "Sem dados complementares"}</span></div><span className="supplier-document">{supplier.document}</span><span className="supplier-contact">{supplier.contact_name || "—"}</span><span className="supplier-phone">{supplier.phone || "—"}</span><div className="row-actions"><button onClick={() => startEdit(supplier)} aria-label={`Editar ${supplier.name}`}>Editar</button><button onClick={() => void deleteSupplier(supplier)} aria-label={`Remover ${supplier.name}`}>Remover</button></div></article>)}</div>}
              <div className="table-foot"><span>FIM DOS FORNECEDORES</span><span>{suppliers.length.toString().padStart(2, "0")} REGISTROS</span></div>
            </div>
          </section>
          <footer className="page-footer"><span>ARMAZÉM&nbsp; / &nbsp;GESTÃO DE FORNECEDORES</span><span>CADASTRO E CONSULTA</span></footer>
        </div>
      </main>
    </div>
  );
}
