'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  FileText,
  Layers,
  Package,
  PackageCheck,
  Plus,
  Receipt,
  Search,
  Sparkles,
  Tag,
  Trash2,
  TrendingUp,
  Truck,
  X
} from 'lucide-react';
import { API_BASE_URL, type Product } from '@/lib/api';

const apiUrl = API_BASE_URL;

function idempotencyKey() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

const currencyFormat = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2
});

const numberFormat = new Intl.NumberFormat('en-IN');

interface MiscExpense {
  id: string;
  label: string;
  amount: string;
}

export function ReceiveStockModal({
  isOpen,
  onClose,
  initialProducts,
  defaultProductId,
  onStockReceived
}: {
  isOpen: boolean;
  onClose: () => void;
  initialProducts: Product[];
  defaultProductId?: string;
  onStockReceived?: (product: Product, batchNumber: string) => void;
}) {
  const router = useRouter();
  const [productsList, setProductsList] = useState<Product[]>(initialProducts);
  const [selectedProductId, setSelectedProductId] = useState<string>(
    defaultProductId || initialProducts[0]?.id || ''
  );

  // Sync selectedProductId if defaultProductId or initialProducts change
  useEffect(() => {
    if (defaultProductId) {
      setSelectedProductId(defaultProductId);
    }
  }, [defaultProductId, isOpen]);

  const [productSearch, setProductSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Quick Add Product Form state
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductCode, setNewProductCode] = useState('');
  const [newStripsPerBox, setNewStripsPerBox] = useState('10');
  const [newComposition, setNewComposition] = useState('');
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [addProductError, setAddProductError] = useState('');

  // Form Field States – Section 2: Batch & Vendor
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [mfgDate, setMfgDate] = useState('');
  const [supplierRef, setSupplierRef] = useState('');
  const [supplierName, setSupplierName] = useState('');

  // Form Field States – Section 3: Purchase Cost
  const [receivedBoxes, setReceivedBoxes] = useState<string>('100');
  const [unitCost, setUnitCost] = useState<string>('50');
  const [gstRate, setGstRate] = useState<number>(18);
  const [miscExpenses, setMiscExpenses] = useState<MiscExpense[]>([]);
  const [showMiscExpenses, setShowMiscExpenses] = useState(false);

  // Submission & UI feedback
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successData, setSuccessData] = useState<{
    batchNumber: string;
    productName: string;
    totalStrips: number;
    landingCost: number;
  } | null>(null);

  // Selected product metadata
  const selectedProduct = useMemo(
    () => productsList.find(p => p.id === selectedProductId) ?? productsList[0],
    [productsList, selectedProductId]
  );

  // Filtered products for searchable dropdown
  const filteredProducts = useMemo(() => {
    const term = productSearch.toLowerCase().trim();
    if (!term) return productsList;
    return productsList.filter(
      p =>
        p.name.toLowerCase().includes(term) ||
        p.code.toLowerCase().includes(term) ||
        (p.composition && p.composition.toLowerCase().includes(term))
    );
  }, [productsList, productSearch]);

  // Real-time calculations
  const calc = useMemo(() => {
    const qty = Math.max(0, Number(receivedBoxes) || 0);
    const rate = Math.max(0, Number(unitCost) || 0);
    const taxRate = Number(gstRate) || 0;

    const stripsPerBox = selectedProduct?.stripsPerBox ?? 10;
    const totalStrips = qty * stripsPerBox;

    const subtotal = qty * rate;
    const totalGst = subtotal * (taxRate / 100);
    const cgst = totalGst / 2;
    const sgst = totalGst / 2;
    const purchaseWithTax = subtotal + totalGst;

    // Calculate total miscellaneous expenses
    const totalMisc = miscExpenses.reduce((sum, exp) => {
      const val = Math.max(0, Number(exp.amount) || 0);
      return sum + val;
    }, 0);

    const totalLandedCost = purchaseWithTax + totalMisc;
    const landedCostPerUnit = qty > 0 ? totalLandedCost / qty : 0;
    const landedCostPerStrip = totalStrips > 0 ? totalLandedCost / totalStrips : 0;

    return {
      qty,
      rate,
      taxRate,
      stripsPerBox,
      totalStrips,
      subtotal,
      totalGst,
      cgst,
      sgst,
      purchaseWithTax,
      totalMisc,
      totalLandedCost,
      landedCostPerUnit,
      landedCostPerStrip
    };
  }, [receivedBoxes, unitCost, gstRate, selectedProduct, miscExpenses]);

  // Miscellaneous expense helpers
  function addMiscExpense() {
    setMiscExpenses(prev => [
      ...prev,
      { id: idempotencyKey(), label: '', amount: '' }
    ]);
  }

  function updateMiscExpense(id: string, field: 'label' | 'amount', value: string) {
    setMiscExpenses(prev =>
      prev.map(exp => (exp.id === id ? { ...exp, [field]: value } : exp))
    );
  }

  function removeMiscExpense(id: string) {
    setMiscExpenses(prev => prev.filter(exp => exp.id !== id));
    if (miscExpenses.length <= 1) {
      setShowMiscExpenses(false);
    }
  }

  if (!isOpen) return null;

  // Handle Quick Add Product
  async function handleQuickAddProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!newProductName.trim() || !newProductCode.trim()) {
      setAddProductError('Product name and code are required.');
      return;
    }
    const strips = parseInt(newStripsPerBox, 10);
    if (isNaN(strips) || strips < 1) {
      setAddProductError('Strips per box must be at least 1.');
      return;
    }

    setIsAddingProduct(true);
    setAddProductError('');

    try {
      const response = await fetch(`${apiUrl}/inventory/products`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProductName.trim(),
          code: newProductCode.trim().toUpperCase(),
          stripsPerBox: strips,
          composition: newComposition.trim() || undefined
        })
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          Array.isArray(body.message)
            ? body.message.join(' ')
            : body.message || 'Could not register product.'
        );
      }

      const createdProduct: Product = {
        id: body.id,
        name: body.name,
        code: body.code,
        stripsPerBox: body.stripsPerBox,
        availableStrips: 0,
        reorderLevelStrips: body.reorderLevelStrips ?? 0,
        batches: []
      };

      setProductsList(prev => [createdProduct, ...prev]);
      setSelectedProductId(createdProduct.id);
      setShowAddProduct(false);
      setNewProductName('');
      setNewProductCode('');
      setNewComposition('');
      setProductSearch('');
      setIsDropdownOpen(false);
    } catch (err) {
      setAddProductError(err instanceof Error ? err.message : 'Error adding product.');
    } finally {
      setIsAddingProduct(false);
    }
  }

  // Handle Inward Processing Submission
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProductId) {
      setErrorMessage('Please select a product from master inventory.');
      return;
    }
    if (!batchNumber.trim()) {
      setErrorMessage('Batch Number is required.');
      return;
    }
    if (!expiryDate) {
      setErrorMessage('Expiry Date is required for FEFO tracking.');
      return;
    }
    if (!supplierRef.trim()) {
      setErrorMessage('Invoice Number is required for GRN audit compliance.');
      return;
    }

    // Convert expiry date (e.g. "2027-05") to full ISO date (e.g. "2027-05-31")
    let fullExpiryDate = expiryDate;
    if (expiryDate.length === 7) {
      const [year, month] = expiryDate.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      fullExpiryDate = `${expiryDate}-${String(lastDay).padStart(2, '0')}T00:00:00.000Z`;
    }

    // Manufacturing date
    let fullMfgDate: string | undefined = undefined;
    if (mfgDate) {
      if (mfgDate.length === 7) {
        fullMfgDate = `${mfgDate}-01T00:00:00.000Z`;
      } else {
        fullMfgDate = new Date(mfgDate).toISOString();
      }
    }

    const payload = {
      productId: selectedProductId,
      batchNumber: batchNumber.trim().toUpperCase(),
      supplierRef: supplierRef.trim(),
      supplierName: supplierName.trim() || 'Vendor Direct',
      manufacturingDate: fullMfgDate,
      expiryDate: fullExpiryDate,
      receivedBoxes: calc.qty,
      unitCostPaise: Math.round(calc.rate * 100),
      mrpPaise: 0,
      gstRate: calc.taxRate,
      idempotencyKey: idempotencyKey()
    };

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const response = await fetch(`${apiUrl}/inventory/receipts`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = Array.isArray(body.message) ? body.message.join(' ') : body.message;
        throw new Error(
          response.status === 401
            ? 'Your session expired. Please sign in again.'
            : detail || 'Failed to process stock receipt.'
        );
      }

      setSuccessData({
        batchNumber: payload.batchNumber,
        productName: selectedProduct?.name ?? 'Product',
        totalStrips: calc.totalStrips,
        landingCost: calc.totalLandedCost
      });

      if (onStockReceived && selectedProduct) {
        onStockReceived(selectedProduct, payload.batchNumber);
      }

      window.setTimeout(() => {
        router.refresh();
      }, 1200);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to process stock receipt.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="entry-dialog receive-stock-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receive-stock-title"
        style={{ width: 'min(760px, 98%)', maxWidth: '760px' }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px 24px',
            borderBottom: '1px solid var(--line)',
            background: 'linear-gradient(135deg, #fafaff 0%, #f4f3ff 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #5141dc, #7c3aed)',
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
                boxShadow: '0 6px 16px rgba(81, 65, 220, 0.25)'
              }}
            >
              <PackageCheck size={22} />
            </div>
            <div>
              <p className="eyebrow" style={{ color: '#6353ea', margin: '0 0 2px' }}>
                Inward Inventory · Goods Receipt Note (GRN)
              </p>
              <h2 id="receive-stock-title" style={{ margin: 0, fontSize: '19px', fontWeight: 800 }}>
                Receive Stock &amp; Batch Inwarding
              </h2>
            </div>
          </div>
          <button
            className="close-button"
            aria-label="Close dialog"
            onClick={onClose}
            style={{ borderRadius: '8px', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </header>

        {successData ? (
          <div style={{ padding: '36px 28px', textAlign: 'center' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                margin: '0 auto 16px',
                borderRadius: '50%',
                background: '#eaf9f2',
                color: '#16815a',
                display: 'grid',
                placeItems: 'center'
              }}
            >
              <CheckCircle2 size={36} />
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 8px' }}>
              Stock Inwarded Successfully!
            </h3>
            <p style={{ color: '#556175', fontSize: '14px', maxWidth: '480px', margin: '0 auto 20px' }}>
              Batch <strong>{successData.batchNumber}</strong> for <strong>{successData.productName}</strong> has been added. <strong>{numberFormat.format(successData.totalStrips)} strips</strong> are now live in active inventory with total landed cost of <strong>{currencyFormat.format(successData.landingCost)}</strong>.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
              <button
                type="button"
                className="submit-button"
                onClick={() => {
                  setSuccessData(null);
                  setBatchNumber('');
                  setSupplierRef('');
                  setMiscExpenses([]);
                  setShowMiscExpenses(false);
                }}
              >
                Inward Another Batch
              </button>
              <button
                type="button"
                className="cancel-button"
                onClick={onClose}
              >
                Done &amp; View Inventory
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: '22px 24px', maxHeight: '75vh', overflowY: 'auto' }}>
            {errorMessage && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: '#fff1f2',
                  border: '1px solid #fecdd3',
                  color: '#be123c',
                  fontSize: '13px',
                  marginBottom: '16px'
                }}
              >
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────────
                SECTION 1: PRODUCT NAME
            ───────────────────────────────────────────────────────────────── */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <Package size={16} color="#5141dc" />
                <span style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#4b5563' }}>
                  1. Product Name
                </span>
              </div>

              {/* Product Name (Searchable Dropdown + Quick Add) */}
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ margin: 0, fontWeight: 700, fontSize: '12px', color: '#4a5364' }}>
                    Product Name <strong style={{ color: '#e11d48' }}>*</strong>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddProduct(!showAddProduct)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#5141dc',
                      fontSize: '12px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: 'pointer',
                      padding: '2px 6px',
                      borderRadius: '6px'
                    }}
                  >
                    <Plus size={14} />
                    {showAddProduct ? 'Cancel New Product' : '+ Add Product'}
                  </button>
                </div>

                {/* Inline Quick Add Product Subform */}
                {showAddProduct ? (
                  <div
                    style={{
                      background: '#f8f7ff',
                      border: '1.5px dashed #a5b4fc',
                      borderRadius: '10px',
                      padding: '16px',
                      marginBottom: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                      <Sparkles size={16} color="#4f46e5" />
                      <strong style={{ fontSize: '13px', color: '#3730a3' }}>
                        Register New Master Product
                      </strong>
                    </div>

                    {addProductError && (
                      <p style={{ color: '#e11d48', fontSize: '12px', margin: '0 0 10px' }}>
                        {addProductError}
                      </p>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                      <label style={{ fontSize: '11px' }}>
                        Product Name
                        <input
                          value={newProductName}
                          onChange={e => setNewProductName(e.target.value)}
                          placeholder="e.g. Paracetamol 650"
                          style={{ minHeight: '34px', fontSize: '12px' }}
                        />
                      </label>
                      <label style={{ fontSize: '11px' }}>
                        Product SKU Code
                        <input
                          value={newProductCode}
                          onChange={e => setNewProductCode(e.target.value)}
                          placeholder="e.g. PCM-650"
                          style={{ minHeight: '34px', fontSize: '12px' }}
                        />
                      </label>
                      <label style={{ fontSize: '11px' }}>
                        Strips per Box
                        <input
                          type="number"
                          min="1"
                          value={newStripsPerBox}
                          onChange={e => setNewStripsPerBox(e.target.value)}
                          style={{ minHeight: '34px', fontSize: '12px' }}
                        />
                      </label>
                    </div>

                    <label style={{ fontSize: '11px', marginBottom: '10px' }}>
                      Composition / Formulation (Optional)
                      <input
                        value={newComposition}
                        onChange={e => setNewComposition(e.target.value)}
                        placeholder="e.g. Paracetamol IP 650mg"
                        style={{ minHeight: '34px', fontSize: '12px' }}
                      />
                    </label>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button
                        type="button"
                        className="cancel-button"
                        onClick={() => setShowAddProduct(false)}
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="submit-button"
                        disabled={isAddingProduct}
                        onClick={handleQuickAddProduct}
                        style={{ padding: '6px 14px', fontSize: '12px' }}
                      >
                        {isAddingProduct ? 'Saving...' : 'Save & Select'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Searchable Product Dropdown */
                  <div style={{ position: 'relative' }}>
                    <div
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        minHeight: '42px',
                        padding: '8px 12px',
                        border: '1px solid #dfe3e9',
                        borderRadius: '8px',
                        background: '#fff',
                        cursor: 'pointer'
                      }}
                    >
                      <div>
                        <strong>{selectedProduct?.name ?? 'Select Product'}</strong>
                        {selectedProduct && (
                          <span style={{ color: '#6b7280', fontSize: '12px', marginLeft: '8px' }}>
                            ({selectedProduct.code} · {selectedProduct.stripsPerBox} strips/box)
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '11px', color: '#6366f1', fontWeight: 700 }}>
                        {isDropdownOpen ? '▲ Close' : '▼ Change'}
                      </span>
                    </div>

                    {isDropdownOpen && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          zIndex: 30,
                          marginTop: '4px',
                          background: '#fff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '10px',
                          boxShadow: '0 12px 30px rgba(0,0,0,0.12)',
                          maxHeight: '260px',
                          overflowY: 'auto',
                          padding: '8px'
                        }}
                      >
                        <div style={{ position: 'relative', marginBottom: '8px' }}>
                          <input
                            type="text"
                            value={productSearch}
                            onChange={e => setProductSearch(e.target.value)}
                            placeholder="Search by product name, code, or composition..."
                            autoFocus
                            style={{
                              paddingLeft: '32px',
                              minHeight: '36px',
                              fontSize: '12px'
                            }}
                          />
                          <Search
                            size={15}
                            style={{ position: 'absolute', left: '10px', top: '10px', color: '#9ca3af' }}
                          />
                        </div>

                        <div style={{ display: 'grid', gap: '3px' }}>
                          {filteredProducts.map(product => (
                            <div
                              key={product.id}
                              onClick={() => {
                                setSelectedProductId(product.id);
                                setIsDropdownOpen(false);
                                setProductSearch('');
                              }}
                              style={{
                                padding: '8px 10px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: product.id === selectedProductId ? '#eff6ff' : 'transparent'
                              }}
                            >
                              <div>
                                <strong style={{ fontSize: '13px', color: '#1f2937' }}>
                                  {product.name}
                                </strong>
                                <div style={{ fontSize: '11px', color: '#6b7280' }}>
                                  {product.code} {product.composition ? `· ${product.composition}` : ''}
                                </div>
                              </div>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: '#4f46e5' }}>
                                {product.stripsPerBox} strips/bx
                              </span>
                            </div>
                          ))}
                          {filteredProducts.length === 0 && (
                            <div style={{ padding: '12px', textAlign: 'center', color: '#9ca3af', fontSize: '12px' }}>
                              No products found matching &ldquo;{productSearch}&rdquo;.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Selected Product Info Card */}
              {selectedProduct && (
                <div
                  style={{
                    marginTop: '12px',
                    padding: '12px 14px',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Layers size={15} color="#4f46e5" />
                      <strong style={{ color: '#1e293b' }}>
                        Master SKU: {selectedProduct.name} ({selectedProduct.code})
                      </strong>
                    </div>
                    <span style={{ color: '#475569', fontWeight: 600 }}>
                      Current Stock: {numberFormat.format(Math.floor(selectedProduct.availableStrips / (selectedProduct.stripsPerBox || 10)))} boxes ({numberFormat.format(selectedProduct.availableStrips)} strips)
                    </span>
                  </div>

                  {selectedProduct.batches.length > 0 ? (
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', fontWeight: 600 }}>
                        Active Batches in Stock (FEFO Priority Order):
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {selectedProduct.batches.map((b, idx) => (
                          <div
                            key={b.id}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '3px 8px',
                              background: '#ffffff',
                              borderRadius: '6px',
                              border: idx === 0 ? '1px solid #f59e0b' : '1px solid #cbd5e1',
                              fontSize: '11px'
                            }}
                          >
                            <span
                              style={{
                                padding: '1px 5px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 700,
                                background: idx === 0 ? '#fef3c7' : '#f1f5f9',
                                color: idx === 0 ? '#b45309' : '#475569'
                              }}
                            >
                              {idx === 0 ? 'Old Stock (FEFO 1st)' : `Batch 0${idx + 1}`}
                            </span>
                            <strong>{b.batchNumber}</strong>
                            <span style={{ color: '#64748b' }}>
                              Exp: {new Date(b.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                            </span>
                            <span style={{ fontWeight: 600, color: '#0f172a' }}>
                              {numberFormat.format(Math.floor(b.availableStrips / (selectedProduct.stripsPerBox || 10)))} bxs
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p style={{ margin: '0 0 6px', fontSize: '11px', color: '#64748b' }}>
                      No active batches currently in stock. This entry will be the initial primary batch.
                    </p>
                  )}

                  {calc.qty > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '6px 10px',
                        background: '#ecfdf5',
                        borderRadius: '6px',
                        border: '1px solid #a7f3d0',
                        color: '#065f46',
                        fontWeight: 600
                      }}
                    >
                      <span>
                        Replenishment Impact: +{numberFormat.format(calc.qty)} boxes ({numberFormat.format(calc.totalStrips)} strips)
                      </span>
                      <span>
                        Combined Master Total: <strong>{numberFormat.format(Math.floor(selectedProduct.availableStrips / (selectedProduct.stripsPerBox || 10)) + calc.qty)} boxes</strong> ({numberFormat.format(selectedProduct.availableStrips + calc.totalStrips)} strips)
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ─────────────────────────────────────────────────────────────────
                SECTION 2: BATCH & VENDOR PARAMETERS
            ───────────────────────────────────────────────────────────────── */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <Calendar size={16} color="#5141dc" />
                <span style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#4b5563' }}>
                  2. Batch &amp; Vendor Parameters
                </span>
              </div>

              <div className="form-grid" style={{ marginTop: 0 }}>
                {/* Batch Number */}
                <label>
                  <span>
                    Batch Number <strong style={{ color: '#e11d48' }}>*</strong>
                  </span>
                  <div style={{ position: 'relative' }}>
                    <input
                      name="batchNumber"
                      value={batchNumber}
                      onChange={e => setBatchNumber(e.target.value)}
                      placeholder="e.g. 01, BX-204, CF-9102"
                      required
                      style={{ paddingLeft: '32px', textTransform: 'uppercase', fontWeight: 700 }}
                    />
                    <Tag
                      size={15}
                      style={{ position: 'absolute', left: '10px', top: '12px', color: '#9ca3af' }}
                    />
                  </div>
                </label>

                {/* Expiry Date (MM/YYYY) */}
                <label>
                  <span>
                    Expiry Date (MM/YYYY) <strong style={{ color: '#e11d48' }}>*</strong>
                  </span>
                  <input
                    type="month"
                    name="expiryDate"
                    value={expiryDate}
                    onChange={e => setExpiryDate(e.target.value)}
                    required
                  />
                </label>

                {/* Manufacturing Date */}
                <label>
                  <span>Manufacturing Date (MM/YYYY)</span>
                  <input
                    type="month"
                    name="mfgDate"
                    value={mfgDate}
                    onChange={e => setMfgDate(e.target.value)}
                    placeholder="Optional manufacturing date"
                  />
                </label>

                {/* Invoice Number */}
                <label>
                  <span>
                    Invoice Number <strong style={{ color: '#e11d48' }}>*</strong>
                  </span>
                  <div style={{ position: 'relative' }}>
                    <input
                      name="supplierRef"
                      value={supplierRef}
                      onChange={e => setSupplierRef(e.target.value)}
                      placeholder="e.g. INV-2026-8941"
                      required
                      style={{ paddingLeft: '32px' }}
                    />
                    <FileText
                      size={15}
                      style={{ position: 'absolute', left: '10px', top: '12px', color: '#9ca3af' }}
                    />
                  </div>
                </label>

                {/* Supplier / Vendor Name */}
                <label className="wide">
                  <span>Supplier / Vendor Name</span>
                  <div style={{ position: 'relative' }}>
                    <input
                      name="supplierName"
                      value={supplierName}
                      onChange={e => setSupplierName(e.target.value)}
                      placeholder="e.g. Cipla Pharma Ltd / Sun Dist."
                      style={{ paddingLeft: '32px' }}
                    />
                    <Building2
                      size={15}
                      style={{ position: 'absolute', left: '10px', top: '12px', color: '#9ca3af' }}
                    />
                  </div>
                </label>
              </div>
            </div>

            {/* ─────────────────────────────────────────────────────────────────
                SECTION 3: PURCHASE COST
            ───────────────────────────────────────────────────────────────── */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <Receipt size={16} color="#5141dc" />
                <span style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#4b5563' }}>
                  3. Purchase Cost
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                {/* Quantity Ordered */}
                <label>
                  <span>
                    Quantity Ordered <strong style={{ color: '#e11d48' }}>*</strong>
                  </span>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      min="1"
                      name="receivedBoxes"
                      value={receivedBoxes}
                      onChange={e => setReceivedBoxes(e.target.value)}
                      required
                      style={{ paddingLeft: '32px', fontWeight: 700 }}
                    />
                    <Package
                      size={15}
                      style={{ position: 'absolute', left: '10px', top: '12px', color: '#9ca3af' }}
                    />
                  </div>
                </label>

                {/* Purchase Cost (Unit Price) */}
                <label>
                  <span>
                    Purchase Cost (Unit Price ₹) <strong style={{ color: '#e11d48' }}>*</strong>
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={unitCost}
                    onChange={e => setUnitCost(e.target.value)}
                    placeholder="Rate per unit before tax"
                    required
                    style={{ fontWeight: 700 }}
                  />
                </label>

                {/* GST Rate Selection */}
                <label>
                  <span>GST Rate</span>
                  <select
                    value={gstRate}
                    onChange={e => setGstRate(Number(e.target.value))}
                    style={{ fontWeight: 700, color: '#374151' }}
                  >
                    <option value={5}>5% GST</option>
                    <option value={12}>12% GST</option>
                    <option value={18}>18% GST</option>
                    <option value={28}>28% GST</option>
                    <option value={0}>0% GST (Exempt)</option>
                  </select>
                </label>
              </div>

              {/* Subtotal & Tax Calculation — auto-computed display */}
              <div
                style={{
                  marginTop: '16px',
                  borderRadius: '10px',
                  border: '1px solid #e0e7ff',
                  background: 'linear-gradient(135deg, #f8faff 0%, #f5f3ff 100%)',
                  padding: '14px 16px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                  <TrendingUp size={15} color="#4338ca" />
                  <strong style={{ fontSize: '12px', color: '#312e81' }}>Subtotal &amp; Tax Calculation</strong>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', fontSize: '12px' }}>
                  {/* Subtotal */}
                  <div>
                    <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>
                      Subtotal (before tax)
                    </span>
                    <strong style={{ fontSize: '15px', color: '#1e293b' }}>
                      {currencyFormat.format(calc.subtotal)}
                    </strong>
                    <small style={{ color: '#94a3b8', display: 'block', fontSize: '10px' }}>
                      {numberFormat.format(calc.qty)} units × ₹{calc.rate}
                    </small>
                  </div>

                  {/* GST Tax */}
                  <div>
                    <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>
                      GST ({calc.taxRate}%)
                    </span>
                    <strong style={{ fontSize: '15px', color: '#4338ca' }}>
                      +{currencyFormat.format(calc.totalGst)}
                    </strong>
                    <small style={{ color: '#6366f1', display: 'block', fontSize: '10px' }}>
                      CGST {calc.taxRate / 2}% ({currencyFormat.format(calc.cgst)}) + SGST {calc.taxRate / 2}%
                    </small>
                  </div>

                  {/* Total Purchase Sum */}
                  <div>
                    <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>
                      Total Purchase (with GST)
                    </span>
                    <strong style={{ fontSize: '16px', color: '#0f766e', fontWeight: 800 }}>
                      {currencyFormat.format(calc.purchaseWithTax)}
                    </strong>
                    <small style={{ color: '#0d9488', display: 'block', fontSize: '10px' }}>
                      Subtotal + GST
                    </small>
                  </div>
                </div>
              </div>

              {/* Miscellaneous Expenses (Optional) */}
              <div style={{ marginTop: '16px' }}>
                {!showMiscExpenses ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMiscExpenses(true);
                      if (miscExpenses.length === 0) {
                        addMiscExpense();
                      }
                    }}
                    style={{
                      background: 'none',
                      border: '1.5px dashed #cbd5e1',
                      borderRadius: '8px',
                      padding: '10px 16px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      color: '#64748b',
                      fontSize: '12px',
                      fontWeight: 600,
                      transition: 'all 0.2s'
                    }}
                  >
                    <Truck size={15} color="#6366f1" />
                    <span>+ Add Miscellaneous Expenses</span>
                    <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#94a3b8', fontWeight: 400 }}>
                      Optional — freight, transportation, insurance, etc.
                    </span>
                  </button>
                ) : (
                  <div
                    style={{
                      border: '1.5px dashed #c7d2fe',
                      borderRadius: '10px',
                      padding: '14px 16px',
                      background: '#fafafe'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Truck size={15} color="#6366f1" />
                        <strong style={{ fontSize: '12px', color: '#3730a3' }}>
                          Miscellaneous Expenses (Optional)
                        </strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowMiscExpenses(false);
                          setMiscExpenses([]);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#94a3b8',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: 600
                        }}
                      >
                        Clear All
                      </button>
                    </div>

                    <div style={{ display: 'grid', gap: '8px' }}>
                      {miscExpenses.map((exp) => (
                        <div
                          key={exp.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1.5fr 1fr auto',
                            gap: '8px',
                            alignItems: 'end'
                          }}
                        >
                          <label style={{ fontSize: '11px', margin: 0 }}>
                            {miscExpenses.indexOf(exp) === 0 && (
                              <span style={{ display: 'block', marginBottom: '4px', color: '#64748b' }}>Description</span>
                            )}
                            <input
                              value={exp.label}
                              onChange={e => updateMiscExpense(exp.id, 'label', e.target.value)}
                              placeholder="e.g. Freight / Transport / Insurance"
                              style={{ minHeight: '34px', fontSize: '12px' }}
                            />
                          </label>
                          <label style={{ fontSize: '11px', margin: 0 }}>
                            {miscExpenses.indexOf(exp) === 0 && (
                              <span style={{ display: 'block', marginBottom: '4px', color: '#64748b' }}>Amount (₹)</span>
                            )}
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={exp.amount}
                              onChange={e => updateMiscExpense(exp.id, 'amount', e.target.value)}
                              placeholder="0.00"
                              style={{ minHeight: '34px', fontSize: '12px', fontWeight: 700 }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => removeMiscExpense(exp.id)}
                            style={{
                              background: '#fff1f2',
                              border: '1px solid #fecdd3',
                              borderRadius: '6px',
                              width: '34px',
                              height: '34px',
                              display: 'grid',
                              placeItems: 'center',
                              cursor: 'pointer',
                              color: '#e11d48'
                            }}
                            aria-label="Remove expense"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={addMiscExpense}
                      style={{
                        marginTop: '8px',
                        background: 'none',
                        border: 'none',
                        color: '#6366f1',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Plus size={13} /> Add Another Expense
                    </button>

                    {calc.totalMisc > 0 && (
                      <div
                        style={{
                          marginTop: '10px',
                          padding: '6px 10px',
                          background: '#fef3c7',
                          borderRadius: '6px',
                          border: '1px solid #fbbf24',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#92400e',
                          display: 'flex',
                          justifyContent: 'space-between'
                        }}
                      >
                        <span>Total Miscellaneous Expenses</span>
                        <span>{currencyFormat.format(calc.totalMisc)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ─────────────────────────────────────────────────────────────────
                LANDED COST — FINAL CONSOLIDATED TOTAL
            ───────────────────────────────────────────────────────────────── */}
            <div
              style={{
                borderRadius: '12px',
                border: '2px solid #a7f3d0',
                background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)',
                padding: '16px 18px',
                marginBottom: '20px'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                  borderBottom: '1px solid #bbf7d0',
                  paddingBottom: '8px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <TrendingUp size={16} color="#15803d" />
                  <strong style={{ fontSize: '14px', color: '#14532d' }}>
                    Landed Cost
                  </strong>
                </div>
                <span
                  style={{
                    background: '#dcfce7',
                    color: '#166534',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: '999px'
                  }}
                >
                  Final Consolidated Total
                </span>
              </div>

              {/* Breakdown rows */}
              <div style={{ fontSize: '13px', display: 'grid', gap: '6px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#334155' }}>
                  <span>Base Purchase Value ({numberFormat.format(calc.qty)} × ₹{calc.rate})</span>
                  <span style={{ fontWeight: 600 }}>{currencyFormat.format(calc.subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4338ca' }}>
                  <span>GST @ {calc.taxRate}% (CGST {calc.taxRate / 2}% + SGST {calc.taxRate / 2}%)</span>
                  <span style={{ fontWeight: 600 }}>+{currencyFormat.format(calc.totalGst)}</span>
                </div>
                {calc.totalMisc > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#92400e' }}>
                    <span>Miscellaneous Expenses</span>
                    <span style={{ fontWeight: 600 }}>+{currencyFormat.format(calc.totalMisc)}</span>
                  </div>
                )}
                <div
                  style={{
                    borderTop: '1.5px solid #86efac',
                    paddingTop: '8px',
                    marginTop: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <strong style={{ fontSize: '15px', color: '#14532d' }}>Total Landed Cost</strong>
                  <strong style={{ fontSize: '22px', color: '#15803d', fontWeight: 800 }}>
                    {currencyFormat.format(calc.totalLandedCost)}
                  </strong>
                </div>
              </div>

              {/* Per-unit breakdown */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '10px',
                  fontSize: '11px'
                }}
              >
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: '8px',
                    border: '1px solid #d1fae5',
                    padding: '8px 12px',
                    textAlign: 'center'
                  }}
                >
                  <span style={{ color: '#64748b', display: 'block' }}>Landed Cost per Unit</span>
                  <strong style={{ fontSize: '14px', color: '#0f766e' }}>
                    {currencyFormat.format(calc.landedCostPerUnit)}
                  </strong>
                </div>
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: '8px',
                    border: '1px solid #d1fae5',
                    padding: '8px 12px',
                    textAlign: 'center'
                  }}
                >
                  <span style={{ color: '#64748b', display: 'block' }}>Landed Cost per Strip</span>
                  <strong style={{ fontSize: '14px', color: '#0f766e' }}>
                    {currencyFormat.format(calc.landedCostPerStrip)}
                  </strong>
                </div>
              </div>
            </div>

            {/* ACTION FOOTER */}
            <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="cancel-button"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="submit-button"
                disabled={isSubmitting}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                  padding: '11px 22px',
                  fontSize: '13px',
                  fontWeight: 800
                }}
              >
                <PackageCheck size={17} />
                {isSubmitting ? 'Inwarding Stock…' : 'Confirm & Inward Batch'}
              </button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}
