'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Box,
  Building,
  CheckCircle2,
  Clock,
  Layers,
  Package,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  Tag,
  User,
  UserCheck,
  X
} from 'lucide-react';
import { API_BASE_URL, type Customer, type Product, type Representative } from '@/lib/api';

const apiUrl = API_BASE_URL;

function idempotencyKey() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

const numberFormat = new Intl.NumberFormat('en-IN');

type UnitType = 'Strips' | 'Boxes';

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
  allocations: Allocation[];
  sufficient: boolean;
  shortfallStrips: number;
  notice: string;
};

export function LogSampleModal({
  isOpen,
  onClose,
  products
}: {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
}) {
  const router = useRouter();

  // Products with available stock
  const availableProducts = useMemo(
    () => products.filter(p => p.availableStrips > 0),
    [products]
  );

  // 1. Product state
  const [selectedProductId, setSelectedProductId] = useState<string>(
    availableProducts[0]?.id ?? products[0]?.id ?? ''
  );
  const [productSearch, setProductSearch] = useState('');
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const productDropdownRef = useRef<HTMLDivElement>(null);

  // 2. Doctor Directory state
  const [doctors, setDoctors] = useState<Customer[]>([]);
  const [selectedDoctorName, setSelectedDoctorName] = useState('');
  const [doctorSearch, setDoctorSearch] = useState('');
  const [isDoctorDropdownOpen, setIsDoctorDropdownOpen] = useState(false);
  const doctorDropdownRef = useRef<HTMLDivElement>(null);

  // Inline Quick Add Doctor state
  const [showAddDoctor, setShowAddDoctor] = useState(false);
  const [newDoctorName, setNewDoctorName] = useState('');
  const [isAddingDoctor, setIsAddingDoctor] = useState(false);

  // 3. Medical Representative (MR) state
  const [representatives, setRepresentatives] = useState<Representative[]>([]);
  const [selectedMrName, setSelectedMrName] = useState('');
  const [mrSearch, setMrSearch] = useState('');
  const [isMrDropdownOpen, setIsMrDropdownOpen] = useState(false);
  const mrDropdownRef = useRef<HTMLDivElement>(null);

  // 4. Unit of Measurement & Quantity
  const [unitType, setUnitType] = useState<UnitType>('Strips');
  const [quantity, setQuantity] = useState<string>('2');
  const [note, setNote] = useState('');

  // 5. Live FEFO Preview state
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  // 6. Submission & Feedback
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successResult, setSuccessResult] = useState<{
    referenceId: string;
    productName: string;
    doctorName: string;
    mrName: string;
    unitType: string;
    quantity: number;
    quantityStrips: number;
  } | null>(null);

  // Selected product metadata
  const selectedProduct = useMemo(
    () => products.find(p => p.id === selectedProductId) ?? products[0],
    [products, selectedProductId]
  );

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        productDropdownRef.current &&
        !productDropdownRef.current.contains(event.target as Node)
      ) {
        setIsProductDropdownOpen(false);
      }
      if (
        doctorDropdownRef.current &&
        !doctorDropdownRef.current.contains(event.target as Node)
      ) {
        setIsDoctorDropdownOpen(false);
      }
      if (
        mrDropdownRef.current &&
        !mrDropdownRef.current.contains(event.target as Node)
      ) {
        setIsMrDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch doctors and representatives on modal open
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;

    // Fetch doctors from customer directory (type=Doctor or all)
    fetch(`${apiUrl}/inventory/customers`, { credentials: 'include' })
      .then(res => (res.ok ? res.json() : []))
      .then((data: Customer[]) => {
        if (!isMounted) return;
        if (Array.isArray(data)) {
          // Doctors or all clients
          const docList = data.filter(c => c.type === 'Doctor');
          const finalDocs = docList.length > 0 ? docList : data;
          setDoctors(finalDocs);
          if (finalDocs.length > 0 && !selectedDoctorName) {
            setSelectedDoctorName(finalDocs[0].name);
            setDoctorSearch(finalDocs[0].name);
          }
        }
      })
      .catch(() => {});

    // Fetch representatives
    fetch(`${apiUrl}/inventory/representatives`, { credentials: 'include' })
      .then(res => (res.ok ? res.json() : []))
      .then((data: Representative[]) => {
        if (!isMounted) return;
        if (Array.isArray(data) && data.length > 0) {
          setRepresentatives(data);
          if (!selectedMrName) {
            setSelectedMrName(data[0].name);
            setMrSearch(data[0].name);
          }
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Derived Effective Strips & Packaging Math
  const calc = useMemo(() => {
    const rawQty = Math.max(1, parseInt(quantity, 10) || 1);
    const stripsPerBox = selectedProduct?.stripsPerBox || 10;
    const effectiveStrips = unitType === 'Boxes' ? rawQty * stripsPerBox : rawQty;
    const availableStock = selectedProduct?.availableStrips ?? 0;
    const isExceeding = effectiveStrips > availableStock;

    return {
      rawQty,
      unitType,
      stripsPerBox,
      effectiveStrips,
      availableStock,
      isExceeding
    };
  }, [quantity, unitType, selectedProduct]);

  // Trigger live FEFO batch preview
  useEffect(() => {
    if (!isOpen || !selectedProductId || calc.effectiveStrips <= 0) {
      setPreview(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsPreviewing(true);
      try {
        const response = await fetch(
          `${apiUrl}/inventory/dispatch-preview?productId=${encodeURIComponent(
            selectedProductId
          )}&billedStrips=${calc.effectiveStrips}`,
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
  }, [isOpen, selectedProductId, calc.effectiveStrips]);

  if (!isOpen) return null;

  // Filtered Products for Searchable Dropdown
  const filteredProducts = products.filter(p => {
    const term = productSearch.toLowerCase().trim();
    if (!term) return true;
    return (
      p.name.toLowerCase().includes(term) ||
      p.code.toLowerCase().includes(term) ||
      (p.composition && p.composition.toLowerCase().includes(term))
    );
  });

  // Filtered Doctors for Searchable Dropdown
  const filteredDoctors = doctors.filter(d => {
    const term = doctorSearch.toLowerCase().trim();
    if (!term) return true;
    return d.name.toLowerCase().includes(term);
  });

  // Filtered MRs for Searchable Dropdown
  const filteredReps = representatives.filter(r => {
    const term = mrSearch.toLowerCase().trim();
    if (!term) return true;
    return r.name.toLowerCase().includes(term);
  });

  // Handle Quick Add Doctor
  async function handleAddDoctor() {
    if (!newDoctorName.trim()) return;
    setIsAddingDoctor(true);
    try {
      const response = await fetch(`${apiUrl}/inventory/customers`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newDoctorName.trim(),
          type: 'Doctor'
        })
      });
      if (response.ok) {
        const created: Customer = await response.json();
        setDoctors(prev => [created, ...prev.filter(d => d.name !== created.name)]);
        setSelectedDoctorName(created.name);
        setDoctorSearch(created.name);
        setShowAddDoctor(false);
        setNewDoctorName('');
        setIsDoctorDropdownOpen(false);
      }
    } catch {
      // Local fallback
      setSelectedDoctorName(newDoctorName.trim());
      setDoctorSearch(newDoctorName.trim());
      setShowAddDoctor(false);
    } finally {
      setIsAddingDoctor(false);
    }
  }

  // Handle Form Submission
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProductId) {
      setErrorMessage('Please select a product from inventory.');
      return;
    }
    const doctorName = (selectedDoctorName || doctorSearch).trim();
    if (!doctorName) {
      setErrorMessage('Please specify or select a recipient physician / doctor.');
      return;
    }
    const mrName = (selectedMrName || mrSearch).trim();
    if (!mrName) {
      setErrorMessage('Please specify or select the Medical Representative (MR).');
      return;
    }
    if (calc.effectiveStrips <= 0) {
      setErrorMessage('Sample quantity must be at least 1.');
      return;
    }
    if (calc.isExceeding) {
      setErrorMessage(
        `Requested ${numberFormat.format(
          calc.effectiveStrips
        )} strips exceeds available non-expired stock (${numberFormat.format(
          calc.availableStock
        )} strips).`
      );
      return;
    }

    const payload = {
      productId: selectedProductId,
      doctorName,
      mrName,
      unitType,
      quantity: calc.rawQty,
      quantityStrips: calc.effectiveStrips,
      note: note.trim() || undefined,
      idempotencyKey: idempotencyKey()
    };

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const response = await fetch(`${apiUrl}/inventory/samples`, {
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
            : detail || 'Failed to record physician sample.'
        );
      }

      setSuccessResult({
        referenceId: body.referenceId ?? `SMP-${Date.now()}`,
        productName: selectedProduct?.name ?? 'Sample Product',
        doctorName,
        mrName,
        unitType,
        quantity: calc.rawQty,
        quantityStrips: calc.effectiveStrips
      });

      window.setTimeout(() => {
        router.refresh();
      }, 1200);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Sample logging failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="entry-dialog log-sample-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sample-modal-title"
        style={{ width: 'min(760px, 98%)', maxWidth: '760px' }}
      >
        {/* Header */}
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px 24px',
            borderBottom: '1px solid var(--line)',
            background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)',
            color: '#fff'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.15)',
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
            >
              <Stethoscope size={24} />
            </div>
            <div>
              <p className="eyebrow" style={{ color: '#a7f3d0', margin: '0 0 2px' }}>
                Promotional & Detailing Stock · Non-Commercial FEFO
              </p>
              <h2 id="sample-modal-title" style={{ margin: 0, fontSize: '19px', fontWeight: 800 }}>
                Log MR Sample (Physician Distribution)
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

        {/* Success View */}
        {successResult ? (
          <div style={{ padding: '36px 28px', textAlign: 'center' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                margin: '0 auto 16px',
                borderRadius: '50%',
                background: '#ecfdf5',
                color: '#059669',
                display: 'grid',
                placeItems: 'center',
                border: '1px solid #a7f3d0'
              }}
            >
              <CheckCircle2 size={38} />
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 8px', color: '#064e3b' }}>
              Physician Sample Deducted & Logged!
            </h3>
            <p
              style={{
                color: '#475569',
                fontSize: '14px',
                maxWidth: '520px',
                margin: '0 auto 20px',
                lineHeight: 1.6
              }}
            >
              Successfully logged <strong>{successResult.quantity} {successResult.unitType.toLowerCase()}</strong> ({successResult.quantityStrips} total strips) of <strong>{successResult.productName}</strong> handed over to <strong>{successResult.doctorName}</strong> by representative <strong>{successResult.mrName}</strong>.
            </p>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                background: '#f1f5f9',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#334155',
                marginBottom: '24px'
              }}
            >
              <span>Reference: {successResult.referenceId}</span>
              <span>·</span>
              <span style={{ color: '#059669' }}>Non-Commercial Expense Ledger</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
              <button
                type="button"
                className="submit-button"
                style={{ background: '#059669' }}
                onClick={() => {
                  setSuccessResult(null);
                  setQuantity('2');
                  setUnitType('Strips');
                  setNote('');
                }}
              >
                Log Another Sample
              </button>
              <button type="button" className="cancel-button" onClick={onClose}>
                Done & View Ledger
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: '22px 24px' }}>
            {/* Non-commercial info badge */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '8px',
                color: '#166534',
                fontSize: '13px',
                marginBottom: '18px'
              }}
            >
              <Sparkles size={16} style={{ flexShrink: 0, color: '#16a34a' }} />
              <span>
                <strong>Non-commercial stock deduction:</strong> Samples deduct batch stock via FEFO under <em>Promotional / Sample Expense</em> without generating invoices or customer billing.
              </span>
            </div>

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

            {/* Field 1: Product Name (Searchable Combobox) */}
            <div style={{ marginBottom: '18px' }}>
              <label
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontWeight: 600,
                  fontSize: '13px',
                  marginBottom: '6px'
                }}
              >
                <span>Product Name (Active Inventory)</span>
                {selectedProduct && (
                  <span
                    style={{
                      fontSize: '12px',
                      color: selectedProduct.availableStrips > 0 ? '#059669' : '#dc2626',
                      fontWeight: 600
                    }}
                  >
                    {selectedProduct.availableStrips > 0
                      ? `${numberFormat.format(selectedProduct.availableStrips)} strips available (${Math.floor(selectedProduct.availableStrips / (selectedProduct.stripsPerBox || 10))} boxes)`
                      : 'Out of Stock'}
                  </span>
                )}
              </label>

              <div ref={productDropdownRef} style={{ position: 'relative' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    border: '1px solid var(--line)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    background: 'var(--panel)',
                    cursor: 'pointer'
                  }}
                  onClick={() => setIsProductDropdownOpen(prev => !prev)}
                >
                  <Package size={18} style={{ color: '#059669', marginRight: '8px' }} />
                  <input
                    type="text"
                    value={
                      isProductDropdownOpen
                        ? productSearch
                        : selectedProduct ? `${selectedProduct.name} (${selectedProduct.code})` : ''
                    }
                    placeholder="Search product name or code…"
                    onChange={e => {
                      setProductSearch(e.target.value);
                      setIsProductDropdownOpen(true);
                    }}
                    onFocus={() => {
                      setProductSearch('');
                      setIsProductDropdownOpen(true);
                    }}
                    style={{
                      flex: 1,
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      fontSize: '14px',
                      fontWeight: 600
                    }}
                  />
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    {isProductDropdownOpen ? '▲' : '▼'}
                  </span>
                </div>

                {isProductDropdownOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      maxHeight: '220px',
                      overflowY: 'auto',
                      background: '#ffffff',
                      border: '1px solid var(--line)',
                      borderRadius: '8px',
                      marginTop: '4px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                      zIndex: 30
                    }}
                  >
                    {filteredProducts.length === 0 ? (
                      <div style={{ padding: '12px 14px', fontSize: '13px', color: '#64748b' }}>
                        No matching products found.
                      </div>
                    ) : (
                      filteredProducts.map(p => {
                        const isAvailable = p.availableStrips > 0;
                        const isSelected = p.id === selectedProductId;
                        return (
                          <div
                            key={p.id}
                            onClick={() => {
                              setSelectedProductId(p.id);
                              setProductSearch('');
                              setIsProductDropdownOpen(false);
                            }}
                            style={{
                              padding: '10px 14px',
                              borderBottom: '1px solid #f1f5f9',
                              cursor: 'pointer',
                              background: isSelected ? '#f0fdf4' : 'transparent',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a' }}>
                                {p.name}
                              </div>
                              <div style={{ fontSize: '11px', color: '#64748b' }}>
                                Code: {p.code} · {p.stripsPerBox || 10} strips/box {p.composition ? `· ${p.composition}` : ''}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  background: isAvailable ? '#ecfdf5' : '#fef2f2',
                                  color: isAvailable ? '#059669' : '#dc2626'
                                }}
                              >
                                {isAvailable
                                  ? `${numberFormat.format(p.availableStrips)} in stock`
                                  : '0 in stock'}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Field 2 & Field 3: Doctor Name & MR Name in 2 Columns */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '16px',
                marginBottom: '18px'
              }}
            >
              {/* Doctor Name (Searchable Combobox + Quick Add) */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px'
                  }}
                >
                  <label style={{ fontWeight: 600, fontSize: '13px' }}>
                    Recipient Doctor Name
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddDoctor(prev => !prev)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#059669',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: 0
                    }}
                  >
                    <Plus size={14} />
                    {showAddDoctor ? 'Cancel' : 'New Doctor'}
                  </button>
                </div>

                {showAddDoctor ? (
                  <div
                    style={{
                      padding: '12px',
                      background: '#f8fafc',
                      borderRadius: '8px',
                      border: '1px dashed #cbd5e1'
                    }}
                  >
                    <p style={{ margin: '0 0 6px', fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                      Register New Physician
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        placeholder="e.g. Dr. K. N. Rao, MBBS"
                        value={newDoctorName}
                        onChange={e => setNewDoctorName(e.target.value)}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          border: '1px solid var(--line)',
                          borderRadius: '6px',
                          fontSize: '13px'
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleAddDoctor}
                        disabled={isAddingDoctor || !newDoctorName.trim()}
                        style={{
                          padding: '6px 12px',
                          background: '#059669',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {isAddingDoctor ? 'Adding…' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div ref={doctorDropdownRef} style={{ position: 'relative' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        border: '1px solid var(--line)',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        background: 'var(--panel)',
                        cursor: 'pointer'
                      }}
                      onClick={() => setIsDoctorDropdownOpen(prev => !prev)}
                    >
                      <UserCheck size={18} style={{ color: '#059669', marginRight: '8px' }} />
                      <input
                        type="text"
                        value={doctorSearch}
                        placeholder="Type doctor name to search or add…"
                        onChange={e => {
                          setDoctorSearch(e.target.value);
                          setSelectedDoctorName(e.target.value);
                          setIsDoctorDropdownOpen(true);
                        }}
                        onFocus={() => setIsDoctorDropdownOpen(true)}
                        style={{
                          flex: 1,
                          border: 'none',
                          outline: 'none',
                          background: 'transparent',
                          fontSize: '14px',
                          fontWeight: 500
                        }}
                      />
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        {isDoctorDropdownOpen ? '▲' : '▼'}
                      </span>
                    </div>

                    {isDoctorDropdownOpen && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          maxHeight: '200px',
                          overflowY: 'auto',
                          background: '#ffffff',
                          border: '1px solid var(--line)',
                          borderRadius: '8px',
                          marginTop: '4px',
                          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                          zIndex: 25
                        }}
                      >
                        {filteredDoctors.length === 0 ? (
                          <div
                            style={{
                              padding: '10px 14px',
                              fontSize: '13px',
                              color: '#64748b',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <span>Use &quot;{doctorSearch}&quot; as doctor name</span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDoctorName(doctorSearch);
                                setIsDoctorDropdownOpen(false);
                              }}
                              style={{
                                padding: '2px 8px',
                                background: '#059669',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '11px',
                                cursor: 'pointer'
                              }}
                            >
                              Select
                            </button>
                          </div>
                        ) : (
                          filteredDoctors.map(d => (
                            <div
                              key={d.id}
                              onClick={() => {
                                setSelectedDoctorName(d.name);
                                setDoctorSearch(d.name);
                                setIsDoctorDropdownOpen(false);
                              }}
                              style={{
                                padding: '8px 14px',
                                borderBottom: '1px solid #f1f5f9',
                                cursor: 'pointer',
                                background: selectedDoctorName === d.name ? '#f0fdf4' : 'transparent',
                                fontSize: '13px',
                                fontWeight: 500,
                                display: 'flex',
                                justifyContent: 'space-between'
                              }}
                            >
                              <span>{d.name}</span>
                              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Physician</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* MR Name (Searchable Combobox) */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    fontSize: '13px',
                    marginBottom: '6px'
                  }}
                >
                  Medical Representative (MR)
                </label>

                <div ref={mrDropdownRef} style={{ position: 'relative' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      border: '1px solid var(--line)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      background: 'var(--panel)',
                      cursor: 'pointer'
                    }}
                    onClick={() => setIsMrDropdownOpen(prev => !prev)}
                  >
                    <User size={18} style={{ color: '#059669', marginRight: '8px' }} />
                    <input
                      type="text"
                      value={mrSearch}
                      placeholder="Type MR name or pick representative…"
                      onChange={e => {
                        setMrSearch(e.target.value);
                        setSelectedMrName(e.target.value);
                        setIsMrDropdownOpen(true);
                      }}
                      onFocus={() => setIsMrDropdownOpen(true)}
                      style={{
                        flex: 1,
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        fontSize: '14px',
                        fontWeight: 500
                      }}
                    />
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      {isMrDropdownOpen ? '▲' : '▼'}
                    </span>
                  </div>

                  {isMrDropdownOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        maxHeight: '200px',
                        overflowY: 'auto',
                        background: '#ffffff',
                        border: '1px solid var(--line)',
                        borderRadius: '8px',
                        marginTop: '4px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                        zIndex: 25
                      }}
                    >
                      {filteredReps.length === 0 ? (
                        <div
                          style={{
                            padding: '10px 14px',
                            fontSize: '13px',
                            color: '#64748b',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <span>Use &quot;{mrSearch}&quot; as representative</span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedMrName(mrSearch);
                              setIsMrDropdownOpen(false);
                            }}
                            style={{
                              padding: '2px 8px',
                              background: '#059669',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                          >
                            Select
                          </button>
                        </div>
                      ) : (
                        filteredReps.map(r => (
                          <div
                            key={r.id}
                            onClick={() => {
                              setSelectedMrName(r.name);
                              setMrSearch(r.name);
                              setIsMrDropdownOpen(false);
                            }}
                            style={{
                              padding: '8px 14px',
                              borderBottom: '1px solid #f1f5f9',
                              cursor: 'pointer',
                              background: selectedMrName === r.name ? '#f0fdf4' : 'transparent',
                              fontSize: '13px',
                              fontWeight: 500,
                              display: 'flex',
                              justifyContent: 'space-between'
                            }}
                          >
                            <span>{r.name}</span>
                            <span style={{ fontSize: '11px', color: '#059669', fontWeight: 600 }}>
                              {r.role || 'MR'}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Field 4 & Field 5: Flexible Unit Type (Strips vs Boxes) & Quantity */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '16px',
                padding: '16px',
                background: '#f8fafc',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                marginBottom: '18px'
              }}
            >
              {/* Unit Type (UOM Toggle) */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    fontSize: '13px',
                    marginBottom: '8px',
                    color: '#334155'
                  }}
                >
                  Unit Type (Packaging UOM)
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setUnitType('Strips')}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: unitType === 'Strips' ? '2px solid #059669' : '1px solid #cbd5e1',
                      background: unitType === 'Strips' ? '#ecfdf5' : '#ffffff',
                      color: unitType === 'Strips' ? '#065f46' : '#64748b',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <Layers size={16} />
                    <span>Strips (Detailing)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUnitType('Boxes')}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: unitType === 'Boxes' ? '2px solid #059669' : '1px solid #cbd5e1',
                      background: unitType === 'Boxes' ? '#ecfdf5' : '#ffffff',
                      color: unitType === 'Boxes' ? '#065f46' : '#64748b',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <Box size={16} />
                    <span>Full Boxes (Courtesy/Evaluation)</span>
                  </button>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#64748b' }}>
                  {unitType === 'Strips'
                    ? 'Routine doctor detailing: 1–2 individual test strips.'
                    : `Special courtesy or clinic trial: 1 box = ${calc.stripsPerBox} strips.`}
                </p>
              </div>

              {/* Quantity Handed Over */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    fontSize: '13px',
                    marginBottom: '8px',
                    color: '#334155'
                  }}
                >
                  Quantity Handed Over ({unitType})
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    required
                    style={{
                      width: '100px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--line)',
                      fontSize: '15px',
                      fontWeight: 700,
                      textAlign: 'center'
                    }}
                  />
                  <div
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      background: '#ffffff',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      fontSize: '12px',
                      color: '#334155'
                    }}
                  >
                    <strong>Conversion: </strong>
                    {unitType === 'Boxes' ? (
                      <span style={{ color: '#059669', fontWeight: 600 }}>
                        {calc.rawQty} boxes × {calc.stripsPerBox} strips = <strong>{numberFormat.format(calc.effectiveStrips)} strips</strong> to deduct
                      </span>
                    ) : (
                      <span style={{ color: '#059669', fontWeight: 600 }}>
                        {calc.effectiveStrips} individual strip{calc.effectiveStrips > 1 ? 's' : ''} to deduct
                      </span>
                    )}
                  </div>
                </div>

                {calc.isExceeding && (
                  <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#dc2626', fontWeight: 600 }}>
                    ⚠ Exceeds available batch stock ({numberFormat.format(calc.availableStock)} strips).
                  </p>
                )}
              </div>
            </div>

            {/* Field 6: Remarks / Allocation Note */}
            <div style={{ marginBottom: '18px' }}>
              <label
                style={{
                  display: 'block',
                  fontWeight: 600,
                  fontSize: '13px',
                  marginBottom: '6px'
                }}
              >
                Remarks / Allocation Note (Optional)
              </label>
              <textarea
                rows={2}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. Provided 3 boxes for personal/courtesy evaluation upon doctor's request during clinic visit"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Live FEFO Batch Deduction Card */}
            {preview && (
              <div
                style={{
                  marginBottom: '20px',
                  padding: '14px 16px',
                  borderRadius: '8px',
                  border: preview.sufficient ? '1px solid #bbf7d0' : '1px solid #fecdd3',
                  background: preview.sufficient ? '#f0fdf4' : '#fff1f2'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={16} style={{ color: preview.sufficient ? '#059669' : '#dc2626' }} />
                    <strong style={{ fontSize: '13px', color: preview.sufficient ? '#166534' : '#991b1b' }}>
                      {preview.sufficient
                        ? 'FEFO Batch Allocation (Nearest Expiry First)'
                        : 'Insufficient Available Stock'}
                    </strong>
                  </div>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: preview.sufficient ? '#059669' : '#dc2626'
                    }}
                  >
                    −{numberFormat.format(calc.effectiveStrips)} strips leaving stock
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {preview.allocations.map(alloc => (
                    <div
                      key={alloc.batchNumber}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '12px',
                        background: '#ffffff',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #e2e8f0'
                      }}
                    >
                      <div>
                        <strong>Batch {alloc.batchNumber}</strong>
                        <span style={{ color: '#64748b', marginLeft: '6px' }}>
                          (Exp: {new Date(alloc.expiryDate).toLocaleDateString('en-IN', {
                            month: 'short',
                            year: 'numeric'
                          })})
                        </span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ color: '#dc2626', fontWeight: 700 }}>
                          −{alloc.quantityStrips} strips
                        </span>
                        <span style={{ color: '#64748b', marginLeft: '6px' }}>
                          ({alloc.availableAfterStrips} left)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {!preview.sufficient && (
                  <p
                    style={{
                      margin: '10px 0 0',
                      fontSize: '12px',
                      color: '#dc2626',
                      fontWeight: 600
                    }}
                  >
                    Short by {numberFormat.format(preview.shortfallStrips)} strips. Receive new stock or reduce sample quantity.
                  </p>
                )}
              </div>
            )}

            {/* Footer Buttons */}
            <footer
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                paddingTop: '14px',
                borderTop: '1px solid var(--line)'
              }}
            >
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
                style={{ background: '#059669', color: '#fff' }}
                disabled={
                  isSubmitting ||
                  calc.isExceeding ||
                  calc.effectiveStrips <= 0 ||
                  preview?.sufficient === false
                }
              >
                {isSubmitting ? 'Deducting & Logging…' : 'Confirm Sample Allocation'}
              </button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}
