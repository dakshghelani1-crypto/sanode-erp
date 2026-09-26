'use client';

import { ArrowDownToLine, ClipboardList, PackagePlus, Search, ShieldCheck, Stethoscope, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { LedgerEntry, Product } from '@/lib/api';
import { QuickActions } from './quick-actions';

const format = new Intl.NumberFormat('en-IN');
const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const movementNames: Record<string, string> = { GOODS_RECEIPT: 'Stock received', COMMERCIAL_DISPATCH: 'Commercial dispatch', FREE_GOODS_DISPATCH: 'Free goods', MR_SAMPLE_DISPATCH: 'MR sample', CUSTOMER_RETURN: 'Customer return', DAMAGE_WRITE_OFF: 'Damage write-off', EXPIRY_QUARANTINE: 'Expiry quarantine', ADJUSTMENT_IN: 'Stock adjustment in', ADJUSTMENT_OUT: 'Stock adjustment out' };

function StockState({ product }: { product: Product }) {
  const isLow = product.availableStrips <= product.reorderLevelStrips;
  return <span className={isLow ? 'state state-warning' : 'state state-success'}>{isLow ? 'Reorder' : 'Healthy'}</span>;
}

function Movement({ entry }: { entry: LedgerEntry }) {
  const outgoing = entry.quantityStrips < 0;
  return <div className="movement-item"><span className={outgoing ? 'movement-amount movement-out' : 'movement-amount movement-in'}>{outgoing ? '−' : '+'}{format.format(Math.abs(entry.quantityStrips))}</span><div><strong>{movementNames[entry.type] ?? entry.type}</strong><p>{entry.product.name} · {entry.batch?.batchNumber ?? 'Product level'}{entry.createdBy ? ` · ${entry.createdBy.name}` : ''}</p></div><time>{dateFormat.format(new Date(entry.createdAt))}</time></div>;
}

export function OperationsShell({ products, activity, source }: { products: Product[]; activity: LedgerEntry[]; source: 'live' | 'preview' }) {
  const [query, setQuery] = useState('');
  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return products;
    return products.filter(product => product.name.toLowerCase().includes(normalized) || product.code.toLowerCase().includes(normalized) || product.batches.some(batch => batch.batchNumber.toLowerCase().includes(normalized)));
  }, [products, query]);
  const totalStrips = products.reduce((sum, product) => sum + product.availableStrips, 0);
  const batchCount = products.reduce((sum, product) => sum + product.batches.length, 0);
  const lowStock = products.filter(product => product.availableStrips <= product.reorderLevelStrips).length;

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">S</div><span>Sanode<span className="brand-muted">Ops</span></span></div>
      <nav aria-label="Main navigation"><a className="nav-link active" href="#overview"><ClipboardList size={18}/><span>Overview</span></a><a className="nav-link" href="#inventory"><Truck size={18}/><span>Inventory</span></a><a className="nav-link" href="#dispatch"><ArrowDownToLine size={18}/><span>Dispatch</span></a><a className="nav-link" href="#activity"><Stethoscope size={18}/><span>Activity</span></a></nav>
      <div className="sidebar-note"><ShieldCheck size={18}/><span>Every dispatch is batch-traceable and allocation is FEFO controlled.</span></div>
    </aside>
    <section className="workspace" id="overview">
      <header className="topbar"><div><p className="eyebrow">Warehouse control</p><h1>Today’s operations</h1></div><div className="topbar-actions"><label className="search"><Search size={17}/><input aria-label="Search product or batch" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search product or batch" /></label><a className="profile" href="/login" aria-label="Account">DG</a></div></header>
      <div className={source === 'live' ? 'connection connection-live' : 'connection'}><span className="connection-dot" />{source === 'live' ? 'Live inventory data — changes are saved immediately' : 'Preview data — connect the API after the first database migration'}</div>
      <section className="hero-card" id="dispatch"><div><p className="eyebrow hero-eyebrow">Start today’s work</p><h2>Move stock confidently, without manual batch decisions.</h2><p>Receive purchases, dispatch customer orders, and record samples. The system chooses the earliest-expiring valid batch automatically.</p></div><QuickActions products={products} /></section>
      <section className="metrics" aria-label="Inventory summary"><article><span className="metric-label">Available stock</span><strong>{format.format(totalStrips)}</strong><span>strips across all products</span></article><article><span className="metric-label">Active batches</span><strong>{batchCount}</strong><span>eligible for FEFO dispatch</span></article><article><span className="metric-label">Needs attention</span><strong>{lowStock}</strong><span>product{lowStock === 1 ? '' : 's'} at reorder level</span></article></section>
      <section className="content-grid" id="inventory"><article className="panel product-panel"><div className="panel-heading"><div><p className="eyebrow">Master inventory</p><h2>Products and batch availability</h2></div><span className="result-count">{filteredProducts.length} shown</span></div><div className="product-table" role="table" aria-label="Master product inventory"><div className="table-head" role="row"><span>Product</span><span>Available</span><span>Batch position</span><span>Status</span></div>{filteredProducts.map(product => { const nextBatch = product.batches[0]; return <div className="table-row" role="row" key={product.id}><span><strong>{product.name}</strong><small>{product.code} · {product.stripsPerBox} strips per box</small></span><span><strong>{format.format(product.availableStrips)}</strong><small>strips</small></span><span>{nextBatch ? <><strong>{nextBatch.batchNumber}</strong><small>FEFO first · exp. {new Date(nextBatch.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</small></> : <small>No eligible batch</small>}</span><StockState product={product}/></div>; })}{!filteredProducts.length && <div className="empty-state">No product or batch matches “{query}”.</div>}</div></article><aside className="panel attention-panel"><div className="panel-heading"><div><p className="eyebrow">Action queue</p><h2>What needs attention</h2></div></div>{lowStock ? <div className="attention-item"><span className="icon-wrap amber"><PackagePlus size={18}/></span><div><strong>{lowStock} product{lowStock === 1 ? '' : 's'} at reorder level</strong><p>Receive stock before the next dispatch.</p></div></div> : <div className="attention-item"><span className="icon-wrap violet"><ShieldCheck size={18}/></span><div><strong>Stock levels are healthy</strong><p>No product is currently below its reorder level.</p></div></div>}<div className="attention-item"><span className="icon-wrap amber"><PackagePlus size={18}/></span><div><strong>Trade schemes are automatic</strong><p>Free strips are deducted separately from billed stock.</p></div></div><div className="attention-item"><span className="icon-wrap blue"><Stethoscope size={18}/></span><div><strong>MR samples stay separate</strong><p>Promotional deductions never inflate commercial sales.</p></div></div></aside></section>
      <section className="panel activity-panel" id="activity"><div className="panel-heading"><div><p className="eyebrow">Audit trail</p><h2>Recent stock movements</h2></div><span className="result-count">{activity.length} entries</span></div>{activity.length ? <div className="movement-list">{activity.map(entry => <Movement key={entry.id} entry={entry} />)}</div> : <div className="empty-state">No movements have been recorded yet. Receive stock, dispatch an order, or log an MR sample to begin the audit trail.</div>}</section>
    </section>
  </main>;
}
