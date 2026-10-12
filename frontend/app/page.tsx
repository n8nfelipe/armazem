"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgentChat } from "@/app/agent-chat";
import { getCategories, getCurrentUser, getProducts, logout, removeProduct, saveProduct } from "@/lib/products";
import type { Category, Product, ProductInput } from "@/lib/products";

const emptyForm: ProductInput = { name: "", sku: "", category: "", price: "", description: "" };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatPrice(value: string) {
  return money.format(Number(value));
}

function ProductMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none">
      <path d="M5 9.5 16 4l11 5.5v13L16 28 5 22.5v-13Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="m5.5 9.5 10.5 5.2 10.5-5.2M16 15v12M10 7l11 5.7" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<Category[]>([]);
  const [form, setForm] = useState<ProductInput>(emptyForm);
  const [editing, setEditing] = useState<Product | null>(null);
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
      setProducts(await getProducts(term));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar o catálogo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authorized) return;
    void refresh("");
    getCategories()
      .then(setCategoryOptions)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível carregar as categorias."));
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

  const categories = useMemo(() => categoryOptions.length, [categoryOptions]);

  function change<K extends keyof ProductInput>(field: K, value: ProductInput[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function startEdit(product: Product) {
    setEditing(product);
    setForm({
      name: product.name,
      sku: product.sku,
      description: product.description ?? "",
      category: product.category,
      price: product.price,
    });
    setError("");
    setNotice("");
    document.getElementById("product-name")?.focus();
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
      await saveProduct({ ...form, price: Number(form.price).toFixed(2) }, editing?.id);
      setNotice(editing ? "Alterações salvas." : "Produto adicionado ao catálogo.");
      resetForm();
      await refresh(search);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar o produto.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`Remover “${product.name}” do catálogo?`)) return;
    setError("");
    setNotice("");
    try {
      await removeProduct(product.id);
      if (editing?.id === product.id) resetForm();
      setNotice("Produto removido do catálogo.");
      await refresh(search);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível remover o produto.");
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
          <span className="brand-mark"><ProductMark /></span>
          <span className="brand-name">armazém<span>.</span></span>
        </Link>

        <div className="side-section-label">GESTÃO</div>
        <Link className="nav-item" href="/dashboard">Dashboard</Link>
        <Link className="nav-item active" href="/" aria-current="page">
          <svg className="nav-glyph" aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M4 5h12M4 9h12M4 13h8M4 16h12" stroke="currentColor" strokeWidth="1.4" /></svg> Produtos
          <span className="nav-count">{products.length}</span>
        </Link>
        <Link className="nav-item" href="/categories">
          <svg className="nav-glyph" aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M3.5 5.5h5l1.5 2h6.5v7h-13v-9Z" stroke="currentColor" strokeWidth="1.4" /></svg> Categorias
          <span className="nav-count">{categoryOptions.length}</span>
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
        <div className="side-note">
          <span className="status-dot" />
          <span>Catálogo conectado</span>
        </div>

        <div className="sidebar-bottom">
          <span className="sidebar-rule" />
          <span className="sidebar-caption">CADASTRO DE PRODUTOS</span>
          <span className="sidebar-edition">PAINEL DE OPERAÇÕES&nbsp; / &nbsp;01</span>
        </div>
      </aside>

      <main className="main-content" id="catalog">
        <header className="topbar">
          <div className="breadcrumb"><span>ESTOQUE</span><span className="crumb-slash">/</span><strong>Produtos</strong></div>
          <div className="topbar-right"><AgentChat /><span className="topbar-date">CATÁLOGO&nbsp; · &nbsp;BR</span><span className="user-name">{username}</span><button className="logout-button" onClick={() => void signOut()}>Sair</button></div>
        </header>

        <div className="content-wrap">
          <section className="page-heading">
            <div>
              <h1>Catálogo</h1>
              <p className="heading-copy">Cadastre e organize os itens do seu estoque.</p>
            </div>
            <div className="catalog-total"><span className="total-number">{products.length.toString().padStart(2, "0")}</span><span>itens no catálogo</span></div>
          </section>

          <section className="overview-strip" aria-label="Resumo do catálogo">
            <div className="overview-cell"><span className="overview-label">PRODUTOS</span><strong>{products.length.toString().padStart(2, "0")}</strong></div>
            <div className="overview-cell"><span className="overview-label">CATEGORIAS</span><strong>{categories.toString().padStart(2, "0")}</strong></div>
            <div className="overview-cell overview-context"><span className="overview-label">BASE ATUAL</span><span>Informações salvas no catálogo</span></div>
            <div className="overview-stamp"><span>AR</span><span>CATÁLOGO<br />DE ITENS</span></div>
          </section>

          <div className="section-title-row">
            <div><span className="section-index">01</span><h2>Registro de produto</h2></div>
            {editing && <span className="editing-label">EDITANDO ITEM&nbsp; #{editing.id.toString().padStart(4, "0")}</span>}
          </div>

          <section className="form-sheet" aria-label={editing ? "Editar produto" : "Cadastrar produto"}>
            <div className="form-intro">
              <span className="form-mark"><ProductMark /></span>
              <span>{editing ? "ATUALIZAÇÃO DE FICHA" : "NOVA FICHA DE PRODUTO"}</span>
              <span className="form-ref">REG&nbsp; / &nbsp;{editing ? editing.id.toString().padStart(4, "0") : "____"}</span>
            </div>
            <form onSubmit={submit}>
              <div className="form-grid">
                <label className="field field-wide" htmlFor="product-name">
                  <span>Nome do produto <b>*</b></span>
                  <input id="product-name" value={form.name} onChange={(event) => change("name", event.target.value)} placeholder="Ex.: Café em grãos" minLength={2} maxLength={120} required />
                </label>
                <label className="field" htmlFor="product-sku">
                  <span>SKU <b>*</b></span>
                  <input id="product-sku" value={form.sku} onChange={(event) => change("sku", event.target.value.toUpperCase())} placeholder="Ex.: CAF-001" minLength={2} maxLength={40} required />
                </label>
                <label className="field" htmlFor="product-category">
                  <span>Categoria <b>*</b></span>
                  <select id="product-category" value={form.category} onChange={(event) => change("category", event.target.value)} required>
                    <option value="">Selecione uma categoria</option>
                    {categoryOptions.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
                  </select>
                  {categoryOptions.length === 0 && <small className="field-help">Cadastre uma categoria antes de adicionar produtos.</small>}
                </label>
                <label className="field" htmlFor="product-price">
                  <span>Preço de venda <b>*</b></span>
                  <span className="price-input"><span>R$</span><input id="product-price" type="number" inputMode="decimal" min="0.01" step="0.01" value={form.price} onChange={(event) => change("price", event.target.value)} placeholder="0,00" required /></span>
                </label>
                <label className="field field-wide" htmlFor="product-description">
                  <span>Descrição <small>OPCIONAL</small></span>
                  <textarea id="product-description" value={form.description ?? ""} onChange={(event) => change("description", event.target.value)} placeholder="Detalhes para identificar este produto" maxLength={2000} rows={2} />
                </label>
              </div>
              {error && <p className="feedback error" role="alert">{error}</p>}
              {notice && <p className="feedback success" role="status">{notice}</p>}
              <div className="form-actions">
                {editing && <button className="button button-quiet" type="button" onClick={resetForm}>Cancelar edição</button>}
                <span className="required-note"><b>*</b> Campos obrigatórios</span>
                <button className="button button-primary" type="submit" disabled={saving}>
                  {saving ? "Salvando…" : editing ? "Salvar alterações" : "Adicionar produto"}<span aria-hidden="true">↗</span>
                </button>
              </div>
            </form>
          </section>

          <section className="catalog-section" aria-labelledby="catalog-title">
            <div className="section-title-row catalog-title-row">
              <div><span className="section-index">02</span><h2 id="catalog-title">Produtos cadastrados</h2></div>
              <label className="search-box" htmlFor="catalog-search"><svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><circle cx="8.8" cy="8.8" r="5.8" stroke="currentColor" strokeWidth="1.5" /><path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.5" /></svg><input id="catalog-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar no catálogo" /><kbd>Enter</kbd></label>
            </div>

            <div className="table-frame">
              <div className="table-head"><span>PRODUTO</span><span>SKU</span><span>CATEGORIA</span><span>PREÇO</span><span className="sr-only">Ações</span></div>
              {loading ? (
                <div className="table-state"><span className="loader" />Carregando catálogo…</div>
              ) : error && products.length === 0 ? (
                <div className="table-state state-error"><strong>Não foi possível abrir o catálogo.</strong><span>{error}</span><button className="text-button" onClick={() => void refresh(search)}>Tentar novamente ↗</button></div>
              ) : products.length === 0 ? (
                <div className="table-state empty-state">
                  <span className="empty-symbol"><ProductMark /></span>
                  <strong>{search ? "Nenhum produto encontrado." : "O catálogo ainda está vazio."}</strong>
                  <span>{search ? "Experimente outro nome, SKU ou categoria." : "Preencha a ficha acima para cadastrar o primeiro item."}</span>
                </div>
              ) : (
                <div className="table-body">
                  {products.map((product, index) => (
                    <article className="product-row" key={product.id}>
                      <span className="row-number">{(index + 1).toString().padStart(2, "0")}</span>
                      <div className="product-name"><strong>{product.name}</strong>{product.description && <span>{product.description}</span>}</div>
                      <span className="sku-value">{product.sku}</span>
                      <span className="category-value"><i />{product.category}</span>
                      <strong className="product-price">{formatPrice(product.price)}</strong>
                      <div className="row-actions"><button onClick={() => startEdit(product)} aria-label={`Editar ${product.name}`}>Editar</button><button onClick={() => void deleteProduct(product)} aria-label={`Remover ${product.name}`}>Remover</button></div>
                    </article>
                  ))}
                </div>
              )}
              <div className="table-foot"><span>FIM DO CATÁLOGO</span><span>{products.length.toString().padStart(2, "0")} REGISTROS</span></div>
            </div>
          </section>
          <footer className="page-footer"><span>ARMAZÉM&nbsp; / &nbsp;GESTÃO DE PRODUTOS</span><span>CADASTRO E CONSULTA</span></footer>
        </div>
      </main>
    </div>
  );
}
