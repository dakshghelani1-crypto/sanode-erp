'use client';

import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Product } from '@/lib/api';
import { AppShell } from './app-shell';

const format = new Intl.NumberFormat('en-IN');

export function InventoryWorkspace({ products, source }: { products: Product[]; source: 'live' | 'preview' }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => { const term = query.toLowerCase().trim(); return !term ? products : products.filter(product => product.name.toLowerCase().includes(term) || product.code.toLowerCase().includes(term) || product.batches.some(batch => batch.batchNumber.toLowerCase().includes(term))); }, [products, query]);
  return <AppShell title="Inventory" actions={<label className="search"><Search size={17}/><input aria-label="Search product or batch" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search product or batch" /></label>}>
    <div className={source === 'live' ? 'connection connection-live' : 'connection'}><span className="connection-dot" />{source === 'live' ? 'Live stock balances from the warehouse ledger' : 'Preview data'}</div>
    <section className="panel inventory-page-panel"><div className="panel-heading"><div><p className="eyebrow">Master inventory</p><h2>Product and batch position</h2></div><span className="result-count">{filtered.length} products</span></div>
      <div className="inventory-cards">{filtered.map(product => <article className="inventory-card" key={product.id}><header><div><strong>{product.name}</strong><small>{product.code} · {product.stripsPerBox} strips / box</small></div><span>{format.format(product.availableStrips)} <small>strips</small></span></header><div className="batch-list">{product.batches.map(batch => <div key={batch.id}><strong>{batch.batchNumber}</strong><span>Exp. {new Date(batch.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span><span>{format.format(batch.availableStrips)} strips</span></div>)}</div></article>)}</div>
      {!filtered.length && <div className="empty-state">No product or batch matches “{query}”.</div>}
    </section>
  </AppShell>;
}
