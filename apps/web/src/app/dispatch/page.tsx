import { DispatchWorkspace } from '@/components/dispatch-workspace';
import { formatCookieHeader, getProducts } from '@/lib/api';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function DispatchPage() {
  try {
    const products = await getProducts(formatCookieHeader(await cookies()));
    return <DispatchWorkspace products={products} />;
  } catch {
    return <main className="page-error"><h1>Dispatch needs a signed-in session</h1><p>Sign in before recording a stock movement.</p><a className="submit-button" href="/login">Open sign in</a></main>;
  }
}
