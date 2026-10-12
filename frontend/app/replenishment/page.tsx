"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgentChat } from "@/app/agent-chat";
import {
  generateReplenishmentOrders,
  getCurrentUser,
  getReplenishmentPlan,
  getSuppliers,
  logout,
  removeReplenishmentPolicy,
  saveReplenishmentPolicy,
} from "@/lib/products";
import type {
  ReplenishmentItem,
  ReplenishmentPlan,
  ReplenishmentPolicyInput,
  ReplenishmentPriority,
  Supplier,
} from "@/lib/products";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const integer = new Intl.NumberFormat("pt-BR");
const priorityLabels: Record<ReplenishmentPriority, string> = {
  configurar: "Configurar",
  pausada: "Pausada",
  normal: "Normal",
  media: "Atenção",
  alta: "Alta",
  critica: "Crítica",
};
const emptyPolicy = (): ReplenishmentPolicyInput => ({
  supplier_id: 0,
  minimum_stock: 10,
  target_stock: 20,
  unit_cost: "",
  lead_time_days: 7,
  enabled: true,
});

function AgentMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none">
      <path d="M8 11h16v13H8V11Zm5-4h6m-3 0V4M5 15H2m28 0h-3M12 17h.01M20 17h.01M12 21h8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export default function ReplenishmentPage() {
  const router = useRouter();
  const [plan, setPlan] = useState<ReplenishmentPlan | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [editing, setEditing] = useState<ReplenishmentItem | null>(null);
  const [policy, setPolicy] = useState<ReplenishmentPolicyInput>(emptyPolicy);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [username, setUsername] = useState("");

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((user) => { if (active) { setUsername(user.username); setAuthorized(true); } })
      .catch(() => { if (active) router.replace("/login"); });
    return () => { active = false; };
  }, [router]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextPlan, supplierList] = await Promise.all([getReplenishmentPlan(), getSuppliers()]);
      setPlan(nextPlan);
      setSuppliers(supplierList);
      setSelected(nextPlan.items.filter((item) => item.recommended_quantity > 0).map((item) => item.product_id));
      setError("");
    } catch (reason) {
      setPlan(null);
      setSelected([]);
      setError(reason instanceof Error ? reason.message : "Não foi possível executar a análise.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (authorized) void refresh(); }, [authorized, refresh]);

  const visibleItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return plan?.items ?? [];
    return (plan?.items ?? []).filter((item) =>
      [item.product_name, item.product_sku, item.category, item.supplier_name ?? ""]
        .some((value) => value.toLocaleLowerCase("pt-BR").includes(term)),
    );
  }, [plan, search]);

  const selectedItems = (plan?.items ?? []).filter((item) => selected.includes(item.product_id) && item.recommended_quantity > 0);
  const selectedTotal = selectedItems.reduce((total, item) => total + Number(item.estimated_cost), 0);
  const selectedSuppliers = new Set(selectedItems.map((item) => item.supplier_id)).size;

  function startConfiguration(item: ReplenishmentItem) {
    setEditing(item);
    setPolicy({
      supplier_id: item.supplier_id ?? 0,
      minimum_stock: Math.max(item.minimum_stock ?? 10, 10),
      target_stock: Math.max(item.target_stock ?? 20, 11),
      unit_cost: item.unit_cost ?? "",
      lead_time_days: item.lead_time_days ?? 7,
      enabled: item.configured ? item.enabled : true,
    });
    setError("");
    setNotice("");
    window.setTimeout(() => document.getElementById("policy-supplier")?.focus(), 0);
  }

  async function submitPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    if (!policy.supplier_id) { setError("Selecione o fornecedor preferencial."); return; }
    if (policy.minimum_stock < 10) { setError("O estoque mínimo obrigatório é de 10 unidades."); return; }
    if (policy.target_stock <= policy.minimum_stock) { setError("O estoque alvo deve ser maior que o mínimo."); return; }
    if (Number(policy.unit_cost) <= 0) { setError("Informe um custo unitário válido."); return; }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await saveReplenishmentPolicy(editing.product_id, {
        ...policy,
        unit_cost: Number(policy.unit_cost).toFixed(2),
      });
      setNotice(`Regra de ${editing.product_name} salva.`);
      setEditing(null);
      setPolicy(emptyPolicy());
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar a regra.");
    } finally {
      setSaving(false);
    }
  }

  async function deletePolicy(item: ReplenishmentItem) {
    if (!window.confirm(`Remover a regra de reposição de ${item.product_name}?`)) return;
    setError("");
    setNotice("");
    try {
      await removeReplenishmentPolicy(item.product_id);
      setNotice("Regra de reposição removida.");
      if (editing?.product_id === item.product_id) setEditing(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível remover a regra.");
    }
  }

  async function generateOrders() {
    if (selectedItems.length === 0) { setError("Selecione ao menos uma recomendação."); return; }
    setGenerating(true);
    setError("");
    setNotice("");
    try {
      const result = await generateReplenishmentOrders(selectedItems.map((item) => item.product_id));
      setNotice(`${result.order_count} pedido(s) em rascunho criado(s), com ${result.item_count} item(ns).`);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível montar os pedidos.");
    } finally {
      setGenerating(false);
    }
  }

  function toggleSelection(productId: number) {
    setSelected((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]);
  }

  async function signOut() { try { await logout(); } finally { router.replace("/login"); } }
  if (!authorized) return <main className="auth-loading" aria-live="polite">Validando sessão…</main>;

  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard" aria-label="Armazém, agente de reposição"><span className="brand-mark"><AgentMark /></span><span className="brand-name">armazém<span>.</span></span></Link>
        <div className="side-section-label">GESTÃO</div>
        <Link className="nav-item" href="/dashboard">Dashboard</Link><Link className="nav-item" href="/">Produtos</Link><Link className="nav-item" href="/categories">Categorias</Link><Link className="nav-item" href="/suppliers">Fornecedores</Link><Link className="nav-item" href="/sales">Vendas</Link><Link className="nav-item" href="/purchase-orders">Pedidos</Link><Link className="nav-item" href="/inventory">Estoque</Link><Link className="nav-item active" href="/replenishment" aria-current="page">Agente</Link>
        <div className="side-note"><span className="status-dot" /><span>Análise local, sem API</span></div>
        <div className="sidebar-bottom"><span className="sidebar-rule" /><span className="sidebar-caption">AGENTE DE REPOSIÇÃO</span><span className="sidebar-edition">PAINEL DE OPERAÇÕES&nbsp; / &nbsp;07</span></div>
      </aside>

      <main className="main-content" id="replenishment">
        <header className="topbar"><div className="breadcrumb"><span>ESTOQUE</span><span className="crumb-slash">/</span><strong>Agente de reposição</strong></div><div className="topbar-right"><AgentChat /><span className="topbar-date">ANÁLISE&nbsp; · &nbsp;LOCAL</span><span className="user-name">{username}</span><button className="logout-button" onClick={() => void signOut()}>Sair</button></div></header>
        <div className="content-wrap">
          <section className="page-heading"><div><h1>Agente de reposição</h1><p className="heading-copy">Prevê a necessidade, considera pedidos abertos e monta rascunhos por fornecedor.</p></div><div className="catalog-total"><span className="total-number">{plan?.recommendation_count ?? 0}</span><span>ações sugeridas</span></div></section>

          <section className="overview-strip replenishment-overview" aria-label="Resumo da análise"><div className="overview-cell"><span className="overview-label">CONFIGURADOS</span><strong>{plan?.configured_count ?? 0}</strong></div><div className="overview-cell"><span className="overview-label">REPOR AGORA</span><strong>{plan?.recommendation_count ?? 0}</strong></div><div className="overview-cell"><span className="overview-label">INVESTIMENTO</span><strong>{money.format(Number(plan?.estimated_total ?? 0))}</strong></div><div className="overview-cell overview-context"><span className="overview-label">REGRA FIXA</span><span>Mínimo de 10 unidades · consumo dos últimos 30 dias · pedidos abertos descontados</span></div></section>

          {editing && <section aria-labelledby="policy-title">
            <div className="section-title-row"><div><h2 id="policy-title">Regra de {editing.product_name}</h2></div><span className="editing-label">{editing.product_sku}</span></div>
            <form className="form-sheet" onSubmit={submitPolicy}>
              <div className="form-intro"><span className="form-mark"><AgentMark /></span>PARÂMETROS DE REPOSIÇÃO<span className="form-ref">SEM API EXTERNA</span></div>
              <div className="replenishment-form-grid">
                <label className="field"><span>Fornecedor <b>*</b></span><select id="policy-supplier" value={policy.supplier_id} onChange={(event) => setPolicy((current) => ({ ...current, supplier_id: Number(event.target.value) }))}><option value={0}>Selecione</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
                <label className="field"><span>Estoque mínimo <b>*</b></span><input type="number" min="10" max="999999" value={policy.minimum_stock} onChange={(event) => setPolicy((current) => ({ ...current, minimum_stock: Number(event.target.value) }))} /><small>MÍNIMO OBRIGATÓRIO: 10</small></label>
                <label className="field"><span>Estoque alvo <b>*</b></span><input type="number" min="11" max="999999" value={policy.target_stock} onChange={(event) => setPolicy((current) => ({ ...current, target_stock: Number(event.target.value) }))} /></label>
                <label className="field"><span>Custo unitário <b>*</b></span><div className="price-input"><span>R$</span><input inputMode="decimal" value={policy.unit_cost} onChange={(event) => setPolicy((current) => ({ ...current, unit_cost: event.target.value.replace(",", ".") }))} placeholder="0,00" /></div></label>
                <label className="field"><span>Prazo do fornecedor <b>*</b></span><input type="number" min="1" max="365" value={policy.lead_time_days} onChange={(event) => setPolicy((current) => ({ ...current, lead_time_days: Number(event.target.value) }))} /><small>DIAS</small></label>
                <label className="policy-toggle"><input type="checkbox" checked={policy.enabled} onChange={(event) => setPolicy((current) => ({ ...current, enabled: event.target.checked }))} /><span>Regra ativa</span></label>
              </div>
              <div className="form-actions"><span className="required-note"><b>*</b> campos obrigatórios</span><button className="button button-quiet" type="button" onClick={() => setEditing(null)}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? "Salvando…" : "Salvar regra"}<span>→</span></button></div>
            </form>
          </section>}

          <section className="catalog-section" aria-labelledby="recommendations-title">
            <div className="section-title-row catalog-title-row"><div><h2 id="recommendations-title">Leitura por produto</h2></div><label className="search-box"><span className="sr-only">Buscar</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produto, SKU ou fornecedor" /></label></div>
            {error && plan && <p className="feedback error" role="alert">{error}</p>}
            {notice && <p className="feedback success" role="status">{notice} <Link href="/purchase-orders">Ver pedidos ↗</Link></p>}
            <div className="agent-action-bar"><div><strong>{selectedItems.length} itens selecionados</strong><span>{selectedSuppliers} fornecedor(es) · {money.format(selectedTotal)}</span></div><button className="button button-primary" type="button" disabled={generating || selectedItems.length === 0} onClick={() => void generateOrders()}>{generating ? "Montando…" : "Montar pedidos em rascunho"}<span>→</span></button></div>
            <div className="table-frame replenishment-table">
              <div className="replenishment-table-head"><span>SELEÇÃO</span><span>PRODUTO / REGRA</span><span>SALDO</span><span>PREVISÃO</span><span>SUGESTÃO</span><span>PRIORIDADE</span><span className="sr-only">Ações</span></div>
              {loading ? <div className="table-state"><span className="loader" />Analisando estoque e consumo…</div> : error && !plan ? <div className="table-state state-error" role="alert"><strong>Não foi possível analisar o estoque.</strong><span>{error}</span><button className="text-button" onClick={() => void refresh()}>Tentar novamente ↗</button></div> : visibleItems.length === 0 ? <div className="table-state empty-state"><span className="empty-symbol"><AgentMark /></span><strong>Nenhum produto encontrado.</strong><span>Cadastre produtos ou ajuste a busca.</span></div> : <div className="table-body">{visibleItems.map((item) => {
                const eligible = item.recommended_quantity > 0;
                return <article className={`replenishment-row priority-${item.priority}`} key={item.product_id}>
                  <label className="agent-check"><input type="checkbox" disabled={!eligible} checked={eligible && selected.includes(item.product_id)} onChange={() => toggleSelection(item.product_id)} /><span className="sr-only">Selecionar {item.product_name}</span></label>
                  <div className="agent-product"><strong>{item.product_name}</strong><span>{item.product_sku} · {item.supplier_name ?? "Sem fornecedor"}</span><small>{item.reason}</small></div>
                  <div className="agent-number"><span>ATUAL</span><strong>{integer.format(item.available_quantity)}</strong><small>+{integer.format(item.on_order_quantity)} a receber</small></div>
                  <div className="agent-number"><span>NO PRAZO</span><strong>{integer.format(item.projected_quantity)}</strong><small>{item.recent_sold_quantity} vendidos / 30d</small></div>
                  <div className="agent-number agent-suggestion"><span>COMPRAR</span><strong>{eligible ? integer.format(item.recommended_quantity) : "—"}</strong><small>{eligible ? money.format(Number(item.estimated_cost)) : "sem ação"}</small></div>
                  <span className={`priority-badge priority-${item.priority}`}>{priorityLabels[item.priority]}</span>
                  <div className="row-actions"><button onClick={() => startConfiguration(item)}>{item.configured ? "Editar" : "Configurar"}</button>{item.configured && <button onClick={() => void deletePolicy(item)}>Remover</button>}</div>
                </article>;
              })}</div>}
              <div className="table-foot"><span>ANÁLISE LOCAL E EXPLICÁVEL</span><span>{visibleItems.length.toString().padStart(2, "0")} PRODUTOS</span></div>
            </div>
          </section>
          <footer className="page-footer"><span>ARMAZÉM&nbsp; / &nbsp;AGENTE DE REPOSIÇÃO</span><span>RASCUNHOS EXIGEM REVISÃO</span></footer>
        </div>
      </main>
    </div>
  );
}
