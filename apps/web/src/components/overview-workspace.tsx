'use client';

import { Link2, PackagePlus, Search, ShieldCheck, Stethoscope } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { LedgerEntry, Product } from '@/lib/api';
import { AppShell } from './app-shell';
import { QuickActions } from './quick-actions';

const format = new Intl.NumberFormat('en-IN');

export function OverviewWorkspace({ products, activity, source }: { products: Product[]; activity: LedgerEntry[]; source: 'live' | 'preview' }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? products.filter(product => product.name.toLowerCase().includes(term) || product.code.toLowerCase().includes(term) || product.batches.some(batch => batch.batchNumber.toLowerCase().includes(term))) : products;
  }, [products, query]);
  const totalStrips = products.reduce((sum, product) => sum + product.availableStrips, 0);
  const activeBatches = products.reduce((sum, product) => sum + product.batches.length, 0);
  const lowStock = products.filter(product => product.availableStrips <= product.reorderLevelStrips).length;

  return <AppShell title="Today’s operations" actions={<label className="search"><Search size={17}/><input aria-label="Search product or batch" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search product or batch" /></label>}>
    <div className={source === 'live' ? 'connection connection-live' : 'connection'}><span className="connection-dot" />{source === 'live' ? 'Live inventory data — changes are saved immediately' : 'Preview data — connect the API after the first database migration'}</div>
    <section className="hero-card"><div><p className="eyebrow hero-eyebrow">Start today’s work</p><h2>Move stock confidently, without manual batch decisions.</h2><p>Receive purchases, dispatch customer orders, and record samples. Sanode automatically recommends the earliest-expiring valid batch.</p></div><QuickActions products={products} /></section>
    <section className="metrics" aria-label="Inventory summary"><article><span className="metric-label">Available stock</span><strong>{format.format(totalStrips)}</strong><span>strips across all products</span></article><article><span className="metric-label">Active batches</span><strong>{activeBatches}</strong><span>eligible for FEFO dispatch</span></article><article><span className="metric-label">Needs attention</span><strong>{lowStock}</strong><span>product{lowStock === 1 ? '' : 's'} at reorder level</span></article></section>
    <section className="content-grid"><article className="panel product-panel"><div className="panel-heading"><div><p className="eyebrow">Master inventory</p><h2>Products and batch availability</h2></div><span className="result-count">{filtered.length} shown</span></div><div className="product-table" role="table" aria-label="Master product inventory"><div className="table-head" role="row"><span>Product</span><span>Available</span><span>Batch position</span><span>Status</span></div>{filtered.map(product => { const nextBatch = product.batches[0]; const isLow = product.availableStrips <= product.reorderLevelStrips; return <div className="table-row" role="row" key={product.id}><span><strong>{product.name}</strong><small>{product.code} · {product.stripsPerBox} strips per box</small></span><span><strong>{format.format(product.availableStrips)}</strong><small>strips</small></span><span>{nextBatch ? <><strong>{nextBatch.batchNumber}</strong><small>FEFO first · exp. {new Date(nextBatch.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</small></> : <small>No eligible batch</small>}</span><span className={isLow ? 'state state-warning' : 'state state-success'}>{isLow ? 'Reorder' : 'Healthy'}</span></div>; })}{!filtered.length && <div className="empty-state">No product or batch matches “{query}”.</div>}</div></article>
      <aside className="panel attention-panel"><div className="panel-heading"><div><p className="eyebrow">Action queue</p><h2>What needs attention</h2></div></div><div className="attention-item"><span className="icon-wrap violet"><ShieldCheck size={18}/></span><div><strong>{lowStock ? `${lowStock} product${lowStock === 1 ? '' : 's'} needs stock` : 'Stock levels are healthy'}</strong><p>{lowStock ? 'Receive stock before the next dispatch.' : 'No product is currently below its reorder level.'}</p></div></div><div className="attention-item"><span className="icon-wrap amber"><PackagePlus size={18}/></span><div><strong>Trade schemes stay accurate</strong><p>Free strips are calculated and deducted separately from billed stock.</p></div></div><div className="attention-item"><span className="icon-wrap blue"><Stethoscope size={18}/></span><div><strong>Samples stay separate</strong><p>MR detailing deductions never inflate commercial sales.</p></div></div><div className="attention-item"><span className="icon-wrap violet"><Link2 size={18}/></span><div><strong>Full batch traceability</strong><p>Open Inventory to review batch balances and expiry dates.</p></div></div></aside>
    </section>
  </AppShell>;
}
