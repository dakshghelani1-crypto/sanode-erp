/**
 * PharmaStock Pro - Strip-Level Precision Inventory Management System
 * Core Philosophy: Every single strip is tracked atomically.
 * Seamlessly handles Decimal Boxes (e.g. 2.5 boxes = 25 strips), 
 * Doctor Orders, MR Samples, Inward Stock, and Delivery Challans.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'pharmastock_inventory_data_v3';
  const LEGACY_STORAGE_KEY = 'pharmastock_inventory_data_v2';
  const DIRECTORY_KEY = 'pharmastock_directory_v3';
  const LEGACY_DIRECTORY_KEY = 'pharmastock_directory_v2';
  const EXPIRY_WARNING_DAYS = 90;

  // Default seed of 6 pharma formulations
  const DEFAULT_MEDICINES = [
    {
      id: 'med-1',
      name: 'Cefixime 200mg Tablets',
      brand: 'CefiMax-200',
      salt: 'Cefixime IP 200mg (Cephalosporin Antibiotic)',
      stripsPerBox: 10,
      totalStrips: 5000, // 500 full boxes as in user's audio example!
      batchNo: 'CF-9021',
      expiry: '2027-08',
      minAlertStrips: 50
    },
    {
      id: 'med-2',
      name: 'Pantoprazole + Domperidone DSR',
      brand: 'PantoDSR-Cap',
      salt: 'Pantoprazole 40mg + Domperidone 30mg SR',
      stripsPerBox: 10,
      totalStrips: 283, // Reconciles with the seeded sale (25) and sample (2) ledger entries
      batchNo: 'PT-8412',
      expiry: '2027-11',
      minAlertStrips: 40
    },
    {
      id: 'med-3',
      name: 'Paracetamol 650mg Tablets',
      brand: 'ParaPure-650',
      salt: 'Paracetamol IP 650mg (Analgesic / Antipyretic)',
      stripsPerBox: 10,
      totalStrips: 4000, // 400 boxes
      batchNo: 'PR-1102',
      expiry: '2028-02',
      minAlertStrips: 50
    },
    {
      id: 'med-4',
      name: 'Amoxicillin & Clavulanate 625mg',
      brand: 'ClavamStrong-625',
      salt: 'Amoxicillin 500mg + Potassium Clavulanate 125mg',
      stripsPerBox: 10,
      totalStrips: 1800, // 180 boxes
      batchNo: 'CL-7741',
      expiry: '2027-05',
      minAlertStrips: 30
    },
    {
      id: 'med-5',
      name: 'Montelukast & Levocetirizine',
      brand: 'Montair-L',
      salt: 'Montelukast Sodium 10mg + Levocetirizine 5mg',
      stripsPerBox: 10,
      totalStrips: 2200, // 220 boxes
      batchNo: 'ML-3920',
      expiry: '2027-10',
      minAlertStrips: 40
    },
    {
      id: 'med-6',
      name: 'Multivitamin & Zinc Softgels',
      brand: 'VitaZinc-9 Active',
      salt: 'Multivitamins, Minerals, Ginseng & Zinc',
      stripsPerBox: 10,
      totalStrips: 3400, // 340 boxes
      batchNo: 'VZ-5509',
      expiry: '2028-01',
      minAlertStrips: 50
    }
  ];

  // Initial Sample Transactions
  const DEFAULT_TRANSACTIONS = [
    {
      id: 'tx-101',
      timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
      type: 'INWARD',
      medicineId: 'med-1',
      medicineName: 'Cefixime 200mg Tablets',
      qtyStrips: 5000,
      breakdownText: '500.0 Boxes (5000 strips)',
      recipient: 'Sanode Central Depot',
      notes: 'Initial opening stock batch CF-9021',
      stockAfterStrips: 5000,
      stockAfterBreakdown: '500 Full Boxes'
    },
    {
      id: 'tx-102',
      timestamp: new Date(Date.now() - 3600000 * 8).toISOString(),
      type: 'SALE',
      medicineId: 'med-2',
      medicineName: 'Pantoprazole + Domperidone DSR',
      qtyStrips: 25, // 2.5 boxes = 25 strips!
      breakdownText: '2.5 Boxes (2 Full Boxes + 5 Loose Strips)',
      recipient: 'Dr. V. K. Patel (Apollo Clinic)',
      notes: 'Inv #INV-8891 (Doctor requested 2.5 boxes)',
      stockAfterStrips: 285,
      stockAfterBreakdown: '28 Boxes + 5 Loose'
    },
    {
      id: 'tx-103',
      timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
      type: 'SAMPLE',
      medicineId: 'med-2',
      medicineName: 'Pantoprazole + Domperidone DSR',
      qtyStrips: 2,
      breakdownText: '2 Loose Strips (Physician Sample)',
      recipient: 'Dr. Ramesh Shah (Care Hospital) [MR: Rahul]',
      notes: 'MR promotional sample for clinical trial',
      stockAfterStrips: 283,
      stockAfterBreakdown: '28 Boxes + 3 Loose'
    }
  ];

  const DEFAULT_DIRECTORY = {
    doctors: [
      'Dr. V. K. Patel (Apollo Clinic)',
      'Dr. S. Mehta (Sterling Hospital)',
      'Dr. Ramesh Shah (Care Hospital)',
      'Dr. K. Joshi (Civil Hospital)',
      'Dr. Ananya Desai (City Clinic)'
    ],
    mrs: [
      'Rahul Patel (Area 1)',
      'Amit Sharma (South Zone)',
      'Prakash Solanki (West Area)',
      'Deepak Mehta (East Area)'
    ]
  };

  // State
  let state = {
    medicines: [],
    transactions: [],
    directory: { doctors: [], mrs: [] },
    activeFilter: 'ALL',
    searchQuery: '',
    currentViewingTx: null
  };

  /* ==================== DATA INTEGRITY & BATCH LEDGER ==================== */

  function createId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function asNonNegativeInteger(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
  }

  function normalizeMonth(value) {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || '')) ? value : '';
  }

  function expiryDate(expiry) {
    const value = normalizeMonth(expiry);
    if (!value) return null;
    const [year, month] = value.split('-').map(Number);
    return new Date(year, month, 0, 23, 59, 59, 999);
  }

  function getExpiryStatus(expiry) {
    const date = expiryDate(expiry);
    if (!date) return { level: 'unknown', label: 'Expiry missing', days: null };
    const days = Math.ceil((date.getTime() - Date.now()) / 86400000);
    if (days < 0) return { level: 'expired', label: 'Expired', days };
    if (days <= EXPIRY_WARNING_DAYS) return { level: 'warning', label: `Expires in ${days}d`, days };
    return { level: 'ok', label: `Exp ${expiry}`, days };
  }

  function medicineBatches(medicine) {
    return Array.isArray(medicine.batches) ? medicine.batches : [];
  }

  function syncMedicineTotal(medicine) {
    medicine.totalStrips = medicineBatches(medicine)
      .reduce((sum, batch) => sum + asNonNegativeInteger(batch.qtyStrips), 0);
    return medicine.totalStrips;
  }

  function getBatchSummary(medicine) {
    const active = medicineBatches(medicine).filter(batch => asNonNegativeInteger(batch.qtyStrips) > 0);
    const nextBatch = [...active].sort((a, b) => {
      const aExpiry = expiryDate(a.expiry)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bExpiry = expiryDate(b.expiry)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aExpiry - bExpiry;
    })[0];
    return { active, nextBatch, earliestExpiry: nextBatch ? getExpiryStatus(nextBatch.expiry) : null };
  }

  function makeOpeningBatch(medicine) {
    return {
      id: createId('batch'),
      batchNo: String(medicine.batchNo || 'OPENING-STOCK'),
      expiry: normalizeMonth(medicine.expiry) || '',
      qtyStrips: asNonNegativeInteger(medicine.totalStrips),
      receivedAt: new Date().toISOString(),
      source: 'Migrated opening balance'
    };
  }

  function normalizeMedicine(medicine, index) {
    const normalized = { ...medicine };
    normalized.id = String(normalized.id || `med-${index + 1}`);
    normalized.name = String(normalized.name || 'Unnamed formulation').trim();
    normalized.salt = String(normalized.salt || normalized.brand || 'Standard formulation').trim();
    normalized.stripsPerBox = Math.max(1, asNonNegativeInteger(normalized.stripsPerBox, 10));
    normalized.minAlertStrips = Math.max(1, asNonNegativeInteger(normalized.minAlertStrips, normalized.stripsPerBox * 3));
    normalized.batches = medicineBatches(normalized).length
      ? medicineBatches(normalized).map((batch, batchIndex) => ({
          id: String(batch.id || `${normalized.id}-batch-${batchIndex + 1}`),
          batchNo: String(batch.batchNo || 'UNASSIGNED').trim(),
          expiry: normalizeMonth(batch.expiry),
          qtyStrips: asNonNegativeInteger(batch.qtyStrips),
          receivedAt: batch.receivedAt || new Date().toISOString(),
          source: String(batch.source || 'Imported batch')
        }))
      : [makeOpeningBatch(normalized)];
    syncMedicineTotal(normalized);
    const firstBatch = normalized.batches[0] || {};
    normalized.batchNo = firstBatch.batchNo || 'N/A';
    normalized.expiry = firstBatch.expiry || '';
    return normalized;
  }

  function normalizeState(raw) {
    const medicines = Array.isArray(raw?.medicines) ? raw.medicines : [];
    return {
      medicines: medicines.map(normalizeMedicine),
      transactions: Array.isArray(raw?.transactions) ? raw.transactions.map((tx, index) => {
        const rawQty = Number(tx.qtyStrips);
        return {
          ...tx,
          id: String(tx.id || `legacy-tx-${index + 1}`),
          qtyStrips: tx.type === 'ADJUSTMENT' && Number.isFinite(rawQty) ? Math.trunc(rawQty) : asNonNegativeInteger(rawQty),
          timestamp: tx.timestamp || new Date().toISOString()
        };
      }) : []
    };
  }

  function allocateStockFEFO(medicine, qtyStrips) {
    const requested = asNonNegativeInteger(qtyStrips);
    if (requested <= 0 || requested > syncMedicineTotal(medicine)) return null;
    let remaining = requested;
    const allocations = [];
    const sortedBatches = [...medicineBatches(medicine)].sort((a, b) => {
      const aExpiry = expiryDate(a.expiry)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bExpiry = expiryDate(b.expiry)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aExpiry - bExpiry;
    });
    for (const batch of sortedBatches) {
      if (remaining === 0) break;
      const available = asNonNegativeInteger(batch.qtyStrips);
      const taken = Math.min(available, remaining);
      if (taken > 0) {
        batch.qtyStrips = available - taken;
        allocations.push({ batchNo: batch.batchNo, expiry: batch.expiry, qtyStrips: taken });
        remaining -= taken;
      }
    }
    syncMedicineTotal(medicine);
    return allocations;
  }

  function addBatch(medicine, input) {
    const batch = {
      id: createId('batch'),
      batchNo: String(input.batchNo).trim(),
      expiry: normalizeMonth(input.expiry),
      qtyStrips: asNonNegativeInteger(input.qtyStrips),
      receivedAt: new Date().toISOString(),
      source: String(input.source).trim()
    };
    medicine.batches.push(batch);
    syncMedicineTotal(medicine);
    return batch;
  }

  /* ==================== PRECISION DUAL-UNIT MATH ==================== */

  /**
   * Fundamental unit computation:
   * Strips is atomic base.
   */
  function computeUnits(totalStrips, stripsPerBox) {
    const s = Math.max(0, parseInt(totalStrips, 10) || 0);
    const spb = Math.max(1, parseInt(stripsPerBox, 10) || 10);
    const fullBoxes = Math.floor(s / spb);
    const looseStrips = s % spb;
    const decimalBoxes = (s / spb).toFixed(1).replace(/\.0$/, '');

    return {
      totalStrips: s,
      fullBoxes: fullBoxes,
      looseStrips: looseStrips,
      decimalBoxes: decimalBoxes,
      stripsPerBox: spb,
      hasOpenBox: looseStrips > 0,
      openBoxCapacity: spb,
      openBoxFilled: looseStrips
    };
  }

  /**
   * Format friendly packaging text (e.g. "2.5 Boxes (2 Full Boxes + 5 Loose Strips)")
   */
  function formatPackagingBreakdown(strips, stripsPerBox) {
    const u = computeUnits(strips, stripsPerBox);
    if (u.looseStrips === 0) {
      return `${u.fullBoxes} ${u.fullBoxes === 1 ? 'Box' : 'Boxes'} (${strips} strips)`;
    }
    return `${u.decimalBoxes} Boxes (${u.fullBoxes} Sealed + ${u.looseStrips} Loose Strips)`;
  }

  /* ==================== PERSISTENCE ==================== */

  function loadState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      if (stored) {
        const parsed = normalizeState(JSON.parse(stored));
        if (parsed.medicines.length > 0) {
          state.medicines = parsed.medicines;
          state.transactions = parsed.transactions;
        }
      }
    } catch (e) {
      console.warn('Error loading inventory data:', e);
    }

    if (!state.medicines || state.medicines.length === 0) {
      state.medicines = DEFAULT_MEDICINES.map(normalizeMedicine);
      state.transactions = JSON.parse(JSON.stringify(DEFAULT_TRANSACTIONS));
    }

    try {
      const storedDir = localStorage.getItem(DIRECTORY_KEY) || localStorage.getItem(LEGACY_DIRECTORY_KEY);
      state.directory = storedDir ? JSON.parse(storedDir) : JSON.parse(JSON.stringify(DEFAULT_DIRECTORY));
      state.directory.doctors = Array.isArray(state.directory.doctors) ? state.directory.doctors.map(String) : [];
      state.directory.mrs = Array.isArray(state.directory.mrs) ? state.directory.mrs.map(String) : [];
    } catch (e) {
      state.directory = JSON.parse(JSON.stringify(DEFAULT_DIRECTORY));
    }

    saveState();
  }

  function saveState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          schemaVersion: 3,
          medicines: state.medicines,
          transactions: state.transactions
        })
      );
      localStorage.setItem(DIRECTORY_KEY, JSON.stringify(state.directory));
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
    renderAll();
  }

  function rememberContact(doctorName, mrName) {
    let changed = false;
    if (doctorName && !state.directory.doctors.includes(doctorName)) {
      state.directory.doctors.push(doctorName);
      changed = true;
    }
    if (mrName && !state.directory.mrs.includes(mrName)) {
      state.directory.mrs.push(mrName);
      changed = true;
    }
    if (changed) {
      try {
        localStorage.setItem(DIRECTORY_KEY, JSON.stringify(state.directory));
        updateDatalists();
      } catch (e) {}
    }
  }

  function updateDatalists() {
    const docList = document.getElementById('datalist-doctors');
    const mrList = document.getElementById('datalist-mrs');
    if (docList) {
      docList.innerHTML = state.directory.doctors.map(d => `<option value="${escapeHtml(d)}">`).join('');
    }
    if (mrList) {
      mrList.innerHTML = state.directory.mrs.map(m => `<option value="${escapeHtml(m)}">`).join('');
    }
  }

  function resetDemoData() {
    if (confirm('Reset inventory and transactions to the default 6 formulations with sample stock?')) {
      state.medicines = DEFAULT_MEDICINES.map(normalizeMedicine);
      state.transactions = JSON.parse(JSON.stringify(DEFAULT_TRANSACTIONS));
      state.directory = JSON.parse(JSON.stringify(DEFAULT_DIRECTORY));
      saveState();
      showToast('Inventory reset to 6 primary formulations!', 'success');
    }
  }

  /* ==================== RENDERING ==================== */

  function renderAll() {
    renderKPIs();
    renderAttentionQueue();
    renderMedicineGrid();
    renderLedger();
    populateSelectDropdowns();
    updateSimulatorFromStrips();
    renderManageList();
    updateDatalists();
  }

  function renderKPIs() {
    let grandTotalStrips = 0;
    let grandSealedBoxes = 0;
    let grandLooseStrips = 0;
    let grandSealedStrips = 0;
    let grandBoxEquivalents = 0;
    let activeOpenBoxesCount = 0;

    state.medicines.forEach(m => {
      const u = computeUnits(m.totalStrips, m.stripsPerBox);
      grandTotalStrips += u.totalStrips;
      grandSealedBoxes += u.fullBoxes;
      grandLooseStrips += u.looseStrips;
      grandSealedStrips += (u.fullBoxes * u.stripsPerBox);
      grandBoxEquivalents += u.totalStrips / u.stripsPerBox;
      if (u.hasOpenBox) activeOpenBoxesCount++;
    });

    let totalSampleStrips = 0;
    let sampleVisitsCount = 0;
    let totalSalesStrips = 0;
    let salesOrdersCount = 0;

    state.transactions.forEach(t => {
      if (t.type === 'SAMPLE') {
        totalSampleStrips += t.qtyStrips;
        sampleVisitsCount++;
      } else if (t.type === 'SALE') {
        totalSalesStrips += t.qtyStrips;
        salesOrdersCount++;
      }
    });

    // Update DOM
    document.getElementById('stat-total-strips').textContent = grandTotalStrips.toLocaleString();
    document.getElementById('stat-total-equiv-boxes').textContent = `${grandBoxEquivalents.toFixed(1)} package-equivalent boxes`;

    document.getElementById('stat-sealed-boxes').textContent = grandSealedBoxes.toLocaleString();
    document.getElementById('stat-sealed-strips').textContent = `${grandSealedStrips.toLocaleString()} strips sealed`;

    document.getElementById('stat-loose-strips').textContent = grandLooseStrips.toLocaleString();
    document.getElementById('stat-open-boxes-count').textContent = `In ${activeOpenBoxesCount} active open ${activeOpenBoxesCount === 1 ? 'box' : 'boxes'}`;

    document.getElementById('stat-sample-strips').textContent = totalSampleStrips.toLocaleString();
    document.getElementById('stat-sample-count').textContent = `${sampleVisitsCount} Doctor Visits logged`;

    document.getElementById('stat-sales-strips').textContent = totalSalesStrips.toLocaleString();
    document.getElementById('stat-sales-count').textContent = `${salesOrdersCount} Doctor Orders filled`;

    document.getElementById('med-count-badge').textContent = `${state.medicines.length} Formulations`;
  }

  function renderAttentionQueue() {
    const grid = document.getElementById('attention-grid');
    const badge = document.getElementById('attention-count-badge');
    if (!grid || !badge) return;

    const items = [];
    state.medicines.forEach(medicine => {
      const total = syncMedicineTotal(medicine);
      if (total <= medicine.minAlertStrips) {
        items.push({ type: total === 0 ? 'critical' : 'low', medicine, text: total === 0 ? 'Out of stock' : `${total} strips left (reorder level: ${medicine.minAlertStrips})` });
      }
      medicineBatches(medicine).filter(batch => asNonNegativeInteger(batch.qtyStrips) > 0).forEach(batch => {
        const expiry = getExpiryStatus(batch.expiry);
        if (expiry.level === 'expired' || expiry.level === 'warning' || expiry.level === 'unknown') {
          items.push({ type: expiry.level, medicine, batch, text: `${batch.qtyStrips} strips • Batch ${batch.batchNo} • ${expiry.label}` });
        }
      });
    });
    badge.textContent = `${items.length} ${items.length === 1 ? 'item' : 'items'}`;
    if (!items.length) {
      grid.innerHTML = '<div class="attention-empty">✓ All active stock is above its reorder level and no batch needs expiry attention.</div>';
      return;
    }
    grid.innerHTML = items.slice(0, 12).map(item => `
      <article class="attention-card attention-${item.type}">
        <span class="attention-label">${item.type === 'critical' ? 'Critical' : item.type === 'low' ? 'Reorder' : item.type === 'expired' ? 'Expired' : 'Expiry check'}</span>
        <strong>${escapeHtml(item.medicine.name)}</strong>
        <span>${escapeHtml(item.text)}</span>
      </article>`).join('');
  }

  function renderMedicineGrid() {
    const grid = document.getElementById('medicine-grid');
    if (!grid) return;

    const query = state.searchQuery.toLowerCase().trim();
    const filteredMeds = state.medicines.filter(m => {
      if (!query) return true;
      return (
        m.name.toLowerCase().includes(query) ||
        (m.brand && m.brand.toLowerCase().includes(query)) ||
        (m.salt && m.salt.toLowerCase().includes(query)) ||
        (m.batchNo && m.batchNo.toLowerCase().includes(query))
      );
    });

    if (filteredMeds.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted); background: var(--bg-surface); border-radius: var(--radius-md);">
          No medicine matching "<strong>${escapeHtml(query)}</strong>" found.
        </div>
      `;
      return;
    }

    grid.innerHTML = filteredMeds.map(m => {
      syncMedicineTotal(m);
      const u = computeUnits(m.totalStrips, m.stripsPerBox);
      const batchSummary = getBatchSummary(m);
      
      let statusClass = 'status-ok';
      let statusText = 'In Stock';
      if (m.totalStrips === 0) {
        statusClass = 'status-out';
        statusText = 'Out of Stock';
      } else if (m.totalStrips <= (m.minAlertStrips || 30)) {
        statusClass = 'status-low';
        statusText = 'Low Stock';
      }

      // Visual meter segments for open box
      let segmentsHtml = '';
      const slots = Math.min(u.stripsPerBox, 15);
      for (let i = 0; i < slots; i++) {
        const isFilled = i < u.looseStrips;
        segmentsHtml += `<div class="meter-segment ${isFilled ? 'filled' : 'empty'}" title="${isFilled ? 'Available loose strip in open box' : 'Dispensed strip'}"></div>`;
      }

      return `
        <div class="med-card" id="card-${m.id}">
          <div class="med-card-header">
            <div class="med-name-group">
              <h3 class="med-name">${escapeHtml(m.name)}</h3>
              <span class="med-salt">${escapeHtml(m.salt || m.brand || '')}</span>
            </div>
            <span class="med-pack-pill" title="Packaging Rule">1 Box = ${u.stripsPerBox} Strips</span>
          </div>

          <div class="med-meta-row">
            <span>Batches: <strong style="color: var(--text-primary);">${batchSummary.active.length}</strong></span>
            <span>Next exp: <strong style="color: var(--text-primary);">${escapeHtml(batchSummary.nextBatch?.expiry || 'N/A')}</strong></span>
            <span class="stock-status-pill ${statusClass}">${statusText}</span>
          </div>

          <!-- Stock Breakdown Section (Strip-First Display) -->
          <div class="med-stock-breakdown">
            <div class="stock-headline">
              <div class="stock-total-group">
                <span class="stock-total-strips">${u.totalStrips.toLocaleString()}</span>
                <span class="stock-total-label">Strips in Stock</span>
              </div>
              <span class="stock-equiv-pill" title="Decimal Box Equivalent">
                ${u.decimalBoxes} Boxes
              </span>
            </div>

            <!-- Dual Units Split Cards -->
            <div class="stock-units-split">
              <div class="unit-split-box">
                <span class="unit-split-label">Sealed Full Boxes</span>
                <span class="unit-split-val">${u.fullBoxes}</span>
                <span class="unit-split-sub">(${u.fullBoxes * u.stripsPerBox} strips)</span>
              </div>
              <div class="unit-split-box">
                <span class="unit-split-label">Loose Strips (Open Box)</span>
                <span class="unit-split-val">${u.looseStrips}</span>
                <span class="unit-split-sub">out of ${u.stripsPerBox} max</span>
              </div>
            </div>

            <!-- Open Box Visual Strip Meter -->
            <div class="open-box-meter-wrap">
              <div class="meter-header">
                <span>Current Open Box:</span>
                <span><strong>${u.looseStrips}</strong> of ${u.stripsPerBox} strips remaining</span>
              </div>
              <div class="meter-segments">
                ${segmentsHtml}
              </div>
            </div>
          </div>

          <!-- Card Actions -->
          <div class="med-card-actions">
            <button class="card-action-btn btn-card-sale" data-action="sale" data-id="${m.id}" title="Sell to Doctor (Decimal Boxes / Strips)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
              <span>+ Order / Sale</span>
            </button>
            <button class="card-action-btn btn-card-sample" data-action="sample" data-id="${m.id}" title="MR Doctor Sample">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/></svg>
              <span>MR Sample</span>
            </button>
            <button class="card-action-btn btn-card-restock" data-action="inward" data-id="${m.id}" title="Restock / Inward Stock">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/></svg>
              <span>Restock</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach click events on card action buttons
    grid.querySelectorAll('.card-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const medId = btn.dataset.id;
        if (action === 'sale') openSaleModal(medId);
        if (action === 'sample') openSampleModal(medId);
        if (action === 'inward') openInwardModal(medId);
      });
    });
  }

  function renderLedger() {
    const tbody = document.getElementById('ledger-table-body');
    const badge = document.getElementById('ledger-count-badge');
    if (!tbody) return;

    let filtered = [...state.transactions].reverse();

    if (state.activeFilter !== 'ALL') {
      filtered = filtered.filter(t => t.type === state.activeFilter);
    }

    badge.textContent = `${filtered.length} Logs`;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 36px; color: var(--text-muted);">
            No transaction records found matching active filter.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(t => {
      const dateStr = formatDateTime(t.timestamp);
      
      let typePill = '';
      if (t.type === 'SALE') {
        typePill = `<span class="pill-type type-sale">🩺 Sale</span>`;
      } else if (t.type === 'SAMPLE') {
        typePill = `<span class="pill-type type-sample">🎁 MR Sample</span>`;
      } else if (t.type === 'INWARD') {
        typePill = `<span class="pill-type type-inward">📥 Inward</span>`;
      } else {
        typePill = `<span class="pill-type type-adjustment">↺ Adjustment</span>`;
      }

      return `
        <tr>
          <td style="color: var(--text-secondary); white-space: nowrap;">${dateStr}</td>
          <td>${typePill}</td>
          <td><strong style="color: #fff;">${escapeHtml(t.medicineName)}</strong></td>
          <td><span class="qty-display">${t.type === 'INWARD' || (t.type === 'ADJUSTMENT' && t.qtyStrips >= 0) ? '+' : '-'}${Math.abs(t.qtyStrips)} strips</span></td>
          <td><span class="breakdown-tag">${escapeHtml(t.breakdownText || '')}</span></td>
          <td><span style="font-weight: 600;">${escapeHtml(t.recipient || '-')}</span></td>
          <td style="color: var(--text-secondary); font-size: 12px;">${escapeHtml(t.notes || '-')}</td>
          <td>
            <span style="font-family: var(--font-mono); font-size: 12px; color: var(--teal);">
              ${t.stockAfterStrips} strips (${t.stockAfterBreakdown || ''})
            </span>
          </td>
          <td>
            <div class="table-actions">
              <button class="btn-action-icon btn-action-whatsapp" data-txid="${t.id}" title="Share Dispatch on WhatsApp">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              </button>
              <button class="btn-action-icon btn-action-print" data-txid="${t.id}" title="Print Delivery Slip / Challan">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach actions
    tbody.querySelectorAll('.btn-action-whatsapp').forEach(btn => {
      btn.addEventListener('click', () => {
        const txId = btn.dataset.txid;
        const tx = state.transactions.find(x => x.id === txId);
        if (tx) shareTxOnWhatsApp(tx);
      });
    });

    tbody.querySelectorAll('.btn-action-print').forEach(btn => {
      btn.addEventListener('click', () => {
        const txId = btn.dataset.txid;
        const tx = state.transactions.find(x => x.id === txId);
        if (tx) openChallanModal(tx);
      });
    });
  }

  function populateSelectDropdowns() {
    const saleSelect = document.getElementById('sale-medicine-select');
    const sampleSelect = document.getElementById('sample-medicine-select');
    const inwardSelect = document.getElementById('inward-medicine-select');
    const simSelect = document.getElementById('sim-med-select');
    const adjustmentSelect = document.getElementById('adjustment-medicine-select');

    const optionsHtml = state.medicines.map(m => {
      const u = computeUnits(m.totalStrips, m.stripsPerBox);
      return `<option value="${m.id}">${escapeHtml(m.name)} (Stock: ${m.totalStrips} strips = ${u.decimalBoxes} boxes)</option>`;
    }).join('');

    if (saleSelect) saleSelect.innerHTML = optionsHtml;
    if (sampleSelect) sampleSelect.innerHTML = optionsHtml;
    if (inwardSelect) inwardSelect.innerHTML = optionsHtml;
    if (simSelect) simSelect.innerHTML = optionsHtml;
    if (adjustmentSelect) adjustmentSelect.innerHTML = optionsHtml;
  }

  function renderManageList() {
    const container = document.getElementById('med-manage-list');
    if (!container) return;

    container.innerHTML = state.medicines.map(m => {
      const u = computeUnits(m.totalStrips, m.stripsPerBox);
      const batches = getBatchSummary(m);
      return `
        <div class="med-manage-row" id="manage-row-${m.id}">
          <div class="med-manage-info">
            <span class="med-manage-name">${escapeHtml(m.name)}</span>
            <span class="med-manage-sub">${escapeHtml(m.salt || '')} • <strong>1 Box = ${m.stripsPerBox} Strips</strong> • Stock: ${u.totalStrips} strips across ${batches.active.length} active batch${batches.active.length === 1 ? '' : 'es'} • Next expiry: ${escapeHtml(batches.nextBatch?.expiry || 'N/A')}</span>
          </div>
          <div class="med-manage-actions">
            <button class="btn-xs btn-ghost btn-edit-strips" data-id="${m.id}">Change Packaging</button>
            <button class="btn-xs btn-ghost btn-delete-med" data-id="${m.id}" style="color: var(--rose);">Delete</button>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.btn-edit-strips').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.dataset.id;
        const med = state.medicines.find(m => m.id === id);
        if (!med) return;
        const newSpb = prompt(`Enter number of strips per box for "${med.name}":`, med.stripsPerBox);
        if (newSpb && parseInt(newSpb, 10) > 0) {
          med.stripsPerBox = parseInt(newSpb, 10);
          saveState();
          showToast(`Updated packaging: 1 Box = ${med.stripsPerBox} Strips`, 'success');
        }
      });
    });

    container.querySelectorAll('.btn-delete-med').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.dataset.id;
        const med = state.medicines.find(m => m.id === id);
        if (!med) return;
        if (syncMedicineTotal(med) > 0) {
          showToast('A medicine with stock cannot be deleted. First record a verified adjustment to zero.', 'error');
          return;
        }
        if (confirm(`Are you sure you want to delete "${med.name}" from your catalog? Historical ledger records will remain.`)) {
          state.medicines = state.medicines.filter(m => m.id !== id);
          saveState();
          showToast(`Removed "${med.name}"`, 'info');
        }
      });
    });
  }

  /* ==================== TWO-WAY CALCULATOR ==================== */

  function updateSimulatorFromBoxes() {
    const simSelect = document.getElementById('sim-med-select');
    const simBoxesInput = document.getElementById('sim-boxes-input');
    const simQtyInput = document.getElementById('sim-qty-input');
    if (!simSelect || !simBoxesInput || !simQtyInput) return;

    const med = state.medicines.find(m => m.id === simSelect.value);
    if (!med) return;

    const boxesVal = parseFloat(simBoxesInput.value) || 0;
    const rawStrips = boxesVal * med.stripsPerBox;
    const computedStrips = Number.isInteger(rawStrips) ? rawStrips : 0;
    simQtyInput.value = computedStrips || '';

    renderSimulatorResults(med, computedStrips);
  }

  function updateSimulatorFromStrips() {
    const simSelect = document.getElementById('sim-med-select');
    const simBoxesInput = document.getElementById('sim-boxes-input');
    const simQtyInput = document.getElementById('sim-qty-input');
    if (!simSelect || !simBoxesInput || !simQtyInput) return;

    const med = state.medicines.find(m => m.id === simSelect.value);
    if (!med) return;

    const stripsVal = parseInt(simQtyInput.value, 10) || 0;
    const decimalBoxes = (stripsVal / med.stripsPerBox).toFixed(1).replace(/\.0$/, '');
    simBoxesInput.value = decimalBoxes;

    renderSimulatorResults(med, stripsVal);
  }

  function renderSimulatorResults(med, requestedStrips) {
    const calcFullBoxesEl = document.getElementById('calc-full-boxes');
    const calcLooseStripsEl = document.getElementById('calc-loose-strips');
    const calcVerdictEl = document.getElementById('calc-stock-verdict');
    const calcVerdictText = document.getElementById('calc-verdict-text');

    const u = computeUnits(requestedStrips, med.stripsPerBox);
    const stockUnits = computeUnits(med.totalStrips, med.stripsPerBox);

    if (calcFullBoxesEl) calcFullBoxesEl.textContent = u.fullBoxes;
    if (calcLooseStripsEl) calcLooseStripsEl.textContent = u.looseStrips;

    if (requestedStrips <= 0) {
      calcVerdictEl.className = 'calc-stock-verdict';
      calcVerdictText.textContent = 'Enter a valid quantity to view dispense split.';
      return;
    }

    if (requestedStrips > med.totalStrips) {
      calcVerdictEl.className = 'calc-stock-verdict insufficient';
      calcVerdictText.textContent = `⚠️ Insufficient stock! Requested ${requestedStrips} strips, but current available stock is only ${med.totalStrips} strips.`;
    } else {
      calcVerdictEl.className = 'calc-stock-verdict';
      let note = '';
      if (stockUnits.looseStrips >= u.looseStrips && u.looseStrips > 0) {
        note = ` (Taking ${u.looseStrips} loose strips from current open box having ${stockUnits.looseStrips} loose).`;
      } else if (u.looseStrips > stockUnits.looseStrips) {
        note = ` (Will unseal 1 new sealed box to fulfill the ${u.looseStrips} loose strips).`;
      }
      calcVerdictText.textContent = `✓ Stock sufficient: Dispensing ${u.fullBoxes} sealed box(es) + ${u.looseStrips} loose strip(s)${note}`;
    }
  }

  /* ==================== MODAL 1: SYNCHRONIZED DOCTOR SALE ==================== */

  let isUpdatingSaleInputs = false;

  function openSaleModal(preselectMedId, defaultBoxes = '2.5') {
    const select = document.getElementById('sale-medicine-select');
    if (preselectMedId && select) {
      select.value = preselectMedId;
    }

    // Set default preset or passed value
    setSaleBoxesValue(defaultBoxes);
    updateSaleModalStockHint();
    openModal('modal-sale');
  }

  function setSaleBoxesValue(boxesVal) {
    isUpdatingSaleInputs = true;
    const select = document.getElementById('sale-medicine-select');
    const med = state.medicines.find(m => m.id === select.value) || state.medicines[0];
    const spb = med ? med.stripsPerBox : 10;

    const b = parseFloat(boxesVal) || 0;
    const totalStrips = Math.round(b * spb);
    const u = computeUnits(totalStrips, spb);

    document.getElementById('sale-dec-boxes').value = boxesVal;
    document.getElementById('sale-total-strips-input').value = totalStrips;
    document.getElementById('sale-loose-strips-only').value = u.looseStrips;

    // highlight matching preset pill
    document.querySelectorAll('#sale-preset-pills .qty-pill').forEach(pill => {
      if (pill.dataset.boxes === String(boxesVal)) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });

    isUpdatingSaleInputs = false;
    updateSaleOrderPreview();
  }

  function updateSaleModalStockHint() {
    const select = document.getElementById('sale-medicine-select');
    const hint = document.getElementById('sale-stock-hint');
    const multLabel = document.getElementById('sale-box-multiplier-label');
    if (!select || !hint) return;

    const med = state.medicines.find(m => m.id === select.value);
    if (med) {
      const u = computeUnits(med.totalStrips, med.stripsPerBox);
      hint.textContent = `Current Stock: ${u.totalStrips.toLocaleString()} strips (${u.decimalBoxes} Boxes = ${u.fullBoxes} Sealed Boxes + ${u.looseStrips} Loose Strips)`;
      if (multLabel) {
        multLabel.textContent = `1 Box = ${med.stripsPerBox} strips (e.g. 2.5 boxes = ${2.5 * med.stripsPerBox} strips)`;
      }
    }
  }

  function setupSaleModal() {
    const select = document.getElementById('sale-medicine-select');
    const decBoxesInput = document.getElementById('sale-dec-boxes');
    const totalStripsInput = document.getElementById('sale-total-strips-input');
    const looseStripsInput = document.getElementById('sale-loose-strips-only');

    select.addEventListener('change', () => {
      updateSaleModalStockHint();
      // recalculate from current boxes
      setSaleBoxesValue(decBoxesInput.value || 1);
    });

    // Preset pills (0.5, 1, 1.5, 2, 2.5, 3, 5, 10)
    document.querySelectorAll('#sale-preset-pills .qty-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        setSaleBoxesValue(pill.dataset.boxes);
      });
    });

    // When Decimal Boxes changes -> sync total strips and loose strips
    decBoxesInput.addEventListener('input', () => {
      if (isUpdatingSaleInputs) return;
      isUpdatingSaleInputs = true;
      const med = state.medicines.find(m => m.id === select.value);
      const spb = med ? med.stripsPerBox : 10;
      const b = parseFloat(decBoxesInput.value) || 0;
      const rawStrips = b * spb;
      const s = Number.isInteger(rawStrips) ? rawStrips : 0;
      const u = computeUnits(s, spb);

      totalStripsInput.value = s || '';
      looseStripsInput.value = s ? u.looseStrips : '';
      decBoxesInput.setCustomValidity(s || b === 0 ? '' : `This pack size requires a box quantity that equals a whole number of strips.`);
      isUpdatingSaleInputs = false;
      updateSaleOrderPreview();
    });

    // When Total Strips changes -> sync decimal boxes and loose strips
    totalStripsInput.addEventListener('input', () => {
      if (isUpdatingSaleInputs) return;
      isUpdatingSaleInputs = true;
      const med = state.medicines.find(m => m.id === select.value);
      const spb = med ? med.stripsPerBox : 10;
      const s = parseInt(totalStripsInput.value, 10) || 0;
      const u = computeUnits(s, spb);

      decBoxesInput.value = u.decimalBoxes;
      looseStripsInput.value = u.looseStrips;
      isUpdatingSaleInputs = false;
      updateSaleOrderPreview();
    });

    // When Loose Strips changes -> adjust decimal boxes & total strips
    looseStripsInput.addEventListener('input', () => {
      if (isUpdatingSaleInputs) return;
      isUpdatingSaleInputs = true;
      const med = state.medicines.find(m => m.id === select.value);
      const spb = med ? med.stripsPerBox : 10;
      const curFullBoxes = Math.floor((parseInt(totalStripsInput.value, 10) || 0) / spb);
      const loose = parseInt(looseStripsInput.value, 10) || 0;
      const total = (curFullBoxes * spb) + loose;
      const u = computeUnits(total, spb);

      totalStripsInput.value = total;
      decBoxesInput.value = u.decimalBoxes;
      isUpdatingSaleInputs = false;
      updateSaleOrderPreview();
    });

    // Submit Sale Order
    document.getElementById('form-sale').addEventListener('submit', (e) => {
      e.preventDefault();
      const med = state.medicines.find(m => m.id === select.value);
      if (!med) return;

      const totalStrips = parseInt(totalStripsInput.value, 10) || 0;
      if (totalStrips <= 0) {
        showToast('Please enter a valid quantity of strips', 'error');
        return;
      }
      const availableStrips = syncMedicineTotal(med);
      if (totalStrips > availableStrips) {
        showToast(`Insufficient stock! Requested ${totalStrips} strips, only ${med.totalStrips} available.`, 'error');
        return;
      }

      const doctorName = document.getElementById('sale-doctor-name').value.trim();
      const refNo = document.getElementById('sale-ref-no').value.trim();
      const notes = document.getElementById('sale-notes').value.trim();

      // Deduct by FEFO: the earliest-expiring viable batch is always issued first.
      const allocations = allocateStockFEFO(med, totalStrips);
      if (!allocations) {
        showToast('The selected quantity could not be allocated to available batches.', 'error');
        return;
      }
      const afterUnits = computeUnits(med.totalStrips, med.stripsPerBox);
      const orderUnits = computeUnits(totalStrips, med.stripsPerBox);

      const breakdownText = `${orderUnits.decimalBoxes} Boxes (${orderUnits.fullBoxes > 0 ? orderUnits.fullBoxes + ' Sealed' : ''}${orderUnits.fullBoxes > 0 && orderUnits.looseStrips > 0 ? ' + ' : ''}${orderUnits.looseStrips > 0 ? orderUnits.looseStrips + ' Loose' : ''})`;

      const tx = {
        id: 'tx-' + Date.now(),
        timestamp: new Date().toISOString(),
        type: 'SALE',
        medicineId: med.id,
        medicineName: med.name,
        qtyStrips: totalStrips,
        breakdownText: breakdownText,
        recipient: doctorName,
        notes: [refNo ? `Ref: ${refNo}` : '', notes, `FEFO: ${allocations.map(a => `${a.batchNo} (${a.qtyStrips})`).join(', ')}`].filter(Boolean).join(' • ') || 'Doctor Commercial Order',
        stockAfterStrips: med.totalStrips,
        stockAfterBreakdown: `${afterUnits.decimalBoxes} Boxes (${afterUnits.fullBoxes} Full + ${afterUnits.looseStrips} Loose)`
      };

      state.transactions.push(tx);
      rememberContact(doctorName, null);
      saveState();

      closeModal('modal-sale');
      document.getElementById('form-sale').reset();
      showToast(`Deducted ${totalStrips} strips (${breakdownText}) for ${doctorName}!`, 'success');

      // Prompt to print delivery challan or share on WhatsApp
      setTimeout(() => {
        openChallanModal(tx);
      }, 400);
    });
  }

  function updateSaleOrderPreview() {
    const select = document.getElementById('sale-medicine-select');
    const med = state.medicines.find(m => m.id === select.value);
    if (!med) return;

    const totalStrips = parseInt(document.getElementById('sale-total-strips-input').value, 10) || 0;
    const u = computeUnits(totalStrips, med.stripsPerBox);
    const stockUnits = computeUnits(med.totalStrips, med.stripsPerBox);

    const totalEl = document.getElementById('sale-summary-total');
    const boxesEl = document.getElementById('sale-summary-boxes');
    const looseEl = document.getElementById('sale-summary-loose');
    const statusEl = document.getElementById('sale-summary-validation');
    const submitBtn = document.getElementById('btn-submit-sale');

    totalEl.textContent = `${totalStrips} Strips (= ${u.decimalBoxes} Boxes)`;
    boxesEl.textContent = `${u.fullBoxes} Full Sealed ${u.fullBoxes === 1 ? 'Box' : 'Boxes'}`;
    looseEl.textContent = `${u.looseStrips} Loose ${u.looseStrips === 1 ? 'Strip' : 'Strips'} from Open Box`;

    submitBtn.textContent = `Confirm & Deduct ${totalStrips} Strips`;

    if (totalStrips <= 0) {
      statusEl.className = 'preview-status error';
      statusEl.textContent = '⚠️ Quantity must be greater than 0';
      submitBtn.disabled = true;
    } else if (totalStrips > med.totalStrips) {
      statusEl.className = 'preview-status error';
      statusEl.textContent = `⚠️ Insufficient stock! Only ${med.totalStrips} strips available.`;
      submitBtn.disabled = true;
    } else {
      statusEl.className = 'preview-status';
      let unsealNote = '';
      if (u.looseStrips > stockUnits.looseStrips) {
        unsealNote = ` • Note: Will unseal 1 new box to fulfill ${u.looseStrips} loose strips`;
      }
      statusEl.textContent = `✓ Stock sufficient: ${med.totalStrips - totalStrips} strips remaining after order${unsealNote}.`;
      submitBtn.disabled = false;
    }
  }

  /* ==================== MODAL 2: MR DOCTOR SAMPLE ==================== */

  function openSampleModal(preselectMedId) {
    const select = document.getElementById('sample-medicine-select');
    if (preselectMedId && select) {
      select.value = preselectMedId;
    }
    updateSampleModalStockHint();
    openModal('modal-sample');
  }

  function updateSampleModalStockHint() {
    const select = document.getElementById('sample-medicine-select');
    const hint = document.getElementById('sample-stock-hint');
    if (!select || !hint) return;

    const med = state.medicines.find(m => m.id === select.value);
    if (med) {
      const u = computeUnits(med.totalStrips, med.stripsPerBox);
      hint.textContent = `Available Stock: ${u.totalStrips} strips (${u.decimalBoxes} Boxes = ${u.fullBoxes} Full Boxes + ${u.looseStrips} Loose Strips)`;
    }
  }

  function setupSampleModal() {
    const select = document.getElementById('sample-medicine-select');
    select.addEventListener('change', updateSampleModalStockHint);

    const input = document.getElementById('sample-strips-input');
    document.querySelectorAll('#modal-sample .qty-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('#modal-sample .qty-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        input.value = pill.dataset.qty;
      });
    });

    input.addEventListener('input', () => {
      document.querySelectorAll('#modal-sample .qty-pill').forEach(p => {
        if (p.dataset.qty === input.value) {
          p.classList.add('active');
        } else {
          p.classList.remove('active');
        }
      });
    });

    document.getElementById('form-sample').addEventListener('submit', (e) => {
      e.preventDefault();
      const med = state.medicines.find(m => m.id === select.value);
      if (!med) return;

      const qtyStrips = parseInt(input.value, 10) || 0;
      if (qtyStrips <= 0) {
        showToast('Please enter a valid sample quantity', 'error');
        return;
      }
      const availableStrips = syncMedicineTotal(med);
      if (qtyStrips > availableStrips) {
        showToast(`Cannot give ${qtyStrips} sample strips; only ${med.totalStrips} strips in stock!`, 'error');
        return;
      }

      const mrName = document.getElementById('sample-mr-name').value.trim();
      const doctorName = document.getElementById('sample-doctor-name').value.trim();
      const clinic = document.getElementById('sample-clinic').value.trim();
      const notes = document.getElementById('sample-notes').value.trim();

      const allocations = allocateStockFEFO(med, qtyStrips);
      if (!allocations) {
        showToast('The selected quantity could not be allocated to available batches.', 'error');
        return;
      }
      const afterUnits = computeUnits(med.totalStrips, med.stripsPerBox);

      const recipientText = `${doctorName}${clinic ? ' (' + clinic + ')' : ''} [MR: ${mrName}]`;
      const breakdownText = `${qtyStrips} ${qtyStrips === 1 ? 'Strip' : 'Strips'} (Sample)`;

      const tx = {
        id: 'tx-' + Date.now(),
        timestamp: new Date().toISOString(),
        type: 'SAMPLE',
        medicineId: med.id,
        medicineName: med.name,
        qtyStrips: qtyStrips,
        breakdownText: breakdownText,
        recipient: recipientText,
        notes: [notes || 'MR Doctor Promotional Sample', `FEFO: ${allocations.map(a => `${a.batchNo} (${a.qtyStrips})`).join(', ')}`].join(' • '),
        stockAfterStrips: med.totalStrips,
        stockAfterBreakdown: `${afterUnits.decimalBoxes} Boxes (${afterUnits.fullBoxes} Full + ${afterUnits.looseStrips} Loose)`
      };

      state.transactions.push(tx);
      rememberContact(doctorName, mrName);
      saveState();

      closeModal('modal-sample');
      document.getElementById('form-sample').reset();
      showToast(`Logged MR Sample: ${qtyStrips} strip(s) given to ${doctorName}!`, 'success');
    });
  }

  /* ==================== MODAL 3: INWARD RESTOCK ==================== */

  function openInwardModal(preselectMedId) {
    const select = document.getElementById('inward-medicine-select');
    if (preselectMedId && select) {
      select.value = preselectMedId;
    }
    updateInwardMultiplierLabel();
    openModal('modal-inward');
  }

  function updateInwardMultiplierLabel() {
    const select = document.getElementById('inward-medicine-select');
    const boxesInput = document.getElementById('inward-boxes');
    const multLabel = document.getElementById('inward-box-multiplier');
    if (!select || !boxesInput || !multLabel) return;

    const med = state.medicines.find(m => m.id === select.value);
    if (med) {
      const boxes = parseInt(boxesInput.value, 10) || 0;
      multLabel.textContent = `${boxes} boxes × ${med.stripsPerBox} = ${boxes * med.stripsPerBox} strips`;
    }
  }

  function setupInwardModal() {
    const select = document.getElementById('inward-medicine-select');
    const boxesInput = document.getElementById('inward-boxes');
    select.addEventListener('change', updateInwardMultiplierLabel);
    boxesInput.addEventListener('input', updateInwardMultiplierLabel);

    document.getElementById('form-inward').addEventListener('submit', (e) => {
      e.preventDefault();
      const med = state.medicines.find(m => m.id === select.value);
      if (!med) return;

      const boxes = parseInt(boxesInput.value, 10) || 0;
      const loose = parseInt(document.getElementById('inward-strips').value, 10) || 0;
      const addedStrips = (boxes * med.stripsPerBox) + loose;

      if (addedStrips <= 0) {
        showToast('Please specify at least 1 box or strip to add', 'error');
        return;
      }

      const batch = document.getElementById('inward-batch').value.trim();
      const expiry = document.getElementById('inward-expiry').value;
      const source = document.getElementById('inward-source').value.trim();

      if (!batch || !normalizeMonth(expiry) || !source) {
        showToast('Batch number, expiry date, and supplier/reference are required for traceability.', 'error');
        return;
      }
      if (getExpiryStatus(expiry).level === 'expired') {
        showToast('Cannot receive an already expired batch.', 'error');
        return;
      }

      // Every inward receipt is a distinct traceable batch; existing batch metadata is never overwritten.
      addBatch(med, { batchNo: batch, expiry, qtyStrips: addedStrips, source });

      const afterUnits = computeUnits(med.totalStrips, med.stripsPerBox);
      const breakdownText = `${boxes > 0 ? boxes + ' Box' + (boxes > 1 ? 'es' : '') : ''}${boxes > 0 && loose > 0 ? ' + ' : ''}${loose > 0 ? loose + ' Loose Strip' + (loose > 1 ? 's' : '') : ''}`;

      state.transactions.push({
        id: 'tx-' + Date.now(),
        timestamp: new Date().toISOString(),
        type: 'INWARD',
        medicineId: med.id,
        medicineName: med.name,
        qtyStrips: addedStrips,
        breakdownText: breakdownText,
        recipient: source || 'Factory Restock',
        notes: `Batch: ${batch} • Exp: ${expiry} • Source: ${source}`,
        stockAfterStrips: med.totalStrips,
        stockAfterBreakdown: `${afterUnits.decimalBoxes} Boxes (${afterUnits.fullBoxes} Full + ${afterUnits.looseStrips} Loose)`
      });

      saveState();
      closeModal('modal-inward');
      document.getElementById('form-inward').reset();
      showToast(`Added ${addedStrips} strips (${breakdownText}) to "${med.name}"!`, 'success');
    });
  }

  /* ==================== CONTROLLED STOCK ADJUSTMENTS ==================== */

  function openAdjustmentModal() {
    const select = document.getElementById('adjustment-medicine-select');
    if (select && !select.value && state.medicines[0]) select.value = state.medicines[0].id;
    updateAdjustmentHint();
    openModal('modal-adjustment');
  }

  function updateAdjustmentHint() {
    const select = document.getElementById('adjustment-medicine-select');
    const hint = document.getElementById('adjustment-stock-hint');
    const medicine = state.medicines.find(m => m.id === select?.value);
    if (medicine && hint) hint.textContent = `Current available balance: ${syncMedicineTotal(medicine)} strips across ${getBatchSummary(medicine).active.length} active batches.`;
  }

  function setupAdjustments() {
    const form = document.getElementById('form-adjustment');
    const select = document.getElementById('adjustment-medicine-select');
    if (!form || !select) return;
    select.addEventListener('change', updateAdjustmentHint);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const medicine = state.medicines.find(m => m.id === select.value);
      const delta = Number(document.getElementById('adjustment-qty').value);
      const reason = document.getElementById('adjustment-reason').value.trim();
      if (!medicine || !Number.isInteger(delta) || delta === 0 || !reason) {
        showToast('Enter a whole non-zero strip difference and a count reference.', 'error');
        return;
      }
      let allocationNote = '';
      if (delta < 0) {
        const allocations = allocateStockFEFO(medicine, Math.abs(delta));
        if (!allocations) {
          showToast('The shortage exceeds the available traceable stock.', 'error');
          return;
        }
        allocationNote = `FEFO: ${allocations.map(a => `${a.batchNo} (${a.qtyStrips})`).join(', ')}`;
      } else {
        const batch = addBatch(medicine, {
          batchNo: `COUNT-ADJ-${new Date().toISOString().slice(0, 10)}`,
          expiry: '',
          qtyStrips: delta,
          source: 'Physical count variance — expiry must be reconciled'
        });
        allocationNote = `Created reconciliation batch ${batch.batchNo}`;
      }
      const after = computeUnits(syncMedicineTotal(medicine), medicine.stripsPerBox);
      state.transactions.push({
        id: createId('tx'), timestamp: new Date().toISOString(), type: 'ADJUSTMENT',
        medicineId: medicine.id, medicineName: medicine.name, qtyStrips: delta,
        breakdownText: `${delta > 0 ? 'Increase' : 'Decrease'} of ${Math.abs(delta)} strip(s)`,
        recipient: 'Verified physical count', notes: `${reason} • ${allocationNote}`,
        stockAfterStrips: medicine.totalStrips,
        stockAfterBreakdown: `${after.fullBoxes} Full + ${after.looseStrips} Loose`
      });
      saveState();
      closeModal('modal-adjustment');
      form.reset();
      showToast(`Recorded controlled adjustment of ${delta > 0 ? '+' : ''}${delta} strips.`, 'success');
    });
  }

  /* ==================== MODAL 4: MANAGE MEDICINES ==================== */

  function setupManageMedicines() {
    const formAdd = document.getElementById('form-add-med');
    if (!formAdd) return;

    formAdd.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('new-med-name').value.trim();
      const salt = document.getElementById('new-med-salt').value.trim();
      const perbox = parseInt(document.getElementById('new-med-perbox').value, 10) || 10;

      if (!name) return;

      const newMed = {
        id: 'med-' + Date.now(),
        name: name,
        brand: name,
        salt: salt || 'Standard Formulation',
        stripsPerBox: perbox,
        totalStrips: 0,
        batchNo: 'BATCH-' + Math.floor(1000 + Math.random() * 9000),
        expiry: '2027-12',
        minAlertStrips: perbox * 3
      };

      state.medicines.push(newMed);
      saveState();
      formAdd.reset();
      showToast(`Added formulation "${name}" (1 Box = ${perbox} Strips)!`, 'success');
    });
  }

  /* ==================== MODAL 5: DELIVERY CHALLAN & WHATSAPP ==================== */

  function openChallanModal(tx) {
    state.currentViewingTx = tx;
    const container = document.getElementById('challan-print-area');
    if (!container) return;

    const med = state.medicines.find(m => m.id === tx.medicineId);
    const spb = med ? med.stripsPerBox : 10;
    const u = computeUnits(tx.qtyStrips, spb);

    container.innerHTML = `
      <div class="challan-card" id="printable-challan">
        <div class="challan-header">
          <div>
            <div class="challan-company">SANODE PHARMACEUTICALS</div>
            <div style="font-size: 11px; color: #4b5563;">Medicine Dispatch &amp; Sampling Note</div>
          </div>
          <div class="challan-badge">${tx.type === 'SALE' ? 'Delivery Challan' : 'Sample Slip'}</div>
        </div>

        <div class="challan-meta-grid">
          <div class="challan-meta-item">
            <strong>Recipient / Doctor:</strong><br>
            ${escapeHtml(tx.recipient || 'N/A')}
          </div>
          <div class="challan-meta-item">
            <strong>Challan / Ref No:</strong><br>
            ${escapeHtml(tx.notes || tx.id)}
          </div>
          <div class="challan-meta-item">
            <strong>Date &amp; Time:</strong><br>
            ${formatDateTime(tx.timestamp)}
          </div>
          <div class="challan-meta-item">
            <strong>Packaging Standard:</strong><br>
            1 Box = ${spb} Strips
          </div>
        </div>

        <table class="challan-table">
          <thead>
            <tr>
              <th>Item Description</th>
              <th>Full Boxes</th>
              <th>Loose Strips</th>
              <th>Total Strips</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>${escapeHtml(tx.medicineName)}</strong></td>
              <td>${u.fullBoxes} Box${u.fullBoxes !== 1 ? 'es' : ''}</td>
              <td>${u.looseStrips} Strip${u.looseStrips !== 1 ? 's' : ''}</td>
              <td><strong>${tx.qtyStrips} Strips</strong></td>
            </tr>
            <tr class="challan-total-row">
              <td colspan="3">Net Dispatched Quantity (${u.decimalBoxes} Boxes Equiv.):</td>
              <td>${tx.qtyStrips} Strips</td>
            </tr>
          </tbody>
        </table>

        <div class="challan-footer-notes">
          <span>Verified by Warehouse &bull; PharmaStock</span>
          <span>Authorized Receiver Signature: __________________</span>
        </div>
      </div>
    `;

    openModal('modal-challan');
  }

  function shareTxOnWhatsApp(tx) {
    const med = state.medicines.find(m => m.id === tx.medicineId);
    const spb = med ? med.stripsPerBox : 10;
    const u = computeUnits(tx.qtyStrips, spb);

    const message = 
`*DISPATCH CONFIRMATION - PHARMASTOCK*
----------------------------------------
*Recipient / Doctor:* ${tx.recipient}
*Medicine:* ${tx.medicineName}
*Quantity Dispatched:* ${tx.qtyStrips} Strips (= ${u.decimalBoxes} Boxes)
*Packaging Split:* ${u.fullBoxes} Sealed Boxes + ${u.looseStrips} Loose Strips
*Date:* ${formatDateTime(tx.timestamp)}
*Reference:* ${tx.notes || 'Order Fulfilled'}
----------------------------------------
_Account balance updated to: ${tx.stockAfterStrips} strips remaining._
Thank you!`;

    const encoded = encodeURIComponent(message);
    const url = `https://api.whatsapp.com/send?text=${encoded}`;
    
    // Copy to clipboard as backup
    navigator.clipboard.writeText(message).then(() => {
      showToast('Copied WhatsApp confirmation to clipboard! Opening WhatsApp...', 'success');
      window.open(url, '_blank');
    }).catch(() => {
      window.open(url, '_blank');
    });
  }

  /* ==================== EXPORT & IMPORT ==================== */

  function exportCSV() {
    if (state.transactions.length === 0) {
      showToast('No transactions to export', 'info');
      return;
    }

    const headers = [
      'Transaction ID',
      'Date & Time',
      'Type',
      'Medicine Formulation',
      'Quantity (Strips)',
      'Packaging Breakdown',
      'Doctor / MR / Recipient',
      'Notes & References',
      'Stock After (Strips)',
      'Stock Breakdown After'
    ];

    const rows = state.transactions.map(t => [
      `"${t.id}"`,
      `"${formatDateTime(t.timestamp)}"`,
      `"${t.type}"`,
      `"${t.medicineName.replace(/"/g, '""')}"`,
      t.qtyStrips,
      `"${(t.breakdownText || '').replace(/"/g, '""')}"`,
      `"${(t.recipient || '').replace(/"/g, '""')}"`,
      `"${(t.notes || '').replace(/"/g, '""')}"`,
      t.stockAfterStrips,
      `"${(t.stockAfterBreakdown || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadFile(csvContent, `PharmaStock_Ledger_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
    showToast('Exported transaction ledger to CSV!', 'success');
  }

  function exportJSON() {
    const jsonStr = JSON.stringify(
      {
        schemaVersion: 3,
        application: 'PharmaStock Pro',
        medicines: state.medicines,
        transactions: state.transactions,
        directory: state.directory,
        exportedAt: new Date().toISOString()
      },
      null,
      2
    );
    downloadFile(jsonStr, `PharmaStock_Backup_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
    showToast('Backup JSON downloaded!', 'success');
  }

  function setupJSONImport() {
    const input = document.getElementById('file-import-input');
    const btn = document.getElementById('btn-import-json');

    btn.addEventListener('click', () => input.click());

    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          const imported = normalizeState(data);
          const invalidMedicine = imported.medicines.some(medicine => !medicine.name || medicine.stripsPerBox < 1);
          if (imported.medicines.length > 0 && !invalidMedicine) {
            state.medicines = imported.medicines;
            state.transactions = imported.transactions;
            if (data.directory && typeof data.directory === 'object') {
              state.directory = {
                doctors: Array.isArray(data.directory.doctors) ? data.directory.doctors.map(value => String(value).trim()).filter(Boolean) : [],
                mrs: Array.isArray(data.directory.mrs) ? data.directory.mrs.map(value => String(value).trim()).filter(Boolean) : []
              };
            }
            saveState();
            showToast('Validated inventory database restored successfully!', 'success');
          } else {
            showToast('Invalid backup file format', 'error');
          }
        } catch (err) {
          showToast('Failed to parse JSON backup file', 'error');
        }
      };
      reader.readAsText(file);
      input.value = '';
    });
  }

  function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ==================== MODAL HELPER & TOASTS ==================== */

  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'flex';
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
  }

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close');
      closeModal(modalId);
    });
  });

  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  });

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'warning') icon = '⚠️';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function formatDateTime(isoString) {
    if (!isoString) return '-';
    const d = new Date(isoString);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ==================== KEYBOARD SHORTCUTS ==================== */
  function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Don't trigger if user is typing inside an input
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        return;
      }

      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        openSaleModal();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        openSampleModal();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        openInwardModal();
      } else if (e.key === '/') {
        e.preventDefault();
        document.getElementById('med-search-input').focus();
      } else if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop').forEach(m => m.style.display = 'none');
      }
    });
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('./sw.js').catch(error => {
        console.warn('Offline support could not be enabled:', error);
      });
    }
  }

  /* ==================== INITIALIZATION ==================== */

  function init() {
    loadState();

    // Top Action Buttons
    document.getElementById('btn-new-sale').addEventListener('click', () => openSaleModal());
    document.getElementById('btn-new-sample').addEventListener('click', () => openSampleModal());
    document.getElementById('btn-new-inward').addEventListener('click', () => openInwardModal());
    document.getElementById('btn-new-adjustment').addEventListener('click', openAdjustmentModal);
    document.getElementById('btn-manage-meds').addEventListener('click', () => openModal('modal-manage'));
    document.getElementById('btn-reset-demo').addEventListener('click', resetDemoData);
    document.getElementById('btn-open-calc').addEventListener('click', () => {
      document.querySelector('.calc-banner-card').scrollIntoView({ behavior: 'smooth' });
    });

    // Medicine Search Filter
    const searchInput = document.getElementById('med-search-input');
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderMedicineGrid();
    });

    // Ledger Filter Buttons
    document.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.activeFilter = btn.dataset.filter;
        renderLedger();
      });
    });

    // Two-Way Simulator Listeners
    document.getElementById('sim-med-select').addEventListener('change', updateSimulatorFromStrips);
    document.getElementById('sim-boxes-input').addEventListener('input', updateSimulatorFromBoxes);
    document.getElementById('sim-qty-input').addEventListener('input', updateSimulatorFromStrips);
    document.getElementById('btn-quick-fill-order').addEventListener('click', () => {
      const medId = document.getElementById('sim-med-select').value;
      const boxes = document.getElementById('sim-boxes-input').value;
      openSaleModal(medId, boxes);
    });

    // Print Challan Button
    document.getElementById('btn-print-challan').addEventListener('click', () => {
      window.print();
    });

    // Export Buttons
    document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
    document.getElementById('btn-export-json').addEventListener('click', exportJSON);
    setupJSONImport();

    // Setup Modals & Shortcuts
    setupSaleModal();
    setupSampleModal();
    setupInwardModal();
    setupAdjustments();
    setupManageMedicines();
    setupKeyboardShortcuts();

    renderAll();
    registerServiceWorker();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
