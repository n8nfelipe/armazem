"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgentChat } from "@/app/agent-chat";
import {
  getCategories,
  getCurrentUser,
  logout,
  removeCategory,
  saveCategory,
} from "@/lib/products";
import type { Category, CategoryInput } from "@/lib/products";

const emptyForm: CategoryInput = { name: "", description: "" };

function CategoryMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none">
      <path d="M5 8.5h9l2.5 3H27v12H5v-15Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 16h14M9 20h9" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export default function CategoriesPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<CategoryInput>(emptyForm);
  const [editing, setEditing] = useState<Category | null>(null);
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
      .catch(() => {
        if (active) router.replace("/login");
      });
    return () => { active = false; };
  }, [router]);

  const refresh = useCallback(async (term: string) => {
    setLoading(true);
    try {
      setCategories(await getCategories(term));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar as categorias.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authorized) void refresh("");
  }, [authorized, refresh]);

  useEffect(() => {
    if (!authorized) return;
    if (!searchReady.current) {
      searchReady.current = true;
      return;
    }
    const timer = window.setTimeout(() => void refresh(search), 240);
    return () => window.clearTimeout(timer);
  }, [authorized, search, refresh]);

  function change<K extends keyof CategoryInput>(field: K, value: CategoryInput[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function startEdit(category: Category) {
    setEditing(category);
    setForm({ name: category.name, description: category.description ?? "" });
    setError("");
    setNotice("");
    document.getElementById("category-name")?.focus();
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
      await saveCategory(form, editing?.id);
      setNotice(editing ? "Categoria atualizada e produtos sincronizados." : "Categoria adicionada.");
      resetForm();
      await refresh(search);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar a categoria.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(category: Category) {
    if (!window.confirm(`Remover a categoria “${category.name}”?`)) return;
    setError("");
    setNotice("");
    try {
      await removeCategory(category.id);
      if (editing?.id === category.id) resetForm();
      setNotice("Categoria removida.");
      await refresh(search);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível remover a categoria.");
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

  const linkedProducts = categories.reduce((total, category) => total + category.product_count, 0);

  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Armazém, catálogo de produtos">
          <span className="brand-mark"><CategoryMark /></span>
          <span className="brand-name">armazém<span>.</span></span>
        </Link>

        <div className="side-section-label">GESTÃO</div>
        <Link className="nav-item" href="/dashboard">Dashboard</Link>
        <Link className="nav-item" href="/">
          <svg className="nav-glyph" aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M4 5h12M4 9h12M4 13h8M4 16h12" stroke="currentColor" strokeWidth="1.4" /></svg> Produtos
        </Link>
        <Link className="nav-item active" href="/categories" aria-current="page">
          <svg className="nav-glyph" aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M3.5 5.5h5l1.5 2h6.5v7h-13v-9Z" stroke="currentColor" strokeWidth="1.4" /></svg> Categorias
          <span className="nav-count">{categories.length}</span>
        </Link>
        <Link className="nav-item" href="/suppliers">
          <svg className="nav-glyph" aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M3 17V5h9v12M12 9h5v8M6 8h3M6 11h3M2 17h16" stroke="currentColor" strokeWidth="1.3" /></svg> Fornecedores
        </Link>
        <Link className="nav-item" href="/sales">
          <svg className="nav-glyph" aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M5 3h10v14l-2-1.5-2 1.5-2-1.5L7 17l-2-1.5V3ZM8 7h4M8 10h4" stroke="currentColor" strokeWidth="1.3" /></svg> Vendas
        </Link>
        <Link className="nav-item" href="/purchase-orders">Pedidos</Link>
        <Link className="nav-item" href="/inventory">Estoque</Link>
        <Link className="nav-item" href="/replenishment">Agente</Link>
        <div className="side-section-label">CONTA</div>
        <Link className="nav-item" href="/account">Conta</Link>
        <div className="side-note"><span className="status-dot" /><span>Catálogo conectado</span></div>

        <div className="sidebar-bottom">
          <span className="sidebar-rule" />
          <span className="sidebar-caption">CADASTRO DE CATEGORIAS</span>
          <span className="sidebar-edition">PAINEL DE OPERAÇÕES&nbsp; / &nbsp;02</span>
        </div>
      </aside>

      <main className="main-content" id="categories">
        <header className="topbar">
          <div className="breadcrumb"><span>ESTOQUE</span><span className="crumb-slash">/</span><strong>Categorias</strong></div>
          <div className="topbar-right"><AgentChat /><span className="topbar-date">CATÁLOGO&nbsp; · &nbsp;BR</span><Link className="user-name" href="/account">{username}</Link><button className="logout-button" onClick={() => void signOut()}>Sair</button></div>
        </header>

        <div className="content-wrap">
          <section className="page-heading">
            <div><h1>Categorias</h1><p className="heading-copy">Organize os produtos em grupos consistentes.</p></div>
            <div className="catalog-total"><span className="total-number">{categories.length.toString().padStart(2, "0")}</span><span>categorias</span></div>
          </section>

          <section className="overview-strip" aria-label="Resumo das categorias">
            <div className="overview-cell"><span className="overview-label">CATEGORIAS</span><strong>{categories.length.toString().padStart(2, "0")}</strong></div>
            <div className="overview-cell"><span className="overview-label">PRODUTOS VINCULADOS</span><strong>{linkedProducts.toString().padStart(2, "0")}</strong></div>
            <div className="overview-cell overview-context"><span className="overview-label">ORGANIZAÇÃO</span><span>Renomear uma categoria atualiza seus produtos</span></div>
            <div className="overview-stamp"><span>AR</span><span>GRUPOS<br />DE ITENS</span></div>
          </section>

          <div className="section-title-row">
            <div><span className="section-index">01</span><h2>Registro de categoria</h2></div>
            {editing && <span className="editing-label">EDITANDO CATEGORIA&nbsp; #{editing.id.toString().padStart(4, "0")}</span>}
          </div>

          <section className="form-sheet" aria-label={editing ? "Editar categoria" : "Cadastrar categoria"}>
            <div className="form-intro">
              <span className="form-mark"><CategoryMark /></span>
              <span>{editing ? "ATUALIZAÇÃO DE CATEGORIA" : "NOVA CATEGORIA"}</span>
              <span className="form-ref">CAT&nbsp; / &nbsp;{editing ? editing.id.toString().padStart(4, "0") : "____"}</span>
            </div>
            <form onSubmit={submit}>
              <div className="category-form-grid">
                <label className="field" htmlFor="category-name">
                  <span>Nome da categoria <b>*</b></span>
                  <input id="category-name" value={form.name} onChange={(event) => change("name", event.target.value)} placeholder="Ex.: Mercearia" minLength={2} maxLength={80} required />
                </label>
                <label className="field" htmlFor="category-description">
                  <span>Descrição <small>OPCIONAL</small></span>
                  <input id="category-description" value={form.description ?? ""} onChange={(event) => change("description", event.target.value)} placeholder="Ex.: Alimentos secos e itens de despensa" maxLength={500} />
                </label>
              </div>
              {error && <p className="feedback error" role="alert">{error}</p>}
              {notice && <p className="feedback success" role="status">{notice}</p>}
              <div className="form-actions">
                {editing && <button className="button button-quiet" type="button" onClick={resetForm}>Cancelar edição</button>}
                <span className="required-note"><b>*</b> Campo obrigatório</span>
                <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Salvando…" : editing ? "Salvar alterações" : "Adicionar categoria"}<span aria-hidden="true">↗</span></button>
              </div>
            </form>
          </section>

          <section className="catalog-section" aria-labelledby="category-list-title">
            <div className="section-title-row catalog-title-row">
              <div><span className="section-index">02</span><h2 id="category-list-title">Categorias cadastradas</h2></div>
              <label className="search-box" htmlFor="category-search"><svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><circle cx="8.8" cy="8.8" r="5.8" stroke="currentColor" strokeWidth="1.5" /><path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.5" /></svg><input id="category-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar categoria" /></label>
            </div>

            <div className="table-frame category-table">
              <div className="category-table-head"><span>CATEGORIA</span><span>DESCRIÇÃO</span><span>PRODUTOS</span><span className="sr-only">Ações</span></div>
              {loading ? (
                <div className="table-state"><span className="loader" />Carregando categorias…</div>
              ) : error && categories.length === 0 ? (
                <div className="table-state state-error"><strong>Não foi possível abrir as categorias.</strong><span>{error}</span><button className="text-button" onClick={() => void refresh(search)}>Tentar novamente ↗</button></div>
              ) : categories.length === 0 ? (
                <div className="table-state empty-state"><span className="empty-symbol"><CategoryMark /></span><strong>{search ? "Nenhuma categoria encontrada." : "Ainda não há categorias."}</strong><span>{search ? "Experimente outro nome." : "Cadastre o primeiro grupo usando o formulário acima."}</span></div>
              ) : (
                <div className="table-body">
                  {categories.map((category, index) => (
                    <article className="category-row" key={category.id}>
                      <span className="row-number">{(index + 1).toString().padStart(2, "0")}</span>
                      <strong className="category-name">{category.name}</strong>
                      <span className="category-description">{category.description || "Sem descrição"}</span>
                      <span className="category-product-count">{category.product_count.toString().padStart(2, "0")}</span>
                      <div className="row-actions"><button onClick={() => startEdit(category)} aria-label={`Editar ${category.name}`}>Editar</button><button onClick={() => void deleteCategory(category)} aria-label={`Remover ${category.name}`}>Remover</button></div>
                    </article>
                  ))}
                </div>
              )}
              <div className="table-foot"><span>FIM DAS CATEGORIAS</span><span>{categories.length.toString().padStart(2, "0")} REGISTROS</span></div>
            </div>
          </section>
          <footer className="page-footer"><span>ARMAZÉM&nbsp; / &nbsp;GESTÃO DE CATEGORIAS</span><span>CADASTRO E CONSULTA</span></footer>
        </div>
      </main>
    </div>
  );
}
