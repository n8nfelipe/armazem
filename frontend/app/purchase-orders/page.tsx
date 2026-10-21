"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgentChat } from "@/app/agent-chat";
import { getCurrentUser, getProducts, getPurchaseOrders, getSuppliers, logout, removePurchaseOrder, savePurchaseOrder } from "@/lib/products";
import type { Product, PurchaseOrder, PurchaseOrderInput, PurchaseOrderItemInput, PurchaseOrderStatus, Supplier } from "@/lib/products";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateOnly = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const statusLabels: Record<PurchaseOrderStatus, string> = { rascunho: "Rascunho", enviado: "Enviado", recebido: "Recebido", cancelado: "Cancelado" };
const emptyForm = (): PurchaseOrderInput => ({ supplier_id: 0, status: "rascunho", expected_date: null, notes: "", items: [{ product_id: 0, quantity: 1, unit_cost: "" }] });

function OrderMark() {
  return <svg aria-hidden="true" viewBox="0 0 32 32" fill="none"><path d="M6 7h20v20H6V7ZM10 4v6M22 4v6M10 15h12M10 20h8" stroke="currentColor" strokeWidth="1.5" /><path d="m20 23 2 2 4-5" stroke="currentColor" strokeWidth="1.5" /></svg>;
}

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState<PurchaseOrderInput>(emptyForm);
  const [editing, setEditing] = useState<PurchaseOrder | null>(null);
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
    getCurrentUser().then((user) => { if (active) { setUsername(user.username); setAuthorized(true); } }).catch(() => { if (active) router.replace("/login"); });
    return () => { active = false; };
  }, [router]);

  const refresh = useCallback(async (term: string) => {
    setLoading(true);
    try { setOrders(await getPurchaseOrders(term)); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível carregar os pedidos."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!authorized) return;
    void refresh("");
    Promise.all([getProducts(), getSuppliers()]).then(([productList, supplierList]) => { setProducts(productList); setSuppliers(supplierList); }).catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível carregar produtos e fornecedores."));
  }, [authorized, refresh]);

  useEffect(() => {
    if (!authorized) return;
    if (!searchReady.current) { searchReady.current = true; return; }
    const timer = window.setTimeout(() => void refresh(search), 240);
    return () => window.clearTimeout(timer);
  }, [authorized, search, refresh]);

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const previewTotal = form.items.reduce((total, item) => total + Number(item.unit_cost || 0) * item.quantity, 0);
  const pendingCount = orders.filter((order) => order.status === "rascunho" || order.status === "enviado").length;

  function changeItem<K extends keyof PurchaseOrderItemInput>(index: number, field: K, value: PurchaseOrderItemInput[K]) {
    setForm((current) => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }));
  }

  function addItem() { setForm((current) => ({ ...current, items: [...current.items, { product_id: 0, quantity: 1, unit_cost: "" }] })); }
  function removeItem(index: number) { setForm((current) => ({ ...current, items: current.items.length === 1 ? current.items : current.items.filter((_, itemIndex) => itemIndex !== index) })); }

  function startEdit(order: PurchaseOrder) {
    if (order.status === "recebido") return;
    setEditing(order);
    setForm({ supplier_id: order.supplier_id ?? 0, status: order.status, expected_date: order.expected_date, notes: order.notes ?? "", items: order.items.map((item) => ({ product_id: item.product_id ?? 0, quantity: item.quantity, unit_cost: item.unit_cost })) });
    setError(""); setNotice("");
    document.getElementById("order-supplier")?.focus();
  }

  function resetForm() { setEditing(null); setForm(emptyForm()); setError(""); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.supplier_id) { setError("Selecione um fornecedor."); return; }
    if (form.items.some((item) => !item.product_id || Number(item.unit_cost) <= 0)) { setError("Selecione o produto e informe um custo válido em todos os itens."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      await savePurchaseOrder({ ...form, items: form.items.map((item) => ({ ...item, unit_cost: Number(item.unit_cost).toFixed(2) })) }, editing?.id);
      setNotice(editing ? "Pedido atualizado." : "Pedido criado.");
      resetForm(); await refresh(search);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar o pedido."); }
    finally { setSaving(false); }
  }

  async function deleteOrder(order: PurchaseOrder) {
    if (!window.confirm(`Remover o pedido #${order.id.toString().padStart(4, "0")}?`)) return;
    setError(""); setNotice("");
    try { await removePurchaseOrder(order.id); if (editing?.id === order.id) resetForm(); setNotice("Pedido removido."); await refresh(search); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível remover o pedido."); }
  }

  async function signOut() { try { await logout(); } finally { router.replace("/login"); } }
  if (!authorized) return <main className="auth-loading" aria-live="polite">Validando sessão…</main>;

  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Armazém, catálogo de produtos"><span className="brand-mark"><OrderMark /></span><span className="brand-name">armazém<span>.</span></span></Link>
        <div className="side-section-label">GESTÃO</div>
        <Link className="nav-item" href="/dashboard">Dashboard</Link>
        <Link className="nav-item" href="/">Produtos</Link><Link className="nav-item" href="/categories">Categorias</Link><Link className="nav-item" href="/suppliers">Fornecedores</Link><Link className="nav-item" href="/sales">Vendas</Link><Link className="nav-item active" href="/purchase-orders" aria-current="page">Pedidos<span className="nav-count">{orders.length}</span></Link><Link className="nav-item" href="/inventory">Estoque</Link><Link className="nav-item" href="/replenishment">Agente</Link><div className="side-section-label">CONTA</div><Link className="nav-item" href="/account">Conta</Link>
        <div className="side-note"><span className="status-dot" /><span>Catálogo conectado</span></div>
        <div className="sidebar-bottom"><span className="sidebar-rule" /><span className="sidebar-caption">PEDIDOS A FORNECEDORES</span><span className="sidebar-edition">PAINEL DE OPERAÇÕES&nbsp; / &nbsp;05</span></div>
      </aside>
      <main className="main-content" id="purchase-orders">
        <header className="topbar"><div className="breadcrumb"><span>ESTOQUE</span><span className="crumb-slash">/</span><strong>Pedidos</strong></div><div className="topbar-right"><AgentChat /><span className="topbar-date">COMPRAS&nbsp; · &nbsp;BR</span><Link className="user-name" href="/account">{username}</Link><button className="logout-button" onClick={() => void signOut()}>Sair</button></div></header>
        <div className="content-wrap">
          <section className="page-heading"><div><h1>Pedidos</h1><p className="heading-copy">Solicite produtos aos fornecedores e acompanhe cada compra.</p></div><div className="catalog-total"><span className="total-number">{orders.length.toString().padStart(2, "0")}</span><span>pedidos</span></div></section>
          <section className="overview-strip" aria-label="Resumo dos pedidos"><div className="overview-cell"><span className="overview-label">PEDIDOS</span><strong>{orders.length.toString().padStart(2, "0")}</strong></div><div className="overview-cell"><span className="overview-label">EM ABERTO</span><strong>{pendingCount.toString().padStart(2, "0")}</strong></div><div className="overview-cell overview-context"><span className="overview-label">ABASTECIMENTO</span><span>Custos e previsões preservados por pedido</span></div><div className="overview-stamp"><span>AR</span><span>ORDEM DE<br />COMPRA</span></div></section>

          <div className="section-title-row"><div><span className="section-index">01</span><h2>Pedido ao fornecedor</h2></div>{editing && <span className="editing-label">EDITANDO PEDIDO&nbsp; #{editing.id.toString().padStart(4, "0")}</span>}</div>
          <section className="form-sheet" aria-label={editing ? "Editar pedido" : "Criar pedido"}>
            <div className="form-intro"><span className="form-mark"><OrderMark /></span><span>{editing ? "ATUALIZAÇÃO DE PEDIDO" : "NOVO PEDIDO DE COMPRA"}</span><span className="form-ref">PED&nbsp; / &nbsp;{editing ? editing.id.toString().padStart(4, "0") : "____"}</span></div>
            <form onSubmit={submit}>
              <div className="order-meta-grid">
                <label className="field" htmlFor="order-supplier"><span>Fornecedor <b>*</b></span><select id="order-supplier" value={form.supplier_id || ""} onChange={(event) => setForm((current) => ({ ...current, supplier_id: Number(event.target.value) }))} required><option value="">Selecione um fornecedor</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name} · {supplier.document}</option>)}</select></label>
                <label className="field"><span>Status <b>*</b></span><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as PurchaseOrderStatus }))}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="field"><span>Previsão de entrega <small>OPCIONAL</small></span><input type="date" value={form.expected_date ?? ""} onChange={(event) => setForm((current) => ({ ...current, expected_date: event.target.value || null }))} /></label>
                <label className="field order-notes"><span>Observações <small>OPCIONAL</small></span><input value={form.notes ?? ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Condições, frete ou referência" maxLength={2000} /></label>
              </div>
              <div className="sale-items-heading"><span>PRODUTOS SOLICITADOS</span><button type="button" onClick={addItem} disabled={form.items.length >= products.length}>+ Adicionar produto</button></div>
              <div className="sale-items">{form.items.map((item, index) => { const selected = productMap.get(item.product_id); const usedIds = new Set(form.items.map((entry) => entry.product_id)); return <div className="order-item-editor" key={index}><span className="sale-item-index">{(index + 1).toString().padStart(2, "0")}</span><label className="field"><span>Produto <b>*</b></span><select value={item.product_id || ""} onChange={(event) => changeItem(index, "product_id", Number(event.target.value))} required><option value="">Selecione um produto</option>{products.map((product) => <option key={product.id} value={product.id} disabled={usedIds.has(product.id) && product.id !== item.product_id}>{product.name} · {product.sku}</option>)}</select>{selected && <small className="field-help">Venda: {money.format(Number(selected.price))}</small>}</label><label className="field"><span>Quantidade <b>*</b></span><input type="number" min="1" max="999999" step="1" value={item.quantity} onChange={(event) => changeItem(index, "quantity", Number(event.target.value))} required /></label><label className="field"><span>Custo unitário <b>*</b></span><span className="price-input"><span>R$</span><input type="number" min="0.01" step="0.01" value={item.unit_cost} onChange={(event) => changeItem(index, "unit_cost", event.target.value)} placeholder="0,00" required /></span></label><div className="sale-item-price"><span>SUBTOTAL</span><strong>{money.format(Number(item.unit_cost || 0) * item.quantity)}</strong></div><button className="sale-item-remove" type="button" onClick={() => removeItem(index)} disabled={form.items.length === 1}>Remover</button></div>; })}</div>
              {(products.length === 0 || suppliers.length === 0) && <p className="feedback error" role="alert">Cadastre pelo menos um produto e um fornecedor antes de criar o pedido.</p>}
              {error && <p className="feedback error" role="alert">{error}</p>}{notice && <p className="feedback success" role="status">{notice}</p>}
              <div className="form-actions">{editing && <button className="button button-quiet" type="button" onClick={resetForm}>Cancelar edição</button>}<span className="sale-preview-total">TOTAL <strong>{money.format(previewTotal)}</strong></span><button className="button button-primary" type="submit" disabled={saving || products.length === 0 || suppliers.length === 0}>{saving ? "Salvando…" : editing ? "Salvar alterações" : "Criar pedido"}<span aria-hidden="true">↗</span></button></div>
            </form>
          </section>

          <section className="catalog-section" aria-labelledby="order-list-title"><div className="section-title-row catalog-title-row"><div><span className="section-index">02</span><h2 id="order-list-title">Pedidos registrados</h2></div><label className="search-box" htmlFor="order-search"><svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><circle cx="8.8" cy="8.8" r="5.8" stroke="currentColor" strokeWidth="1.5" /><path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.5" /></svg><input id="order-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar pedido ou fornecedor" /></label></div>
            <div className="table-frame order-table"><div className="order-table-head"><span>PEDIDO</span><span>FORNECEDOR</span><span>STATUS / PREVISÃO</span><span>ITENS</span><span>TOTAL</span><span className="sr-only">Ações</span></div>{loading ? <div className="table-state"><span className="loader" />Carregando pedidos…</div> : error && orders.length === 0 ? <div className="table-state state-error"><strong>Não foi possível abrir os pedidos.</strong><span>{error}</span><button className="text-button" onClick={() => void refresh(search)}>Tentar novamente ↗</button></div> : orders.length === 0 ? <div className="table-state empty-state"><span className="empty-symbol"><OrderMark /></span><strong>{search ? "Nenhum pedido encontrado." : "Ainda não há pedidos."}</strong><span>{search ? "Experimente outro número, fornecedor, produto ou status." : "Crie o primeiro pedido usando o formulário acima."}</span></div> : <div className="table-body">{orders.map((order) => <article className="order-row" key={order.id}><div className="sale-reference"><strong>#{order.id.toString().padStart(4, "0")}</strong><span>{dateTime.format(new Date(order.created_at))}</span></div><div className="order-supplier"><strong>{order.supplier_name}</strong><span>{order.supplier_document}</span></div><div className="order-status"><span className={`status-badge status-${order.status}`}>{statusLabels[order.status]}</span><small>{order.expected_date ? `Prev. ${dateOnly.format(new Date(`${order.expected_date}T00:00:00Z`))}` : "Sem previsão"}</small></div><div className="sale-products"><strong>{order.items.reduce((total, item) => total + item.quantity, 0)} un.</strong><span>{order.items.map((item) => item.product_name).join(", ")}</span></div><strong className="sale-total">{money.format(Number(order.total))}</strong><div className="row-actions"><button onClick={() => startEdit(order)} disabled={order.status === "recebido"} title={order.status === "recebido" ? "Pedidos recebidos são imutáveis" : undefined}>Editar</button><button onClick={() => void deleteOrder(order)} disabled={order.status === "recebido"} title={order.status === "recebido" ? "Pedidos recebidos são imutáveis" : undefined}>Remover</button></div></article>)}</div>}<div className="table-foot"><span>FIM DOS PEDIDOS</span><span>{orders.length.toString().padStart(2, "0")} REGISTROS</span></div></div>
          </section>
          <footer className="page-footer"><span>ARMAZÉM&nbsp; / &nbsp;PEDIDOS A FORNECEDORES</span><span>COMPRA E ABASTECIMENTO</span></footer>
        </div>
      </main>
    </div>
  );
}
