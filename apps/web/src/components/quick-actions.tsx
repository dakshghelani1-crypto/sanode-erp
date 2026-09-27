'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownToLine, PackagePlus, Stethoscope } from 'lucide-react';
import type { Product } from '@/lib/api';
import { ReceiveStockModal } from './receive-stock-modal';
import { DispatchOrderModal } from './dispatch-order-modal';
import { LogSampleModal } from './log-sample-modal';

type Action = 'receipt' | 'dispatch' | 'sample' | null;

export function QuickActions({ products }: { products: Product[] }) {
  const router = useRouter();
  const [action, setAction] = useState<Action>(null);
  const [message, setMessage] = useState('');

  return (
    <>
      <div className="action-grid">
        <button className="primary-action" onClick={() => { setMessage(''); setAction('receipt'); }}>
          <PackagePlus size={20}/>
          <span><strong>Receive stock</strong><small>Add a purchase batch</small></span>
        </button>
        <button className="secondary-action" onClick={() => { setMessage(''); setAction('dispatch'); }}>
          <ArrowDownToLine size={20}/>
          <span><strong>Dispatch order</strong><small>Sale + free goods (FEFO)</small></span>
        </button>
        <button className="secondary-action" onClick={() => { setMessage(''); setAction('sample'); }}>
          <Stethoscope size={20}/>
          <span><strong>Log MR sample</strong><small>Doctor detailing stock</small></span>
        </button>
      </div>

      <ReceiveStockModal
        isOpen={action === 'receipt'}
        onClose={() => setAction(null)}
        initialProducts={products}
        onStockReceived={() => {
          setMessage('Stock received successfully.');
          router.refresh();
        }}
      />

      <DispatchOrderModal
        isOpen={action === 'dispatch'}
        onClose={() => setAction(null)}
        products={products}
      />

      <LogSampleModal
        isOpen={action === 'sample'}
        onClose={() => setAction(null)}
        products={products}
      />
    </>
  );
}
