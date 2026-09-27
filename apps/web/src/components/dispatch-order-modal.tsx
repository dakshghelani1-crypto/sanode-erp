'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowDownToLine,
  Building,
  CheckCircle2,
  Clock,
  Coins,
  FileText,
  Hospital,
  Layers,
  Package,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  Store,
  Tag,
  TrendingDown,
  X
} from 'lucide-react';
import { API_BASE_URL, type Customer, type Product } from '@/lib/api';

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

type Allocation = {
  batchNumber: string;
  expiryDate: string;
  quantityStrips: number;
  availableAfterStrips: number;
};

type PreviewResult = {
  billedStrips: number;
  freeStrips: number;
  totalStrips: number;
  scheme: { name: string; minimumBoxes: number; freeStrips: number } | null;
  allocations: Allocation[];
  sufficient: boolean;
  shortfallStrips: number;
  notice: string;
};

export function DispatchOrderModal({
  isOpen,
  onClose,
  products,
  defaultProductId
}: {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  defaultProductId?: string;
}) {
  const router = useRouter();

  // Filter products that hold sellable inventory
  const availableProducts = useMemo(
    () => products.filter(p => p.availableStrips > 0),
    [products]
  );

  const [selectedProductId, setSelectedProductId] = useState<string>(
    defaultProductId || availableProducts[0]?.id || products[0]?.id || ''
  );

  useEffect(() => {
    if (defaultProductId) {
      setSelectedProductId(defaultProductId);
    }
  }, [defaultProductId, isOpen]);

  const [productSearch, setProductSearch] = useState('');
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);

  // Clients & Directory state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerName, setSelectedCustomerName] = useState('');
  const [customerType, setCustomerType] = useState('Hospital');
  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);

  // Inline Quick Add Client state
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerType, setNewCustomerType] = useState('Hospital');
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);

  // Form Fields
  const [billedStrips, setBilledStrips] = useState<string>('50');
  const [pricePerBox, setPricePerBox] = useState<string>('200');
  const [note, setNote] = useState('');

  // Live FEFO Preview state
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successResult, setSuccessResult] = useState<{
    orderId: string;
    productName: string;
    customerName: string;
    billedStrips: number;
    freeStrips: number;
    totalAmount: number;
  } | null>(null);

  // Selected product
  const selectedProduct = useMemo(
    () => products.find(p => p.id === selectedProductId) ?? products[0],
    [products, selectedProductId]
  );

  // Fetch customer directory on mount
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    fetch(`${apiUrl}/inventory/customers`, { credentials: 'include' })
      .then(res => (res.ok ? res.json() : []))
      .then((data: Customer[]) => {
        if (isMounted && Array.isArray(data)) {
          setCustomers(data);
          if (data.length > 0 && !selectedCustomerName) {
            setSelectedCustomerName(data[0].name);
            setCustomerType(data[0].type);
          }
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Packaging & Pricing Calculations
  const calc = useMemo(() => {
    const strips = Math.max(0, parseInt(billedStrips, 10) || 0);
    const boxRate = Math.max(0, parseFloat(pricePerBox) || 0);
    const stripsPerBox = selectedProduct?.stripsPerBox || 10;

    const equivalentBoxes = strips / stripsPerBox;
    const fullBoxes = Math.floor(strips / stripsPerBox);
    const looseStrips = strips % stripsPerBox;

    const pricePerStrip = stripsPerBox > 0 ? boxRate / stripsPerBox : 0;
    const totalInvoiceAmount = strips * pricePerStrip;

    const availableStock = selectedProduct?.availableStrips ?? 0;
    const isExceeding = strips > availableStock;

    return {
      strips,
      boxRate,
      stripsPerBox,
      equivalentBoxes,
      fullBoxes,
      looseStrips,
      pricePerStrip,
      totalInvoiceAmount,
      availableStock,
      isExceeding
    };
  }, [billedStrips, pricePerBox, selectedProduct]);

  // Trigger live FEFO preview whenever product or billed strips change
  useEffect(() => {
    if (!isOpen || !selectedProductId || calc.strips <= 0) {
      setPreview(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsPreviewing(true);
      try {
        const response = await fetch(
          `${apiUrl}/inventory/dispatch-preview?productId=${encodeURIComponent(
            selectedProductId
          )}&billedStrips=${calc.strips}`,
          { credentials: 'include' }
        );
        if (response.ok) {
          const data = await response.json();
          setPreview(data);
        }
      } catch {
        // Silently catch preview error
      } finally {
        setIsPreviewing(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [isOpen, selectedProductId, calc.strips]);

  if (!isOpen) return null;

  // Search filtered products
  const filteredProducts = products.filter(p => {
    const term = productSearch.toLowerCase().trim();
    if (!term) return true;
    return (
      p.name.toLowerCase().includes(term) ||
      p.code.toLowerCase().includes(term)
    );
  });

  // Search filtered customers
  const filteredCustomers = customers.filter(c => {
    const term = customerSearch.toLowerCase().trim();
    if (!term) return true;
    return (
      c.name.toLowerCase().includes(term) ||
      c.type.toLowerCase().includes(term)
    );
  });

  // Handle Quick Add Customer
  async function handleAddCustomer() {
    if (!newCustomerName.trim()) return;
    setIsAddingCustomer(true);
    try {
      const response = await fetch(`${apiUrl}/inventory/customers`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCustomerName.trim(),
          type: newCustomerType
        })
      });
      if (response.ok) {
        const created: Customer = await response.json();
        setCustomers(prev => [created, ...prev.filter(c => c.name !== created.name)]);
        setSelectedCustomerName(created.name);
        setCustomerType(created.type);
        setShowAddCustomer(false);
        setNewCustomerName('');
        setIsCustomerDropdownOpen(false);
      }
    } catch {
      // Fallback: set locally
      setSelectedCustomerName(newCustomerName.trim());
      setCustomerType(newCustomerType);
      setShowAddCustomer(false);
    } finally {
      setIsAddingCustomer(false);
    }
  }

  // Handle Confirm Dispatch
  async function handleConfirmDispatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProductId) {
      setErrorMessage('Please select a product with available inventory.');
      return;
    }
    if (calc.strips <= 0) {
      setErrorMessage('Billed strips must be at least 1.');
      return;
    }
    if (calc.isExceeding) {
      setErrorMessage(
        `Requested ${numberFormat.format(calc.strips)} strips exceeds available stock (${numberFormat.format(calc.availableStock)} strips). Negative inventory is prevented.`
      );
      return;
    }
    if (!selectedCustomerName.trim()) {
      setErrorMessage('Customer / Hospital / Pharmacy name is required.');
      return;
    }

    const payload = {
      productId: selectedProductId,
      customerName: selectedCustomerName.trim(),
      customerType,
      billedStrips: calc.strips,
      unitPricePaise: Math.round(calc.boxRate * 100),
      note: note.trim() || undefined,
      idempotencyKey: idempotencyKey()
    };

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const response = await fetch(`${apiUrl}/inventory/dispatches`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = Array.isArray(body.message)
          ? body.message.join(' ')
          : body.message;
        throw new Error(
          response.status === 401
            ? 'Your session expired. Please sign in again.'
            : detail || 'Failed to confirm dispatch.'
        );
      }

      setSuccessResult({
        orderId: body.orderId ?? 'SO-CONFIRMED',
        productName: selectedProduct?.name ?? 'Product',
        customerName: selectedCustomerName,
        billedStrips: calc.strips,
        freeStrips: body.freeStrips ?? 0,
        totalAmount: calc.totalInvoiceAmount
      });

      window.setTimeout(() => {
        router.refresh();
      }, 1200);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Dispatch failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="entry-dialog dispatch-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dispatch-title"
        style={{ width: 'min(760px, 98%)', maxWidth: '760px' }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px 24px',
            borderBottom: '1px solid var(--line)',
            background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
            color: '#fff'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.15)',
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.2)'
              }}
            >
              <ArrowDownToLine size={22} />
            </div>
            <div>
              <p className="eyebrow" style={{ color: '#c7d2fe', margin: '0 0 2px' }}>
                Outward Stock · Sales Order Dispatch
              </p>
              <h2 id="dispatch-title" style={{ margin: 0, fontSize: '19px', fontWeight: 800 }}>
                Dispatch Order (FEFO Allocation)
              </h2>
            </div>
          </div>
          <button
            className="close-button"
            aria-label="Close dialog"
            onClick={onClose}
            style={{
              borderRadius: '8px',
              cursor: 'pointer',
              background: 'rgba(255, 255, 255, 0.15)',
              color: '#fff'
            }}
          >
            <X size={18} />
          </button>
        </header>

        {successResult ? (
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
              Dispatch Confirmed & Allocated!
            </h3>
            <p style={{ color: '#556175', fontSize: '14px', maxWidth: '500px', margin: '0 auto 20px', lineHeight: 1.5 }}>
              Successfully dispatched <strong>{numberFormat.format(successResult.billedStrips)} billed strips</strong>
              {successResult.freeStrips > 0 && ` (+ ${numberFormat.format(successResult.freeStrips)} free scheme strips)`} of <strong>{successResult.productName}</strong> to <strong>{successResult.customerName}</strong>. Total invoice billing value: <strong>{currencyFormat.format(successResult.totalAmount)}</strong>.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
              <button
                type="button"
                className="submit-button"
                onClick={() => {
                  setSuccessResult(null);
                  setBilledStrips('50');
                }}
              >
                Dispatch Another Order
              </button>
              <button type="button" className="cancel-button" onClick={onClose}>
                Done & View Ledger
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleConfirmDispatch} style={{ padding: '22px 24px' }}>
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

            {/* PRODUCT SELECTION (RESTRICTED TO AVAILABLE INVENTORY) */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ margin: '0 0 6px', fontWeight: 700, fontSize: '12px', color: '#4a5364' }}>
                Product Name <strong style={{ color: '#e11d48' }}>*</strong> (Only Products With Available Stock)
              </label>

              <div style={{ position: 'relative' }}>
                <div
                  onClick={() => setIsProductDropdownOpen(!isProductDropdownOpen)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    minHeight: '44px',
                    padding: '8px 12px',
                    border: '1px solid #dfe3e9',
                    borderRadius: '8px',
                    background: '#fff',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Package size={17} color="#4f46e5" />
                    <strong>{selectedProduct?.name ?? 'Select Product'}</strong>
                    {selectedProduct && (
                      <span
                        style={{
                          fontSize: '12px',
                          color: selectedProduct.availableStrips > 0 ? '#15803d' : '#b91c1c',
                          background: selectedProduct.availableStrips > 0 ? '#dcfce7' : '#fee2e2',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          fontWeight: 700
                        }}
                      >
                        {selectedProduct.availableStrips > 0
                          ? `${numberFormat.format(selectedProduct.availableStrips)} strips (${(
                              selectedProduct.availableStrips / selectedProduct.stripsPerBox
                            ).toFixed(0)} boxes) available`
                          : 'Out of Stock'}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '11px', color: '#4f46e5', fontWeight: 700 }}>
                    {isProductDropdownOpen ? '▲ Close' : '▼ Change Product'}
                  </span>
                </div>

                {isProductDropdownOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      zIndex: 35,
                      marginTop: '4px',
                      background: '#fff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '10px',
                      boxShadow: '0 14px 32px rgba(0,0,0,0.15)',
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
                        placeholder="Search product with stock..."
                        autoFocus
                        style={{ paddingLeft: '32px', minHeight: '36px', fontSize: '12px' }}
                      />
                      <Search
                        size={15}
                        style={{ position: 'absolute', left: '10px', top: '10px', color: '#9ca3af' }}
                      />
                    </div>

                    <div style={{ display: 'grid', gap: '3px' }}>
                      {filteredProducts.map(product => {
                        const hasStock = product.availableStrips > 0;
                        return (
                          <div
                            key={product.id}
                            onClick={() => {
                              if (!hasStock) return;
                              setSelectedProductId(product.id);
                              setIsProductDropdownOpen(false);
                              setProductSearch('');
                            }}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '6px',
                              cursor: hasStock ? 'pointer' : 'not-allowed',
                              opacity: hasStock ? 1 : 0.45,
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              background:
                                product.id === selectedProductId ? '#eff6ff' : 'transparent'
                            }}
                          >
                            <div>
                              <strong style={{ fontSize: '13px', color: '#1f2937' }}>
                                {product.name}
                              </strong>
                              <div style={{ fontSize: '11px', color: '#6b7280' }}>
                                {product.code} · {product.stripsPerBox} strips/box
                              </div>
                            </div>
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                color: hasStock ? '#16a34a' : '#dc2626'
                              }}
                            >
                              {hasStock
                                ? `${numberFormat.format(product.availableStrips)} strips`
                                : '0 Stock'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* CUSTOMER SELECTION & QUICK ADD CLIENT MASTER */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ margin: 0, fontWeight: 700, fontSize: '12px', color: '#4a5364' }}>
                  Customer / Hospital / Pharmacy Name <strong style={{ color: '#e11d48' }}>*</strong>
                </label>
                <button
                  type="button"
                  onClick={() => setShowAddCustomer(!showAddCustomer)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#4f46e5',
                    fontSize: '12px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer'
                  }}
                >
                  <Plus size={14} />
                  {showAddCustomer ? 'Cancel' : '+ Add Hospital / Doctor'}
                </button>
              </div>

              {/* Inline Quick Add Client */}
              {showAddCustomer ? (
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1.5px dashed #94a3b8',
                    borderRadius: '10px',
                    padding: '14px',
                    marginBottom: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                    <Sparkles size={15} color="#4f46e5" />
                    <strong style={{ fontSize: '13px', color: '#1e293b' }}>
                      Register Client to Master Directory
                    </strong>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '10px' }}>
                    <input
                      value={newCustomerName}
                      onChange={e => setNewCustomerName(e.target.value)}
                      placeholder="e.g. Om Hospital, City Clinic, Apollo Pharmacy"
                      style={{ fontSize: '12px', minHeight: '36px' }}
                    />
                    <select
                      value={newCustomerType}
                      onChange={e => setNewCustomerType(e.target.value)}
                      style={{ fontSize: '12px', minHeight: '36px', fontWeight: 600 }}
                    >
                      <option value="Hospital">Hospital</option>
                      <option value="Doctor">Doctor</option>
                      <option value="Pharmacy / Retailer">Pharmacy / Retailer</option>
                    </select>
                    <button
                      type="button"
                      className="submit-button"
                      disabled={isAddingCustomer || !newCustomerName.trim()}
                      onClick={handleAddCustomer}
                      style={{ padding: '0 16px', fontSize: '12px' }}
                    >
                      {isAddingCustomer ? 'Saving…' : 'Save & Select'}
                    </button>
                  </div>
                </div>
              ) : (
                /* Customer Dropdown */
                <div style={{ position: 'relative' }}>
                  <div
                    onClick={() => setIsCustomerDropdownOpen(!isCustomerDropdownOpen)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      minHeight: '44px',
                      padding: '8px 12px',
                      border: '1px solid #dfe3e9',
                      borderRadius: '8px',
                      background: '#fff',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {customerType === 'Hospital' ? (
                        <Hospital size={16} color="#0284c7" />
                      ) : customerType === 'Doctor' ? (
                        <Stethoscope size={16} color="#7c3aed" />
                      ) : (
                        <Store size={16} color="#059669" />
                      )}
                      <strong>{selectedCustomerName || 'Select Client / Hospital'}</strong>
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#475569',
                          background: '#f1f5f9',
                          padding: '2px 8px',
                          borderRadius: '6px'
                        }}
                      >
                        {customerType}
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', color: '#4f46e5', fontWeight: 700 }}>
                      {isCustomerDropdownOpen ? '▲ Close' : '▼ Choose from Master'}
                    </span>
                  </div>

                  {isCustomerDropdownOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        zIndex: 35,
                        marginTop: '4px',
                        background: '#fff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '10px',
                        boxShadow: '0 14px 32px rgba(0,0,0,0.15)',
                        maxHeight: '220px',
                        overflowY: 'auto',
                        padding: '8px'
                      }}
                    >
                      <div style={{ position: 'relative', marginBottom: '6px' }}>
                        <input
                          type="text"
                          value={customerSearch}
                          onChange={e => setCustomerSearch(e.target.value)}
                          placeholder="Search hospital, doctor, or pharmacy..."
                          autoFocus
                          style={{ paddingLeft: '32px', minHeight: '34px', fontSize: '12px' }}
                        />
                        <Search
                          size={14}
                          style={{ position: 'absolute', left: '10px', top: '10px', color: '#9ca3af' }}
                        />
                      </div>

                      <div style={{ display: 'grid', gap: '2px' }}>
                        {filteredCustomers.map(c => (
                          <div
                            key={c.id || c.name}
                            onClick={() => {
                              setSelectedCustomerName(c.name);
                              setCustomerType(c.type);
                              setIsCustomerDropdownOpen(false);
                              setCustomerSearch('');
                            }}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              background:
                                c.name === selectedCustomerName ? '#eff6ff' : 'transparent'
                            }}
                          >
                            <span style={{ fontSize: '13px', fontWeight: 600 }}>{c.name}</span>
                            <span
                              style={{
                                fontSize: '11px',
                                color: '#64748b',
                                background: '#f8fafc',
                                padding: '2px 6px',
                                borderRadius: '4px'
                              }}
                            >
                              {c.type}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* CUSTOMER TYPE SELECTION */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ margin: '0 0 6px', fontWeight: 700, fontSize: '12px', color: '#4a5364' }}>
                Customer Type
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['Hospital', 'Doctor', 'Pharmacy / Retailer'].map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setCustomerType(t)}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: customerType === t ? '1.5px solid #4f46e5' : '1px solid #e2e8f0',
                      background: customerType === t ? '#eef2ff' : '#fff',
                      color: customerType === t ? '#4338ca' : '#475569',
                      fontWeight: 700,
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    {t === 'Hospital' ? (
                      <Hospital size={15} />
                    ) : t === 'Doctor' ? (
                      <Stethoscope size={15} />
                    ) : (
                      <Store size={15} />
                    )}
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* QUANTITIES & PRICING CONVERSION */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '14px' }}>
                {/* Billed Strips */}
                <label>
                  <span>
                    Billed Strips (Units Dispatched) <strong style={{ color: '#e11d48' }}>*</strong>
                  </span>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      min="1"
                      name="billedStrips"
                      value={billedStrips}
                      onChange={e => setBilledStrips(e.target.value)}
                      required
                      style={{
                        paddingLeft: '32px',
                        fontWeight: 700,
                        borderColor: calc.isExceeding ? '#e11d48' : '#dfe3e9'
                      }}
                    />
                    <Layers
                      size={15}
                      style={{ position: 'absolute', left: '10px', top: '12px', color: '#9ca3af' }}
                    />
                  </div>
                  <small style={{ color: '#64748b', fontSize: '11px', marginTop: '3px' }}>
                    = {calc.equivalentBoxes.toFixed(1)} boxes ({calc.fullBoxes} bx + {calc.looseStrips} strips @ {calc.stripsPerBox}/bx)
                  </small>
                </label>

                {/* Price per Box (Selling Rate) */}
                <label>
                  <span>
                    Price per Box (Selling Rate) (₹) <strong style={{ color: '#e11d48' }}>*</strong>
                  </span>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      name="pricePerBox"
                      value={pricePerBox}
                      onChange={e => setPricePerBox(e.target.value)}
                      required
                      style={{ paddingLeft: '32px', fontWeight: 700 }}
                    />
                    <Coins
                      size={15}
                      style={{ position: 'absolute', left: '10px', top: '12px', color: '#9ca3af' }}
                    />
                  </div>
                  <small style={{ color: '#4f46e5', fontSize: '11px', marginTop: '3px', fontWeight: 600 }}>
                    ₹{calc.pricePerStrip.toFixed(2)} per strip
                  </small>
                </label>
              </div>
            </div>

            {/* DISPATCH NOTE */}
            <div style={{ marginBottom: '18px' }}>
              <label>
                <span>Dispatch Remarks / Delivery Notes (Optional)</span>
                <textarea
                  rows={2}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Optional delivery instructions, transport reference, or clinic remarks..."
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid #dfe3e9',
                    fontSize: '12px',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
              </label>
            </div>

            {/* LIVE FEFO ALLOCATION & INVENTORY VALIDATION CARD */}
            <div
              style={{
                borderRadius: '12px',
                border: calc.isExceeding
                  ? '1.5px solid #fecdd3'
                  : '1px solid #c7d2fe',
                background: calc.isExceeding
                  ? '#fff1f2'
                  : 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)',
                padding: '16px 18px',
                marginBottom: '20px'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '10px',
                  borderBottom: '1px solid #e2e8f0',
                  paddingBottom: '8px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {calc.isExceeding ? (
                    <ShieldAlert size={16} color="#be123c" />
                  ) : (
                    <Clock size={16} color="#4338ca" />
                  )}
                  <strong style={{ fontSize: '13px', color: calc.isExceeding ? '#9f1239' : '#1e1b4b' }}>
                    {calc.isExceeding
                      ? 'Stock Shortfall — Dispatch Blocked'
                      : 'Live FEFO Batch Allocation'}
                  </strong>
                </div>

                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 800,
                    color: '#0f766e',
                    background: '#ccfbf1',
                    padding: '2px 10px',
                    borderRadius: '999px'
                  }}
                >
                  Total: {currencyFormat.format(calc.totalInvoiceAmount)}
                </span>
              </div>

              {calc.isExceeding ? (
                <div style={{ color: '#be123c', fontSize: '12px', fontWeight: 600 }}>
                  Requested {calc.strips} strips exceeds sellable stock of {calc.availableStock} strips. Shortfall of {calc.strips - calc.availableStock} strips. Negative inventory is strictly prevented.
                </div>
              ) : preview && preview.allocations.length > 0 ? (
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                    Batches allocated by earliest expiry first:
                  </div>
                  <div style={{ display: 'grid', gap: '6px' }}>
                    {preview.allocations.map(alloc => (
                      <div
                        key={alloc.batchNumber}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '6px 10px',
                          background: '#fff',
                          borderRadius: '6px',
                          border: '1px solid #e2e8f0',
                          fontSize: '12px'
                        }}
                      >
                        <div>
                          <strong>{alloc.batchNumber}</strong>
                          <span style={{ color: '#64748b', fontSize: '11px', marginLeft: '8px' }}>
                            Exp. {new Date(alloc.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <span style={{ color: '#dc2626', fontWeight: 700 }}>
                            −{alloc.quantityStrips} strips
                          </span>
                          <span style={{ color: '#64748b', fontSize: '11px' }}>
                            ({alloc.availableAfterStrips} remaining)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {preview.scheme && (
                    <div
                      style={{
                        marginTop: '10px',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        background: '#f3e8ff',
                        color: '#6b21a8',
                        fontSize: '11px',
                        fontWeight: 600
                      }}
                    >
                      Active Scheme Applied: {preview.scheme.name} ({preview.freeStrips} free strips allocated)
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  {isPreviewing ? 'Calculating FEFO batches…' : 'Enter strips to preview batch allocation.'}
                </div>
              )}
            </div>

            {/* ACTION BUTTONS */}
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
                disabled={isSubmitting || calc.isExceeding || calc.strips <= 0}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: calc.isExceeding
                    ? '#94a3b8'
                    : 'linear-gradient(135deg, #1e1b4b, #4338ca)',
                  cursor: calc.isExceeding ? 'not-allowed' : 'pointer',
                  padding: '11px 22px',
                  fontSize: '13px',
                  fontWeight: 800
                }}
              >
                <ArrowDownToLine size={17} />
                {isSubmitting ? 'Confirming Dispatch…' : 'Confirm Dispatch'}
              </button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}
