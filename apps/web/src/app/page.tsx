import { OverviewWorkspace } from '@/components/overview-workspace';
import { getLedger, getProducts, type LedgerEntry, type Product } from '@/lib/api';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const previewProducts: Product[] = [
  { id: 'lumen', code: 'LUM-DROP', name: 'Lumen Drops', stripsPerBox: 10, availableStrips: 150000, reorderLevelStrips: 5000, batches: [
    { id: 'lumen-01', batchNumber: 'Batch 01', expiryDate: '2027-04-30T00:00:00.000Z', availableStrips: 50000, supplierName: 'Sanode Manufacturing' },
    { id: 'lumen-02', batchNumber: 'Batch 02', expiryDate: '2027-09-30T00:00:00.000Z', availableStrips: 100000, supplierName: 'Sanode Manufacturing' }
  ] },
  { id: 'ferenorm', code: 'FER-10', name: 'Ferenorm', stripsPerBox: 10, availableStrips: 28430, reorderLevelStrips: 3000, batches: [{ id: 'fer-01', batchNumber: 'FRN-2401', expiryDate: '2027-02-28T00:00:00.000Z', availableStrips: 28430, supplierName: 'Sanode Manufacturing' }] },
  { id: 'cefimax', code: 'CEF-200', name: 'CefiMax 200', stripsPerBox: 10, availableStrips: 50000, reorderLevelStrips: 5000, batches: [{ id: 'cef-01', batchNumber: 'CF-9021', expiryDate: '2027-08-31T00:00:00.000Z', availableStrips: 50000, supplierName: 'Sanode Manufacturing' }] }
];
const previewLedger: LedgerEntry[] = [];

export default async function HomePage() {
  try {
    const cookieHeader = (await cookies()).toString();
    const [products, activity] = await Promise.all([getProducts(cookieHeader), getLedger(cookieHeader)]);
    return <OverviewWorkspace products={products} activity={activity} source="live" />;
  } catch {
    if (process.env.NODE_ENV === 'production') return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f7f8fc' }}><div style={{ maxWidth: 420, padding: 36, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20 }}><p className="eyebrow">Sanode Operations</p><h1>Sign in to continue</h1><p>Your workspace session is required to view live inventory.</p><a className="submit-button" href="/login">Open sign in</a></div></main>;
    return <OverviewWorkspace products={previewProducts} activity={previewLedger} source="preview" />;
  }
}
