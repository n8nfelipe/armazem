"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgentChat } from "@/app/agent-chat";
import { getCurrentUser, getProducts, getSales, logout, removeSale, saveSale } from "@/lib/products";
import type { Product, Sale, SaleInput, SaleItemInput } from "@/lib/products";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const emptyForm = (): SaleInput => ({ customer_name: "", notes: "", items: [{ product_id: 0, quantity: 1 }] });

function SaleMark() {
  return <svg aria-hidden="true" viewBox="0 0 32 32" fill="none"><path d="M7 5h18v22l-3-2-3 2-3-2-3 2-3-2-3 2V5Z" stroke="currentColor" strokeWidth="1.5" /><path d="M11 11h10M11 15h10M11 19h5" stroke="currentColor" strokeWidth="1.4" /></svg>;
}

export default function SalesPage() {
  const router = useRouter();
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<SaleInput>(emptyForm);
  const [editing, setEditing] = useState<Sale | null>(null);
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
    getCurrentUser().then((user) => {
      if (!active) return;
      setUsername(user.username);
      setAuthorized(true);
    }).catch(() => { if (active) router.replace("/login"); });
    return () => { active = false; };
  }, [router]);

  const refresh = useCallback(async (term: string) => {
    setLoading(true);
    try {
      setSales(await getSales(term));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar as vendas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authorized) return;
    void refresh("");
    getProducts().then(setProducts).catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível carregar os produtos."));
  }, [authorized, refresh]);

  useEffect(() => {
    if (!authorized) return;
    if (!searchReady.current) { searchReady.current = true; return; }
    const timer = window.setTimeout(() => void refresh(search), 240);
    return () => window.clearTimeout(timer);
  }, [authorized, search, refresh]);

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const previewTotal = form.items.reduce((total, item) => total + Number(productMap.get(item.product_id)?.price ?? 0) * item.quantity, 0);
  const revenue = sales.reduce((total, sale) => total + Number(sale.total), 0);

  function changeItem(index: number, field: keyof SaleItemInput, value: number) {
    setForm((current) => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }));
  }

  function addItem() {
    setForm((current) => ({ ...current, items: [...current.items, { product_id: 0, quantity: 1 }] }));
  }

  function removeItem(index: number) {
    setForm((current) => ({ ...current, items: current.items.length === 1 ? current.items : current.items.filter((_, itemIndex) => itemIndex !== index) }));
  }

  function startEdit(sale: Sale) {
    setEditing(sale);
    setForm({
      customer_name: sale.customer_name ?? "",
      notes: sale.notes ?? "",
      items: sale.items.map((item) => ({ product_id: item.product_id ?? 0, quantity: item.quantity })),
    });
    setError("");
    setNotice("");
    document.getElementById("sale-customer")?.focus();
  }

  function resetForm() {
    setEditing(null);
    setForm(emptyForm());
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.items.some((item) => !item.product_id)) {
      setError("Selecione um produto em todos os itens da venda.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await saveSale(form, editing?.id);
      setNotice(editing ? "Venda atualizada." : "Venda registrada.");
      resetForm();
      await refresh(search);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar a venda.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSale(sale: Sale) {
    if (!window.confirm(`Remover a venda #${sale.id.toString().padStart(4, "0")}?`)) return;
    setError("");
    setNotice("");
    try {
      await removeSale(sale.id);
      if (editing?.id === sale.id) resetForm();
      setNotice("Venda removida.");
      await refresh(search);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível remover a venda.");
    }
  }

  async function signOut() { try { await logout(); } finally { router.replace("/login"); } }

  if (!authorized) return <main className="auth-loading" aria-live="polite">Validando sessão…</main>;

  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Armazém, catálogo de produtos"><span className="brand-mark"><SaleMark /></span><span className="brand-name">armazém<span>.</span></span></Link>
        <div className="side-section-label">GESTÃO</div>
        <Link className="nav-item" href="/dashboard">Dashboard</Link>
        <Link className="nav-item" href="/"><svg className="nav-glyph" aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M4 5h12M4 9h12M4 13h8M4 16h12" stroke="currentColor" strokeWidth="1.4" /></svg> Produtos</Link>
        <Link className="nav-item" href="/categories"><svg className="nav-glyph" aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M3.5 5.5h5l1.5 2h6.5v7h-13v-9Z" stroke="currentColor" strokeWidth="1.4" /></svg> Categorias</Link>
        <Link className="nav-item" href="/suppliers"><svg className="nav-glyph" aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M3 17V5h9v12M12 9h5v8M6 8h3M6 11h3M2 17h16" stroke="currentColor" strokeWidth="1.3" /></svg> Fornecedores</Link>
        <Link className="nav-item active" href="/sales" aria-current="page"><svg className="nav-glyph" aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M5 3h10v14l-2-1.5-2 1.5-2-1.5L7 17l-2-1.5V3ZM8 7h4M8 10h4" stroke="currentColor" strokeWidth="1.3" /></svg> Vendas<span className="nav-count">{sales.length}</span></Link>
        <Link className="nav-item" href="/purchase-orders">Pedidos</Link>
        <Link className="nav-item" href="/inventory">Estoque</Link>
        <Link className="nav-item" href="/replenishment">Agente</Link>
        <div className="side-note"><span className="status-dot" /><span>Catálogo conectado</span></div>
        <div className="sidebar-bottom"><span className="sidebar-rule" /><span className="sidebar-caption">REGISTRO DE VENDAS</span><span className="sidebar-edition">PAINEL DE OPERAÇÕES&nbsp; / &nbsp;04</span></div>
      </aside>

      <main className="main-content" id="sales">
        <header className="topbar"><div className="breadcrumb"><span>ESTOQUE</span><span className="crumb-slash">/</span><strong>Vendas</strong></div><div className="topbar-right"><AgentChat /><span className="topbar-date">CATÁLOGO&nbsp; · &nbsp;BR</span><span className="user-name">{username}</span><button className="logout-button" onClick={() => void signOut()}>Sair</button></div></header>
        <div className="content-wrap">
          <section className="page-heading"><div><h1>Vendas</h1><p className="heading-copy">Registre saídas de produtos e acompanhe os valores vendidos.</p></div><div className="catalog-total"><span className="total-number">{sales.length.toString().padStart(2, "0")}</span><span>vendas</span></div></section>
          <section className="overview-strip" aria-label="Resumo das vendas"><div className="overview-cell"><span className="overview-label">VENDAS</span><strong>{sales.length.toString().padStart(2, "0")}</strong></div><div className="overview-cell"><span className="overview-label">VALOR LISTADO</span><strong>{money.format(revenue)}</strong></div><div className="overview-cell overview-context"><span className="overview-label">REGISTRO COMERCIAL</span><span>Os preços são preservados na data da venda</span></div><div className="overview-stamp"><span>AR</span><span>SAÍDA DE<br />PRODUTOS</span></div></section>

          <div className="section-title-row"><div><span className="section-index">01</span><h2>Registro de venda</h2></div>{editing && <span className="editing-label">EDITANDO VENDA&nbsp; #{editing.id.toString().padStart(4, "0")}</span>}</div>
          <section className="form-sheet" aria-label={editing ? "Editar venda" : "Registrar venda"}>
            <div className="form-intro"><span className="form-mark"><SaleMark /></span><span>{editing ? "ATUALIZAÇÃO DE VENDA" : "NOVA VENDA"}</span><span className="form-ref">VEN&nbsp; / &nbsp;{editing ? editing.id.toString().padStart(4, "0") : "____"}</span></div>
            <form onSubmit={submit}>
              <div className="sale-meta-grid">
                <label className="field" htmlFor="sale-customer"><span>Cliente <small>OPCIONAL</small></span><input id="sale-customer" value={form.customer_name ?? ""} onChange={(event) => setForm((current) => ({ ...current, customer_name: event.target.value }))} placeholder="Ex.: Mercado Central" maxLength={120} /></label>
                <label className="field" htmlFor="sale-notes"><span>Observações <small>OPCIONAL</small></span><input id="sale-notes" value={form.notes ?? ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Pagamento, entrega ou referência" maxLength={2000} /></label>
              </div>
              <div className="sale-items-heading"><span>ITENS DA VENDA</span><button type="button" onClick={addItem} disabled={form.items.length >= products.length}>+ Adicionar produto</button></div>
              <div className="sale-items">
                {form.items.map((item, index) => {
                  const selected = productMap.get(item.product_id);
                  const usedIds = new Set(form.items.map((entry) => entry.product_id));
                  return <div className="sale-item-editor" key={index}>
                    <span className="sale-item-index">{(index + 1).toString().padStart(2, "0")}</span>
                    <label className="field"><span>Produto <b>*</b></span><select value={item.product_id || ""} onChange={(event) => changeItem(index, "product_id", Number(event.target.value))} required><option value="">Selecione um produto</option>{products.map((product) => <option key={product.id} value={product.id} disabled={usedIds.has(product.id) && product.id !== item.product_id}>{product.name} · {product.sku}</option>)}</select></label>
                    <label className="field"><span>Quantidade <b>*</b></span><input type="number" min="1" max="9999" step="1" value={item.quantity} onChange={(event) => changeItem(index, "quantity", Number(event.target.value))} required /></label>
                    <div className="sale-item-price"><span>PREÇO UNITÁRIO</span><strong>{money.format(Number(selected?.price ?? 0))}</strong></div>
                    <div className="sale-item-price"><span>SUBTOTAL</span><strong>{money.format(Number(selected?.price ?? 0) * item.quantity)}</strong></div>
                    <button className="sale-item-remove" type="button" onClick={() => removeItem(index)} disabled={form.items.length === 1} aria-label={`Remover item ${index + 1}`}>Remover</button>
                  </div>;
                })}
              </div>
              {products.length === 0 && <p className="feedback error" role="alert">Cadastre um produto antes de registrar uma venda.</p>}
              {error && <p className="feedback error" role="alert">{error}</p>}
              {notice && <p className="feedback success" role="status">{notice}</p>}
              <div className="form-actions">{editing && <button className="button button-quiet" type="button" onClick={resetForm}>Cancelar edição</button>}<span className="sale-preview-total">TOTAL <strong>{money.format(previewTotal)}</strong></span><button className="button button-primary" type="submit" disabled={saving || products.length === 0}>{saving ? "Salvando…" : editing ? "Salvar alterações" : "Registrar venda"}<span aria-hidden="true">↗</span></button></div>
            </form>
          </section>

          <section className="catalog-section" aria-labelledby="sale-list-title">
            <div className="section-title-row catalog-title-row"><div><span className="section-index">02</span><h2 id="sale-list-title">Vendas registradas</h2></div><label className="search-box" htmlFor="sale-search"><svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><circle cx="8.8" cy="8.8" r="5.8" stroke="currentColor" strokeWidth="1.5" /><path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.5" /></svg><input id="sale-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar venda, cliente ou produto" /></label></div>
            <div className="table-frame sale-table">
              <div className="sale-table-head"><span>VENDA</span><span>CLIENTE</span><span>ITENS</span><span>TOTAL</span><span className="sr-only">Ações</span></div>
              {loading ? <div className="table-state"><span className="loader" />Carregando vendas…</div> : error && sales.length === 0 ? <div className="table-state state-error"><strong>Não foi possível abrir as vendas.</strong><span>{error}</span><button className="text-button" onClick={() => void refresh(search)}>Tentar novamente ↗</button></div> : sales.length === 0 ? <div className="table-state empty-state"><span className="empty-symbol"><SaleMark /></span><strong>{search ? "Nenhuma venda encontrada." : "Ainda não há vendas."}</strong><span>{search ? "Experimente outro cliente, produto, SKU ou número." : "Registre a primeira venda usando o formulário acima."}</span></div> : <div className="table-body">{sales.map((sale) => <article className="sale-row" key={sale.id}><div className="sale-reference"><strong>#{sale.id.toString().padStart(4, "0")}</strong><span>{dateTime.format(new Date(sale.created_at))}</span></div><span className="sale-customer">{sale.customer_name || "Consumidor não informado"}</span><div className="sale-products"><strong>{sale.items.reduce((total, item) => total + item.quantity, 0)} un.</strong><span>{sale.items.map((item) => item.product_name).join(", ")}</span></div><strong className="sale-total">{money.format(Number(sale.total))}</strong><div className="row-actions"><button onClick={() => startEdit(sale)} aria-label={`Editar venda ${sale.id}`}>Editar</button><button onClick={() => void deleteSale(sale)} aria-label={`Remover venda ${sale.id}`}>Remover</button></div></article>)}</div>}
              <div className="table-foot"><span>FIM DAS VENDAS</span><span>{sales.length.toString().padStart(2, "0")} REGISTROS</span></div>
            </div>
          </section>
          <footer className="page-footer"><span>ARMAZÉM&nbsp; / &nbsp;GESTÃO DE VENDAS</span><span>REGISTRO E CONSULTA</span></footer>
        </div>
      </main>
    </div>
  );
}
