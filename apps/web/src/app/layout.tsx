import type { Metadata } from 'next';
import './globals.css';
import './operations.css';

export const metadata: Metadata = {
  title: 'Sanode Operations',
  description: 'Batch-aware pharmaceutical inventory operations'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
