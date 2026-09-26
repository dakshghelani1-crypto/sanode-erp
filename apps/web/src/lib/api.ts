export type Batch = { id: string; batchNumber: string; expiryDate: string; availableStrips: number; supplierName: string };
export type Product = { id: string; code: string; name: string; stripsPerBox: number; availableStrips: number; reorderLevelStrips: number; batches: Batch[] };
export type LedgerEntry = {
  id: string; type: string; quantityStrips: number; balanceAfterProduct: number; referenceType: string; referenceId: string; note: string | null; createdAt: string;
  product: { name: string; code: string; stripsPerBox: number }; batch: { batchNumber: string; expiryDate: string } | null; createdBy: { name: string } | null;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/v1';

export async function getProducts(cookieHeader?: string): Promise<Product[]> {
  const organizationId = process.env.NEXT_PUBLIC_DEMO_ORGANIZATION_ID;
  const headers: HeadersInit = cookieHeader ? { cookie: cookieHeader } : {};
  const response = await fetch(`${apiUrl}/inventory/products${organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ''}`, { cache: 'no-store', headers });
  if (!response.ok) throw new Error('Inventory API is unavailable.');
  return response.json() as Promise<Product[]>;
}

export async function getLedger(cookieHeader?: string): Promise<LedgerEntry[]> {
  const headers: HeadersInit = cookieHeader ? { cookie: cookieHeader } : {};
  const response = await fetch(`${apiUrl}/inventory/ledger?limit=20`, { cache: 'no-store', headers });
  if (!response.ok) throw new Error('Inventory ledger is unavailable.');
  return response.json() as Promise<LedgerEntry[]>;
}
