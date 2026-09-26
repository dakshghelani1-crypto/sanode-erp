import type { LedgerEntry } from '@/lib/api';
import { AppShell } from './app-shell';

const format = new Intl.NumberFormat('en-IN');
const movementNames: Record<string, string> = { GOODS_RECEIPT: 'Stock received', COMMERCIAL_DISPATCH: 'Commercial dispatch', FREE_GOODS_DISPATCH: 'Free goods', MR_SAMPLE_DISPATCH: 'MR sample', CUSTOMER_RETURN: 'Customer return', DAMAGE_WRITE_OFF: 'Damage write-off', EXPIRY_QUARANTINE: 'Expiry quarantine', ADJUSTMENT_IN: 'Stock adjustment in', ADJUSTMENT_OUT: 'Stock adjustment out' };

export function ActivityWorkspace({ activity }: { activity: LedgerEntry[] }) {
  return <AppShell title="Activity"><section className="panel activity-panel activity-page"><div className="panel-heading"><div><p className="eyebrow">Audit trail</p><h2>Every stock movement, in order</h2></div><span className="result-count">{activity.length} recent entries</span></div>{activity.length ? <div className="movement-list">{activity.map(entry => { const outgoing = entry.quantityStrips < 0; return <div className="movement-item" key={entry.id}><span className={outgoing ? 'movement-amount movement-out' : 'movement-amount movement-in'}>{outgoing ? '−' : '+'}{format.format(Math.abs(entry.quantityStrips))}</span><div><strong>{movementNames[entry.type] ?? entry.type}</strong><p>{entry.product.name} · {entry.batch?.batchNumber ?? 'Product level'}{entry.createdBy ? ` · ${entry.createdBy.name}` : ''}{entry.note ? ` · ${entry.note}` : ''}</p></div><time>{new Date(entry.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</time></div>; })}</div> : <div className="empty-state">No activity yet. Your first receipt, dispatch, or MR sample will appear here.</div>}</section></AppShell>;
}
