import type { Product } from '@/lib/api';
import { AppShell } from './app-shell';
import { QuickActions } from './quick-actions';

export function DispatchWorkspace({ products }: { products: Product[] }) {
  return <AppShell title="Dispatch centre"><section className="dispatch-page"><div className="dispatch-intro"><p className="eyebrow">Guided stock movement</p><h2>Choose what is leaving or entering the warehouse.</h2><p>Commercial dispatches apply FEFO and active trade schemes automatically. Samples are recorded separately from sales.</p></div><QuickActions products={products} /><section className="panel dispatch-help"><div><strong>1. Receive stock</strong><p>Add a purchase batch with supplier and expiry details.</p></div><div><strong>2. Dispatch an order</strong><p>Bill boxes; the system deducts free goods and allocates FEFO batches.</p></div><div><strong>3. Log an MR sample</strong><p>Keep detailing samples separate from commercial dispatch.</p></div></section></section></AppShell>;
}
