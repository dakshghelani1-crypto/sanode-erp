import { InventoryWorkspace } from '@/components/inventory-workspace';
import { formatCookieHeader, getProducts } from '@/lib/api';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  try {
    const products = await getProducts(formatCookieHeader(await cookies()));
    return <InventoryWorkspace products={products} source="live" />;
  } catch {
    return <main className="page-error"><h1>Inventory needs a signed-in session</h1><p>Sign in to view live inventory and batch availability.</p><a className="submit-button" href="/login">Open sign in</a></main>;
  }
}
