"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgentChat } from "@/app/agent-chat";
import { getCurrentUser, getInventory, logout } from "@/lib/products";
import type { InventoryItem } from "@/lib/products";

function InventoryMark() {
  return <svg aria-hidden="true" viewBox="0 0 32 32" fill="none"><path d="M5 11 16 5l11 6-11 6-11-6Z" stroke="currentColor" strokeWidth="1.5" /><path d="M5 16l11 6 11-6M5 21l11 6 11-6" stroke="currentColor" strokeWidth="1.5" /></svg>;
}

export default function InventoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
    try { setItems(await getInventory(term)); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível carregar o estoque."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (authorized) void refresh(""); }, [authorized, refresh]);
  useEffect(() => {
    if (!authorized) return;
    if (!searchReady.current) { searchReady.current = true; return; }
    const timer = window.setTimeout(() => void refresh(search), 240);
    return () => window.clearTimeout(timer);
  }, [authorized, search, refresh]);

  async function signOut() { try { await logout(); } finally { router.replace("/login"); } }
  if (!authorized) return <main className="auth-loading" aria-live="polite">Validando sessão…</main>;

  const received = items.reduce((total, item) => total + item.received_quantity, 0);
  const sold = items.reduce((total, item) => total + item.sold_quantity, 0);
  const available = items.reduce((total, item) => total + item.available_quantity, 0);
  const negative = items.filter((item) => item.available_quantity < 0).length;

  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Armazém, catálogo de produtos"><span className="brand-mark"><InventoryMark /></span><span className="brand-name">armazém<span>.</span></span></Link>
        <div className="side-section-label">GESTÃO</div>
        <Link className="nav-item" href="/dashboard">Dashboard</Link>
        <Link className="nav-item" href="/">Produtos</Link><Link className="nav-item" href="/categories">Categorias</Link><Link className="nav-item" href="/suppliers">Fornecedores</Link><Link className="nav-item" href="/sales">Vendas</Link><Link className="nav-item" href="/purchase-orders">Pedidos</Link><Link className="nav-item active" href="/inventory" aria-current="page">Estoque<span className="nav-count">{items.length}</span></Link><Link className="nav-item" href="/replenishment">Agente</Link><div className="side-section-label">CONTA</div><Link className="nav-item" href="/account">Conta</Link>
        <div className="side-note"><span className="status-dot" /><span>Saldo calculado</span></div>
        <div className="sidebar-bottom"><span className="sidebar-rule" /><span className="sidebar-caption">POSIÇÃO DE ESTOQUE</span><span className="sidebar-edition">PAINEL DE OPERAÇÕES&nbsp; / &nbsp;06</span></div>
      </aside>
      <main className="main-content" id="inventory">
        <header className="topbar"><div className="breadcrumb"><span>ESTOQUE</span><span className="crumb-slash">/</span><strong>Posição atual</strong></div><div className="topbar-right"><AgentChat /><span className="topbar-date">SALDO&nbsp; · &nbsp;BR</span><Link className="user-name" href="/account">{username}</Link><button className="logout-button" onClick={() => void signOut()}>Sair</button></div></header>
        <div className="content-wrap">
          <section className="page-heading"><div><h1>Estoque</h1><p className="heading-copy">Pedidos recebidos menos produtos vendidos.</p></div><div className="catalog-total"><span className="total-number">{available}</span><span>unidades disponíveis</span></div></section>
          <section className="overview-strip inventory-overview" aria-label="Resumo do estoque"><div className="overview-cell"><span className="overview-label">RECEBIDO</span><strong>{received}</strong></div><div className="overview-cell"><span className="overview-label">VENDIDO</span><strong>{sold}</strong></div><div className="overview-cell"><span className="overview-label">DISPONÍVEL</span><strong>{available}</strong></div><div className="overview-cell"><span className="overview-label">SALDO NEGATIVO</span><strong className={negative ? "negative-number" : ""}>{negative}</strong></div><div className="overview-cell overview-context"><span className="overview-label">FÓRMULA</span><span>Recebido − vendido = disponível</span></div></section>

          <section className="catalog-section inventory-section" aria-labelledby="inventory-list-title">
            <div className="section-title-row catalog-title-row"><div><span className="section-index">01</span><h2 id="inventory-list-title">Saldo por produto</h2></div><label className="search-box" htmlFor="inventory-search"><svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><circle cx="8.8" cy="8.8" r="5.8" stroke="currentColor" strokeWidth="1.5" /><path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.5" /></svg><input id="inventory-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produto, SKU ou categoria" /></label></div>
            <div className="table-frame inventory-table"><div className="inventory-table-head"><span>PRODUTO</span><span>SKU</span><span>CATEGORIA</span><span>RECEBIDO</span><span>VENDIDO</span><span>DISPONÍVEL</span></div>{loading ? <div className="table-state"><span className="loader" />Calculando estoque…</div> : error ? <div className="table-state state-error"><strong>Não foi possível calcular o estoque.</strong><span>{error}</span><button className="text-button" onClick={() => void refresh(search)}>Tentar novamente ↗</button></div> : items.length === 0 ? <div className="table-state empty-state"><span className="empty-symbol"><InventoryMark /></span><strong>{search ? "Nenhum produto encontrado." : "Ainda não há produtos no estoque."}</strong><span>{search ? "Experimente outro nome, SKU ou categoria." : "Cadastre produtos e marque pedidos como recebidos para gerar saldo."}</span></div> : <div className="table-body">{items.map((item, index) => <article className={`inventory-row ${item.available_quantity < 0 ? "inventory-negative" : ""}`} key={item.product_id}><span className="row-number">{(index + 1).toString().padStart(2, "0")}</span><strong className="inventory-product">{item.product_name}</strong><span className="sku-value">{item.product_sku}</span><span className="category-value"><i />{item.category}</span><span className="inventory-movement received">+{item.received_quantity}</span><span className="inventory-movement sold">−{item.sold_quantity}</span><strong className="inventory-balance">{item.available_quantity}</strong></article>)}</div>}<div className="table-foot"><span>ESTOQUE CALCULADO EM TEMPO REAL</span><span>{items.length.toString().padStart(2, "0")} PRODUTOS</span></div></div>
          </section>
          <footer className="page-footer"><span>ARMAZÉM&nbsp; / &nbsp;POSIÇÃO DE ESTOQUE</span><span>ENTRADAS − SAÍDAS</span></footer>
        </div>
      </main>
    </div>
  );
}
