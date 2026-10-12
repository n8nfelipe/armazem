"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgentChat } from "@/app/agent-chat";
import { getCurrentUser, getInventory, getProducts, getSales, logout } from "@/lib/products";
import type { InventoryItem, Product, Sale } from "@/lib/products";

type Period = 1 | 7 | 30;
type DayTotal = { date: Date; key: string; label: string; total: number };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const compactMoney = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const integer = new Intl.NumberFormat("pt-BR");
const shortDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });

function localDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function DashboardMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none">
      <path d="M5 6h9v9H5V6Zm13 0h9v5h-9V6ZM5 19h9v7H5v-7Zm13-4h9v11h-9V15Z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ChartGlyph() {
  return (
    <svg className="nav-glyph" aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path d="M3.5 16.5h13M5 14V9m5 5V4m5 10v-7" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function SalesChart({ days }: { days: DayTotal[] }) {
  const chartWidth = 660;
  const chartHeight = 188;
  const left = 54;
  const top = 24;
  const max = Math.max(...days.map((day) => day.total), 1);
  const points = days.map((day, index) => {
    const x = left + (days.length === 1 ? chartWidth / 2 : (index * chartWidth) / (days.length - 1));
    const y = top + chartHeight - (day.total / max) * chartHeight;
    return { ...day, x, y };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = points.length ? `M ${points.map((point) => `${point.x} ${point.y}`).join(" L ")} L ${points.at(-1)?.x} ${top + chartHeight} L ${points[0].x} ${top + chartHeight} Z` : "";
  const labelIndexes = Array.from(new Set([0, Math.floor((days.length - 1) / 2), days.length - 1]));

  return (
    <div className="sales-chart-wrap">
      <svg className="sales-chart" viewBox="0 0 760 260" role="img" aria-label="Evolução diária do faturamento no período selecionado" aria-describedby="sales-chart-data">
        <title>Evolução diária do faturamento</title>
        {[0, 0.5, 1].map((ratio) => {
          const y = top + chartHeight * ratio;
          return (
            <g key={ratio}>
              <line x1={left} x2={left + chartWidth} y1={y} y2={y} className="chart-grid-line" />
              <text x={left - 10} y={y + 4} textAnchor="end" className="chart-axis-label">{compactMoney.format(max * (1 - ratio))}</text>
            </g>
          );
        })}
        {points.length > 0 && <path d={area} className="chart-area" />}
        {points.length > 1 && <polyline points={line} className="chart-line" />}
        {points.map((point) => (
          <circle key={point.key} cx={point.x} cy={point.y} r={point.total > 0 ? 4 : 2.5} className={point.total > 0 ? "chart-point" : "chart-point chart-point-zero"}>
            <title>{point.label}: {money.format(point.total)}</title>
          </circle>
        ))}
        {labelIndexes.map((index) => points[index] && (
          <text key={points[index].key} x={points[index].x} y="245" textAnchor={index === 0 ? "start" : index === days.length - 1 ? "end" : "middle"} className="chart-date-label">
            {points[index].label}
          </text>
        ))}
      </svg>
      <span className="chart-scroll-note">Deslize para ver todo o período →</span>
      <ul className="sr-only" id="sales-chart-data">
        {days.map((day) => <li key={day.key}>{day.label}: {money.format(day.total)}</li>)}
      </ul>
      {days.every((day) => day.total === 0) && <p className="chart-empty-note">Nenhuma venda registrada neste período.</p>}
    </div>
  );
}

function InventoryChart({ items }: { items: InventoryItem[] }) {
  const ranked = [...items].sort((a, b) => Math.abs(b.available_quantity) - Math.abs(a.available_quantity)).slice(0, 6);
  const max = Math.max(...ranked.map((item) => Math.abs(item.available_quantity)), 1);

  if (ranked.length === 0) return <div className="chart-blank">Nenhum produto para exibir.</div>;

  return (
    <div className="inventory-bars">
      <span className="sr-only">Saldo atual dos seis produtos com maiores saldos em módulo.</span>
      {ranked.map((item) => (
        <div className="inventory-bar-row" key={item.product_id}>
          <div className="inventory-bar-meta"><strong>{item.product_name}</strong><span>{item.product_sku}</span></div>
          <div className="inventory-bar-track" aria-hidden="true"><span className={item.available_quantity < 0 ? "is-negative" : ""} style={{ width: `${Math.max(Math.abs(item.available_quantity) / max * 100, item.available_quantity === 0 ? 1 : 4)}%` }} /></div>
          <strong className={item.available_quantity < 0 ? "inventory-bar-value negative-number" : "inventory-bar-value"}>{integer.format(item.available_quantity)}</strong>
        </div>
      ))}
    </div>
  );
}

type CategorySlice = { label: string; value: number; color: string };

function CategoryChart({ slices, total }: { slices: CategorySlice[]; total: number }) {
  let offset = 0;
  return (
    <div className="category-chart-layout">
      <svg className="category-donut" viewBox="0 0 120 120" role="img" aria-label={`Distribuição de ${total} produtos por categoria`}>
        <title>Produtos por categoria</title>
        <circle cx="60" cy="60" r="42" className="donut-base" />
        {slices.map((slice) => {
          const percentage = total ? slice.value / total * 100 : 0;
          const currentOffset = offset;
          offset += percentage;
          return <circle key={slice.label} cx="60" cy="60" r="42" pathLength="100" className="donut-slice" stroke={slice.color} strokeDasharray={`${percentage} ${100 - percentage}`} strokeDashoffset={-currentOffset} />;
        })}
        <text x="60" y="57" textAnchor="middle" className="donut-total">{integer.format(total)}</text>
        <text x="60" y="71" textAnchor="middle" className="donut-caption">PRODUTOS</text>
      </svg>
      <div className="category-legend">
        {slices.length === 0 ? <span className="chart-blank">Nenhuma categoria para exibir.</span> : slices.map((slice) => (
          <div className="category-legend-row" key={slice.label}>
            <i style={{ backgroundColor: slice.color }} />
            <span>{slice.label}</span>
            <strong>{slice.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>(7);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [username, setUsername] = useState("");

  useEffect(() => {
    let active = true;
    getCurrentUser().then((user) => {
      if (!active) return;
      setUsername(user.username);
      setAuthorized(true);
    }).catch(() => { if (active) router.replace("/login"); });
    return () => { active = false; };
  }, [router]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [productData, saleData, inventoryData] = await Promise.all([getProducts(), getSales(), getInventory()]);
      setProducts(productData);
      setSales(saleData);
      setInventory(inventoryData);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar o dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (authorized) void loadDashboard(); }, [authorized, loadDashboard]);

  const periodData = useMemo(() => {
    const today = startOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const firstDay = new Date(today);
    firstDay.setDate(firstDay.getDate() - (period - 1));
    const filtered = sales.filter((sale) => {
      const createdAt = new Date(sale.created_at);
      return createdAt >= firstDay && createdAt < tomorrow;
    });
    const totals = new Map<string, number>();
    filtered.forEach((sale) => {
      const key = localDayKey(new Date(sale.created_at));
      totals.set(key, (totals.get(key) ?? 0) + Number(sale.total));
    });
    const days = Array.from({ length: period }, (_, index) => {
      const date = new Date(firstDay);
      date.setDate(firstDay.getDate() + index);
      const key = localDayKey(date);
      return { date, key, label: period === 1 ? "Hoje" : shortDate.format(date).replace(" de ", " "), total: totals.get(key) ?? 0 };
    });
    const revenue = filtered.reduce((sum, sale) => sum + Number(sale.total), 0);
    const units = filtered.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
    const soldByProduct = new Map<number | string, { name: string; quantity: number }>();
    filtered.forEach((sale) => sale.items.forEach((item) => {
      const key = item.product_id ?? `${item.product_sku}:${item.product_name}`;
      const current = soldByProduct.get(key);
      soldByProduct.set(key, { name: item.product_name, quantity: (current?.quantity ?? 0) + item.quantity });
    }));
    const topProduct = [...soldByProduct.values()].sort((a, b) => b.quantity - a.quantity)[0];
    return { filtered, days, revenue, units, topProduct };
  }, [period, sales]);

  const categorySlices = useMemo(() => {
    const colors = ["#294a3e", "#c49342", "#6f8276", "#9b5d4f", "#536e7b", "#aaa06e"];
    const counts = new Map<string, number>();
    products.forEach((product) => {
      const category = product.category.trim() || "Sem categoria";
      counts.set(category, (counts.get(category) ?? 0) + 1);
    });
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const primary = sorted.slice(0, 5);
    const other = sorted.slice(5).reduce((sum, [, count]) => sum + count, 0);
    if (other) primary.push(["Outras", other]);
    return primary.map(([label, value], index) => ({ label, value, color: colors[index] }));
  }, [products]);

  const available = inventory.reduce((sum, item) => sum + item.available_quantity, 0);
  const negative = inventory.filter((item) => item.available_quantity < 0).length;
  const outOfStock = inventory.filter((item) => item.available_quantity === 0).length;
  const averageTicket = periodData.filtered.length ? periodData.revenue / periodData.filtered.length : 0;
  const periodLabel = period === 1 ? "hoje" : `últimos ${period} dias`;

  async function signOut() { try { await logout(); } finally { router.replace("/login"); } }
  if (!authorized) return <main className="auth-loading" aria-live="polite">Validando sessão…</main>;

  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard" aria-label="Armazém, dashboard"><span className="brand-mark"><DashboardMark /></span><span className="brand-name">armazém<span>.</span></span></Link>
        <div className="side-section-label">GESTÃO</div>
        <Link className="nav-item active" href="/dashboard" aria-current="page"><ChartGlyph /> Dashboard</Link>
        <Link className="nav-item" href="/">Produtos</Link>
        <Link className="nav-item" href="/categories">Categorias</Link>
        <Link className="nav-item" href="/suppliers">Fornecedores</Link>
        <Link className="nav-item" href="/sales">Vendas</Link>
        <Link className="nav-item" href="/purchase-orders">Pedidos</Link>
        <Link className="nav-item" href="/inventory">Estoque</Link>
        <Link className="nav-item" href="/replenishment">Agente</Link>
        <div className="side-note"><span className="status-dot" /><span>Indicadores atualizados</span></div>
        <div className="sidebar-bottom"><span className="sidebar-rule" /><span className="sidebar-caption">CENTRAL DE INDICADORES</span><span className="sidebar-edition">PAINEL DE OPERAÇÕES&nbsp; / &nbsp;00</span></div>
      </aside>

      <main className="main-content" id="dashboard">
        <header className="topbar"><div className="breadcrumb"><span>ESTOQUE</span><span className="crumb-slash">/</span><strong>Dashboard</strong></div><div className="topbar-right"><AgentChat /><span className="topbar-date">VISÃO&nbsp; · &nbsp;BR</span><span className="user-name">{username}</span><button className="logout-button" onClick={() => void signOut()}>Sair</button></div></header>
        <div className="content-wrap dashboard-content">
          <section className="dashboard-heading">
            <div><h1>Visão geral</h1><p className="heading-copy">Estoque, vendas e composição do catálogo em um só lugar.</p></div>
            <div className="period-control" role="group" aria-label="Filtrar indicadores por período">
              {([1, 7, 30] as Period[]).map((value) => <button key={value} type="button" className={period === value ? "active" : ""} aria-pressed={period === value} onClick={() => setPeriod(value)}>{value === 1 ? "Hoje" : `${value} dias`}</button>)}
            </div>
          </section>

          {loading ? <div className="dashboard-state" aria-live="polite"><span className="loader" />Atualizando indicadores…</div> : error ? <div className="dashboard-state state-error"><strong>Não foi possível carregar os indicadores.</strong><span>{error}</span><button className="text-button" onClick={() => void loadDashboard()}>Tentar novamente ↗</button></div> : <>
            <section className="dashboard-ledger" aria-label={`Resumo dos ${periodLabel}`}>
              <div className="ledger-primary"><span>FATURAMENTO · {periodLabel.toUpperCase()}</span><strong>{money.format(periodData.revenue)}</strong><small>{periodData.filtered.length} {periodData.filtered.length === 1 ? "venda" : "vendas"} registrada{periodData.filtered.length === 1 ? "" : "s"}</small></div>
              <div className="ledger-cell"><span>ITENS VENDIDOS</span><strong>{integer.format(periodData.units)}</strong><small>no período</small></div>
              <div className="ledger-cell"><span>ESTOQUE ATUAL</span><strong className={available < 0 ? "negative-number" : ""}>{integer.format(available)}</strong><small>unidades disponíveis</small></div>
              <div className="ledger-cell"><span>PRODUTOS</span><strong>{integer.format(products.length)}</strong><small>no catálogo</small></div>
            </section>

            <div className="dashboard-grid">
              <section className="dashboard-panel sales-panel" aria-labelledby="sales-chart-title">
                <div className="dashboard-panel-head"><div><span>VENDAS · {periodLabel.toUpperCase()}</span><h2 id="sales-chart-title">Evolução do faturamento</h2></div><strong>{money.format(periodData.revenue)}</strong></div>
                <SalesChart days={periodData.days} />
              </section>

              <section className="dashboard-panel inventory-panel" aria-labelledby="inventory-chart-title">
                <div className="dashboard-panel-head"><div><span>POSIÇÃO ATUAL</span><h2 id="inventory-chart-title">Estoque por produto</h2></div><Link href="/inventory">Ver estoque ↗</Link></div>
                <InventoryChart items={inventory} />
                <p className="chart-footnote">Exibe os 6 maiores saldos em módulo, incluindo valores negativos.</p>
              </section>

              <section className="dashboard-panel category-panel" aria-labelledby="category-chart-title">
                <div className="dashboard-panel-head"><div><span>CATÁLOGO ATUAL</span><h2 id="category-chart-title">Produtos por categoria</h2></div><Link href="/categories">Ver categorias ↗</Link></div>
                <CategoryChart slices={categorySlices} total={products.length} />
              </section>

              <section className="dashboard-signals" aria-labelledby="signals-title">
                <div className="signals-title"><span>LEITURA OPERACIONAL</span><h2 id="signals-title">Sinais do período</h2></div>
                <div className="signal-row"><span>01</span><div><strong>Ticket médio</strong><small>Média por venda em {periodLabel}</small></div><b>{money.format(averageTicket)}</b></div>
                <div className="signal-row"><span>02</span><div><strong>Produto mais vendido</strong><small>{periodData.topProduct ? `${periodData.topProduct.quantity} unidades no período` : "Sem movimentação no período"}</small></div><b>{periodData.topProduct?.name ?? "—"}</b></div>
                <div className="signal-row"><span>03</span><div><strong>Atenção ao estoque</strong><small>{negative} com saldo negativo · {outOfStock} sem saldo</small></div><b className={negative + outOfStock > 0 ? "negative-number" : ""}>{negative + outOfStock}</b></div>
              </section>
            </div>
          </>}

          <footer className="page-footer"><span>ARMAZÉM&nbsp; / &nbsp;DASHBOARD OPERACIONAL</span><span>ATUALIZAÇÃO EM TEMPO REAL</span></footer>
        </div>
      </main>
    </div>
  );
}
