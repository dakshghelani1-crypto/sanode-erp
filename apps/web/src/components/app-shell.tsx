'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ArrowDownToLine, ClipboardList, PackageSearch, ShieldCheck, Stethoscope } from 'lucide-react';

const links = [
  { href: '/', label: 'Overview', icon: ClipboardList },
  { href: '/inventory', label: 'Inventory', icon: PackageSearch },
  { href: '/dispatch', label: 'Dispatch', icon: ArrowDownToLine },
  { href: '/activity', label: 'Activity', icon: Stethoscope }
];

export function AppShell({ title, eyebrow = 'Warehouse control', children, actions }: { title: string; eyebrow?: string; children: ReactNode; actions?: ReactNode }) {
  const pathname = usePathname();
  return <main className="shell">
    <aside className="sidebar">
      <Link className="brand" href="/"><div className="brand-mark">S</div><span>Sanode<span className="brand-muted">Ops</span></span></Link>
      <nav aria-label="Main navigation">{links.map(({ href, label, icon: Icon }) => <Link key={href} className={`nav-link ${pathname === href ? 'active' : ''}`} href={href}><Icon size={18}/><span>{label}</span></Link>)}</nav>
      <div className="sidebar-note"><ShieldCheck size={18}/><span>Batch-safe operations with a complete stock audit trail.</span></div>
    </aside>
    <section className="workspace">
      <header className="topbar"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div><div className="topbar-actions">{actions}<Link className="profile" href="/login" aria-label="Account">DG</Link></div></header>
      {children}
    </section>
  </main>;
}
