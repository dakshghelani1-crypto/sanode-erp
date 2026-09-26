'use client';

import { FormEvent, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownToLine, PackagePlus, Stethoscope, X } from 'lucide-react';
import type { Product } from '@/lib/api';

type Action = 'receipt' | 'dispatch' | 'sample' | null;
type DispatchPreview = {
  billedStrips: number;
  freeStrips: number;
  totalStrips: number;
  sufficient: boolean;
  shortfallStrips: number;
  scheme: { name: string; minimumBoxes: number; freeStrips: number } | null;
  allocations: Array<{ batchNumber: string; expiryDate: string; quantityStrips: number; availableAfterStrips: number }>;
  notice: string;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/v1';

function idempotencyKey() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function QuickActions({ products }: { products: Product[] }) {
  const router = useRouter();
  const [action, setAction] = useState<Action>(null);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [preview, setPreview] = useState<DispatchPreview | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const selectedProduct = useMemo(() => products[0], [products]);

  async function previewDispatch() {
    const form = formRef.current;
    if (!form) return;
    const fields = new FormData(form);
    const productId = String(fields.get('productId') ?? '');
    const billedBoxes = Number(fields.get('boxes'));
    if (!productId || !Number.isInteger(billedBoxes) || billedBoxes < 1) {
      setPreview(null);
      setMessage('Enter a product and at least one billed box to preview FEFO allocation.');
      return;
    }
    setIsPreviewing(true); setMessage(''); setPreview(null);
    try {
      const response = await fetch(`${apiUrl}/inventory/dispatch-preview?productId=${encodeURIComponent(productId)}&billedBoxes=${billedBoxes}`, { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(' ') : body.message || 'Could not calculate FEFO allocation.');
      setPreview(body as DispatchPreview);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not calculate FEFO allocation.');
    } finally { setIsPreviewing(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    const fields = new FormData(event.currentTarget);
    const common = { productId: String(fields.get('productId')), idempotencyKey: idempotencyKey() };
    const payload = action === 'receipt' ? {
      ...common, batchNumber: String(fields.get('batchNumber')), expiryDate: String(fields.get('expiryDate')), manufacturingDate: String(fields.get('manufacturingDate') || '') || undefined,
      receivedBoxes: Number(fields.get('boxes')), unitCostPaise: Math.round(Number(fields.get('unitCost')) * 100), supplierName: String(fields.get('supplierName')), supplierRef: String(fields.get('supplierRef'))
    } : action === 'dispatch' ? {
      ...common, customerName: String(fields.get('customerName')), customerType: String(fields.get('customerType')), billedBoxes: Number(fields.get('boxes')), freeStrips: 0, unitPricePaise: Math.round(Number(fields.get('unitPrice')) * 100), note: String(fields.get('note') || '') || undefined
    } : {
      ...common, doctorName: String(fields.get('doctorName')), mrName: String(fields.get('mrName')), quantityStrips: Number(fields.get('quantityStrips')), note: String(fields.get('note') || '') || undefined
    };
    const endpoint = action === 'receipt' ? 'receipts' : action === 'dispatch' ? 'dispatches' : 'samples';
    setIsSubmitting(true); setMessage('');
    try {
      const response = await fetch(`${apiUrl}/inventory/${endpoint}`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = Array.isArray(body.message) ? body.message.join(' ') : body.message;
        throw new Error(response.status === 401 ? 'Your session ended. Sign in again to record stock movements.' : detail || 'The stock movement could not be recorded.');
      }
      const summary = action === 'dispatch' ? `Saved. ${body.billedStrips} billed strips and ${body.freeStrips} free strips were allocated by FEFO.` : action === 'receipt' ? `Saved. Batch ${body.batch?.batchNumber ?? ''} is now available in inventory.` : `Saved. ${body.quantityStrips} sample strips were deducted by FEFO.`;
      setMessage(summary);
      window.setTimeout(() => { setAction(null); router.refresh(); }, 900);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The stock movement could not be recorded.');
    } finally { setIsSubmitting(false); }
  }

  return <>
    <div className="action-grid">
      <button className="primary-action" onClick={() => { setMessage(''); setAction('receipt'); }}><PackagePlus size={20}/><span><strong>Receive stock</strong><small>Add a purchase batch</small></span></button>
      <button className="secondary-action" onClick={() => { setMessage(''); setAction('dispatch'); }}><ArrowDownToLine size={20}/><span><strong>Dispatch order</strong><small>Sale + free goods</small></span></button>
      <button className="secondary-action" onClick={() => { setMessage(''); setAction('sample'); }}><Stethoscope size={20}/><span><strong>Log MR sample</strong><small>Doctor detailing stock</small></span></button>
    </div>
    {action && <div className="dialog-backdrop" role="presentation"><section className="entry-dialog" role="dialog" aria-modal="true" aria-labelledby="entry-title">
      <header><div><p className="eyebrow">{action === 'receipt' ? 'Purchase receipt' : action === 'dispatch' ? 'Commercial dispatch' : 'Physician sample'}</p><h2 id="entry-title">{action === 'receipt' ? 'Receive a new batch' : action === 'dispatch' ? 'Dispatch a doctor or customer order' : 'Log an MR sample'}</h2></div><button className="close-button" aria-label="Close" onClick={() => setAction(null)}><X size={18}/></button></header>
      <form ref={formRef} onSubmit={submit}>
        <label>Product<select name="productId" defaultValue={selectedProduct?.id} required>{products.map(product => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label>
        {action === 'receipt' && <div className="form-grid"><label>Batch number<input name="batchNumber" placeholder="e.g. LUM-2602" required /></label><label>Expiry month<input name="expiryDate" type="date" required /></label><label>Manufacturing date<input name="manufacturingDate" type="date" /></label><label>Received boxes<input name="boxes" type="number" min="1" required /></label><label>Unit cost (₹)<input name="unitCost" type="number" min="0" step="0.01" required /></label><label>Supplier<input name="supplierName" required /></label><label className="wide">Invoice / GRN reference<input name="supplierRef" required /></label></div>}
        {action === 'dispatch' && <div className="form-grid"><label>Customer / doctor / pharmacy<input name="customerName" required /></label><label>Customer type<select name="customerType"><option>Pharmacy</option><option>Doctor</option><option>Hospital</option></select></label><label>Billed boxes<input name="boxes" type="number" min="1" required /></label><label>Price per box (₹)<input name="unitPrice" type="number" min="0" step="0.01" required /></label><label className="wide">Dispatch note<input name="note" placeholder="Optional invoice or instruction" /></label><div className="wide preview-control"><button type="button" className="preview-button" onClick={previewDispatch} disabled={isPreviewing}>{isPreviewing ? 'Checking FEFO…' : 'Preview FEFO allocation'}</button><span>The final allocation is locked again when you confirm.</span></div>{preview && <section className={preview.sufficient ? 'fefo-preview wide' : 'fefo-preview fefo-preview-error wide'} aria-live="polite"><div><strong>{preview.sufficient ? 'FEFO allocation ready' : 'Insufficient sellable stock'}</strong><span>{preview.billedStrips} billed + {preview.freeStrips} free = {preview.totalStrips} strips leaving stock</span></div>{preview.scheme && <p className="scheme-note">{preview.scheme.name}: Buy {preview.scheme.minimumBoxes} boxes, get {preview.scheme.freeStrips} strips free.</p>}<div className="allocation-list">{preview.allocations.map(allocation => <div key={allocation.batchNumber}><span><strong>{allocation.batchNumber}</strong><small>Expires {new Date(allocation.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</small></span><strong>−{allocation.quantityStrips} strips</strong><small>{allocation.availableAfterStrips} left</small></div>)}</div>{!preview.sufficient && <p className="preview-warning">Short by {preview.shortfallStrips} strips. Receive stock or reduce the order before dispatching.</p>}<p className="preview-notice">{preview.notice}</p></section>}<p className="scheme-note wide">Any active trade scheme is applied by the server and recorded separately as free stock before FEFO allocation.</p></div>}
        {action === 'sample' && <div className="form-grid"><label>Doctor name<input name="doctorName" required /></label><label>MR name<input name="mrName" required /></label><label>Sample strips<input name="quantityStrips" type="number" min="1" required /></label><label className="wide">Visit note<input name="note" placeholder="Optional follow-up or clinic note" /></label></div>}
        <p className={message.startsWith('Saved') ? 'form-message success-message' : 'form-message'} aria-live="polite">{message}</p>
        <footer><button type="button" className="cancel-button" onClick={() => setAction(null)}>Cancel</button><button disabled={isSubmitting || (action === 'dispatch' && preview?.sufficient === false)} className="submit-button" type="submit">{isSubmitting ? 'Saving…' : action === 'receipt' ? 'Receive batch' : action === 'dispatch' ? 'Confirm dispatch' : 'Record sample'}</button></footer>
      </form>
    </section></div>}
  </>;
}
