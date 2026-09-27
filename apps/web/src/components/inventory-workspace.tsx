'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  Box,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Layers,
  Package,
  PackagePlus,
  Search,
  Sparkles,
  Tag
} from 'lucide-react';
import type { Product } from '@/lib/api';
import { AppShell } from './app-shell';
import { ReceiveStockModal } from './receive-stock-modal';
import { DispatchOrderModal } from './dispatch-order-modal';

const numberFormat = new Intl.NumberFormat('en-IN');

function formatMonthsRemaining(expiryDateStr: string) {
  const expiry = new Date(expiryDateStr);
  const now = new Date();
  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: 'Expired', isUrgent: true };
  const diffMonths = Math.ceil(diffDays / 30);
  if (diffMonths <= 3) return { label: `Exp. in ${diffMonths} mo (${diffDays}d)`, isUrgent: true };
  if (diffMonths <= 6) return { label: `Exp. in ${diffMonths} months`, isWarning: true };
  return { label: `Exp. in ${diffMonths} months`, isNormal: true };
}

export function InventoryWorkspace({
  products,
  source
}: {
  products: Product[];
  source: 'live' | 'preview';
}) {
  const [query, setQuery] = useState('');
  const [selectedProductIdForInward, setSelectedProductIdForInward] = useState<string | null>(null);
  const [selectedProductIdForDispatch, setSelectedProductIdForDispatch] = useState<string | null>(null);
  const [isGeneralReceiveOpen, setIsGeneralReceiveOpen] = useState(false);
  const [isGeneralDispatchOpen, setIsGeneralDispatchOpen] = useState(false);

  // Expanded products state (all expanded by default for rapid operational visibility)
  const [expandedProductIds, setExpandedProductIds] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const p of products) {
      initial[p.id] = true;
    }
    return initial;
  });

  function toggleProductExpand(productId: string) {
    setExpandedProductIds(prev => ({
      ...prev,
      [productId]: !prev[productId]
    }));
  }

  function expandAll() {
    const all: Record<string, boolean> = {};
    for (const p of products) all[p.id] = true;
    setExpandedProductIds(all);
  }

  function collapseAll() {
    setExpandedProductIds({});
  }

  // Filter products by query
  const filtered = useMemo(() => {
    const term = query.toLowerCase().trim();
    if (!term) return products;
    return products.filter(
      p =>
        p.name.toLowerCase().includes(term) ||
        p.code.toLowerCase().includes(term) ||
        (p.composition && p.composition.toLowerCase().includes(term)) ||
        p.batches.some(
          b =>
            b.batchNumber.toLowerCase().includes(term) ||
            (b.supplierRef && b.supplierRef.toLowerCase().includes(term)) ||
            (b.supplierName && b.supplierName.toLowerCase().includes(term))
        )
    );
  }, [products, query]);

  // Warehouse-wide aggregations
  const warehouseStats = useMemo(() => {
    let totalStrips = 0;
    let totalBoxes = 0;
    let totalBatches = 0;
    let lowStockCount = 0;

    for (const p of products) {
      totalStrips += p.availableStrips;
      const stripsPerBox = p.stripsPerBox || 10;
      totalBoxes += Math.floor(p.availableStrips / stripsPerBox);
      totalBatches += p.batches.length;
      if (p.availableStrips <= p.reorderLevelStrips) {
        lowStockCount++;
      }
    }

    return { totalStrips, totalBoxes, totalBatches, lowStockCount };
  }, [products]);

  return (
    <AppShell
      title="Product-Level Batch Inventory"
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setIsGeneralReceiveOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
              color: '#fff',
              border: 'none',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(79, 70, 229, 0.25)'
            }}
          >
            <PackagePlus size={16} />
            Receive Stock (GRN)
          </button>
          <button
            onClick={() => setIsGeneralDispatchOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#ffffff',
              color: '#1e293b',
              border: '1px solid var(--line)',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <ArrowDownToLine size={16} />
            Dispatch Order
          </button>
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Search product or batch"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search product, SKU, batch or supplier…"
            />
          </label>
        </div>
      }
    >
      <div className={source === 'live' ? 'connection connection-live' : 'connection'}>
        <span className="connection-dot" />
        {source === 'live'
          ? 'Live synchronized warehouse ledger — master totals update atomically with child batch movements'
          : 'Preview data'}
      </div>

      {/* Warehouse Summary Ribbon */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '12px',
          marginBottom: '20px'
        }}
      >
        <div
          style={{
            background: 'var(--panel)',
            padding: '14px 18px',
            borderRadius: '10px',
            border: '1px solid var(--line)'
          }}
        >
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
            Active SKUs / Products
          </span>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: '4px 0 2px' }}>
            {products.length}
          </div>
          <span style={{ fontSize: '12px', color: '#059669', fontWeight: 600 }}>
            Synchronized master identities
          </span>
        </div>

        <div
          style={{
            background: 'var(--panel)',
            padding: '14px 18px',
            borderRadius: '10px',
            border: '1px solid var(--line)'
          }}
        >
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
            Aggregated Boxes in Stock
          </span>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#4f46e5', margin: '4px 0 2px' }}>
            {numberFormat.format(warehouseStats.totalBoxes)} <small style={{ fontSize: '14px', fontWeight: 600 }}>boxes</small>
          </div>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            {numberFormat.format(warehouseStats.totalStrips)} atomic strips
          </span>
        </div>

        <div
          style={{
            background: 'var(--panel)',
            padding: '14px 18px',
            borderRadius: '10px',
            border: '1px solid var(--line)'
          }}
        >
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
            Active Batches Tracked
          </span>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: '4px 0 2px' }}>
            {warehouseStats.totalBatches} <small style={{ fontSize: '14px', fontWeight: 600 }}>batches</small>
          </div>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            Enforced by FEFO dispatch
          </span>
        </div>

        <div
          style={{
            background: 'var(--panel)',
            padding: '14px 18px',
            borderRadius: '10px',
            border: '1px solid var(--line)'
          }}
        >
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
            Inventory Stratification
          </span>
          <div style={{ fontSize: '24px', fontWeight: 800, color: warehouseStats.lowStockCount > 0 ? '#b45309' : '#059669', margin: '4px 0 2px' }}>
            {warehouseStats.lowStockCount === 0 ? 'Optimal' : `${warehouseStats.lowStockCount} Reorder`}
          </div>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            Old Stock vs New Stock mapped
          </span>
        </div>
      </section>

      {/* Main Product-Wise Ledgers Section */}
      <section className="panel" style={{ padding: '20px 24px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div>
            <p className="eyebrow" style={{ margin: '0 0 2px' }}>
              Granular Stock Stratification
            </p>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>
              Product-Wise Ledgers & Batch Hierarchies
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={expandAll}
              style={{
                background: 'none',
                border: '1px solid var(--line)',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                color: '#475569'
              }}
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={collapseAll}
              style={{
                background: 'none',
                border: '1px solid var(--line)',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                color: '#475569'
              }}
            >
              Collapse All
            </button>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#4f46e5', marginLeft: '6px' }}>
              {filtered.length} products
            </span>
          </div>
        </div>

        {/* Product Cards List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {filtered.map(product => {
            const isExpanded = !!expandedProductIds[product.id];
            const stripsPerBox = product.stripsPerBox || 10;
            const totalBoxes = Math.floor(product.availableStrips / stripsPerBox);
            const looseStrips = product.availableStrips % stripsPerBox;
            const isLowStock = product.availableStrips <= product.reorderLevelStrips;
            const nextBatch = product.batches[0]; // Earliest expiry = FEFO 1st

            return (
              <article
                key={product.id}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  background: '#ffffff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  overflow: 'hidden',
                  transition: 'box-shadow 0.15s ease'
                }}
              >
                {/* 1. MASTER PRODUCT VIEW (AGGREGATED STOCK) */}
                <div
                  style={{
                    padding: '16px 20px',
                    background: isExpanded ? '#f8fafc' : '#ffffff',
                    borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '14px',
                    cursor: 'pointer'
                  }}
                  onClick={() => toggleProductExpand(product.id)}
                >
                  {/* Left: Product Identity */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: '280px' }}>
                    <button
                      type="button"
                      aria-label="Toggle batch breakdown"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#64748b',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'grid',
                        placeItems: 'center'
                      }}
                    >
                      {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </button>

                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        background: '#e0e7ff',
                        color: '#4338ca',
                        display: 'grid',
                        placeItems: 'center',
                        fontWeight: 800,
                        fontSize: '15px'
                      }}
                    >
                      <Box size={22} />
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                          {product.name}
                        </h3>
                        <span
                          style={{
                            padding: '2px 8px',
                            background: '#f1f5f9',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: '#475569',
                            fontFamily: 'monospace'
                          }}
                        >
                          {product.code}
                        </span>
                      </div>
                      <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                        {product.composition || 'Pharmaceutical Formulation'} ·{' '}
                        <strong>{stripsPerBox} strips / box</strong>
                      </p>
                    </div>
                  </div>

                  {/* Middle: Aggregated Master Stock */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                        {numberFormat.format(totalBoxes)}{' '}
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>boxes</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        {numberFormat.format(product.availableStrips)} total strips
                        {looseStrips > 0 && ` (${looseStrips} loose)`}
                      </div>
                    </div>

                    {/* Batch Count & FEFO Pill */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '3px 9px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: product.batches.length > 0 ? '#e0e7ff' : '#f1f5f9',
                          color: product.batches.length > 0 ? '#3730a3' : '#64748b'
                        }}
                      >
                        <Layers size={13} />
                        {product.batches.length}{' '}
                        {product.batches.length === 1 ? 'Active Batch' : 'Active Batches'}
                      </span>

                      {nextBatch && (
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#059669',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Clock size={12} />
                          FEFO 1st: {nextBatch.batchNumber}
                        </span>
                      )}
                    </div>

                    {/* Health Status */}
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '11px',
                        fontWeight: 700,
                        background: isLowStock ? '#fef3c7' : '#ecfdf5',
                        color: isLowStock ? '#b45309' : '#065f46'
                      }}
                    >
                      {isLowStock ? 'Reorder Level' : 'Healthy Stock'}
                    </span>
                  </div>

                  {/* Right: Quick Inward / Dispatch Actions */}
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      title="Receive / Inward new batch for this product"
                      onClick={() => setSelectedProductIdForInward(product.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        background: '#f0fdf4',
                        color: '#166534',
                        border: '1px solid #bbf7d0',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      <PackagePlus size={14} />
                      + Inward Batch
                    </button>

                    <button
                      type="button"
                      title="Dispatch order for this product"
                      disabled={product.availableStrips === 0}
                      onClick={() => setSelectedProductIdForDispatch(product.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        background: product.availableStrips > 0 ? '#ffffff' : '#f8fafc',
                        color: product.availableStrips > 0 ? '#1e293b' : '#94a3b8',
                        border: '1px solid #cbd5e1',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: product.availableStrips > 0 ? 'pointer' : 'not-allowed'
                      }}
                    >
                      <ArrowDownToLine size={14} />
                      Dispatch
                    </button>
                  </div>
                </div>

                {/* 2. BATCH-LEVEL DRILLDOWN (OLD STOCK VS. NEW STOCK STRATIFICATION) */}
                {isExpanded && (
                  <div style={{ padding: '16px 20px', background: '#ffffff' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '12px'
                      }}
                    >
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color: '#64748b'
                        }}
                      >
                        Batch Maturity Breakdown (Ordered by Expiry / FEFO Sequence)
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        FEFO auto-consumes stock from Batch 01 (Old Stock) first before drawing newer inventory.
                      </span>
                    </div>

                    {product.batches.length === 0 ? (
                      <div
                        style={{
                          padding: '16px',
                          textAlign: 'center',
                          background: '#f8fafc',
                          borderRadius: '8px',
                          border: '1px dashed #cbd5e1',
                          color: '#64748b',
                          fontSize: '13px'
                        }}
                      >
                        No active batches currently in warehouse for {product.name}. Click{' '}
                        <strong>+ Inward Batch</strong> to receive inventory.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {product.batches.map((batch, index) => {
                          const isOldStock = index === 0;
                          const batchBoxes = Math.floor(batch.availableStrips / stripsPerBox);
                          const batchLoose = batch.availableStrips % stripsPerBox;
                          const sharePercent =
                            product.availableStrips > 0
                              ? Math.round((batch.availableStrips / product.availableStrips) * 100)
                              : 0;
                          const expiryInfo = formatMonthsRemaining(batch.expiryDate);

                          return (
                            <div
                              key={batch.id}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '1.4fr 1.2fr 1.2fr 1.4fr 1fr',
                                alignItems: 'center',
                                padding: '10px 14px',
                                borderRadius: '8px',
                                border: isOldStock ? '1.5px solid #f59e0b' : '1px solid #e2e8f0',
                                background: isOldStock ? '#fffbeb' : '#f8fafc',
                                gap: '12px',
                                fontSize: '12px'
                              }}
                            >
                              {/* 1. Stratification Tag & Batch Number */}
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                  <span
                                    style={{
                                      padding: '2px 7px',
                                      borderRadius: '4px',
                                      fontSize: '10px',
                                      fontWeight: 800,
                                      textTransform: 'uppercase',
                                      background: isOldStock ? '#d97706' : '#4f46e5',
                                      color: '#ffffff'
                                    }}
                                  >
                                    {isOldStock ? 'Old Stock (FEFO 1st)' : `New Stock (Priority ${index + 1})`}
                                  </span>
                                  <strong style={{ fontSize: '13px', color: '#0f172a', fontFamily: 'monospace' }}>
                                    {batch.batchNumber}
                                  </strong>
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>
                                  {isOldStock
                                    ? '★ Consumed first on outgoing dispatches'
                                    : 'Preserved until earlier stock is exhausted'}
                                </div>
                              </div>

                              {/* 2. Inward Vendor & Reference */}
                              <div>
                                <div style={{ fontWeight: 600, color: '#334155' }}>
                                  {batch.supplierName || 'Manufacturing Direct'}
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>
                                  Ref: {batch.supplierRef || 'GRN-INWARD'}
                                </div>
                              </div>

                              {/* 3. Expiry Timeline & Aging */}
                              <div>
                                <div style={{ fontWeight: 700, color: '#0f172a' }}>
                                  {new Date(batch.expiryDate).toLocaleDateString('en-IN', {
                                    month: 'short',
                                    year: 'numeric'
                                  })}
                                </div>
                                <span
                                  style={{
                                    display: 'inline-block',
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    background: expiryInfo.isUrgent
                                      ? '#fee2e2'
                                      : expiryInfo.isWarning
                                      ? '#fef3c7'
                                      : '#e2e8f0',
                                    color: expiryInfo.isUrgent
                                      ? '#b91c1c'
                                      : expiryInfo.isWarning
                                      ? '#b45309'
                                      : '#475569'
                                  }}
                                >
                                  {expiryInfo.label}
                                </span>
                              </div>

                              {/* 4. Available Batch Balance */}
                              <div>
                                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                                  {numberFormat.format(batchBoxes)} boxes{' '}
                                  <span style={{ fontSize: '11px', fontWeight: 500, color: '#64748b' }}>
                                    ({numberFormat.format(batch.availableStrips)} strips)
                                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                  <div
                                    style={{
                                      flex: 1,
                                      height: '6px',
                                      background: '#e2e8f0',
                                      borderRadius: '3px',
                                      overflow: 'hidden'
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: `${sharePercent}%`,
                                        height: '100%',
                                        background: isOldStock ? '#f59e0b' : '#6366f1',
                                        borderRadius: '3px'
                                      }}
                                    />
                                  </div>
                                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>
                                    {sharePercent}%
                                  </span>
                                </div>
                              </div>

                              {/* 5. Inward Rate / MRP */}
                              <div style={{ textAlign: 'right' }}>
                                {batch.unitCostPaise ? (
                                  <div>
                                    <div style={{ fontSize: '11px', color: '#64748b' }}>Cost / Box:</div>
                                    <strong style={{ fontSize: '12px', color: '#0f172a' }}>
                                      ₹{(batch.unitCostPaise / 100).toFixed(2)}
                                    </strong>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Standard Base</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}

          {!filtered.length && (
            <div className="empty-state">
              No product or batch matches “{query}”.
            </div>
          )}
        </div>
      </section>

      {/* Receive Stock Modal (General or Pre-selected for specific product) */}
      <ReceiveStockModal
        isOpen={isGeneralReceiveOpen || !!selectedProductIdForInward}
        onClose={() => {
          setIsGeneralReceiveOpen(false);
          setSelectedProductIdForInward(null);
        }}
        initialProducts={products}
        defaultProductId={selectedProductIdForInward || undefined}
      />

      {/* Dispatch Order Modal (General or Pre-selected for specific product) */}
      <DispatchOrderModal
        isOpen={isGeneralDispatchOpen || !!selectedProductIdForDispatch}
        onClose={() => {
          setIsGeneralDispatchOpen(false);
          setSelectedProductIdForDispatch(null);
        }}
        products={products}
        defaultProductId={selectedProductIdForDispatch || undefined}
      />
    </AppShell>
  );
}
