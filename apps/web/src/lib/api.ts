export type Batch = {
  id: string;
  batchNumber: string;
  expiryDate: string;
  manufacturingDate?: string | null;
  unitCostPaise?: number;
  mrpPaise?: number | null;
  gstRate?: number | null;
  receivedStrips?: number;
  availableStrips: number;
  supplierName: string;
  supplierRef?: string;
  receivedAt?: string;
};
export type Product = {
  id: string;
  code: string;
  name: string;
  composition?: string | null;
  stripsPerBox: number;
  availableStrips: number;
  reorderLevelStrips: number;
  batches: Batch[];
};
export type LedgerEntry = {
  id: string; type: string; quantityStrips: number; balanceAfterProduct: number; referenceType: string; referenceId: string; note: string | null; createdAt: string;
  product: { name: string; code: string; stripsPerBox: number }; batch: { batchNumber: string; expiryDate: string } | null; createdBy: { name: string } | null;
};

const envApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
export const API_BASE_URL = typeof window !== 'undefined'
  ? (envApiUrl || '/v1')
  : (envApiUrl || 'https://sanode-erp.onrender.com/v1');
const apiUrl = API_BASE_URL;

export function extractToken(cookieHeader?: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/sanode_access=([^;]+)/);
  return match ? match[1] : undefined;
}

export function formatCookieHeader(store: { get: (name: string) => { value: string } | undefined; getAll: () => { name: string; value: string }[] }): string {
  const token = store.get('sanode_access')?.value;
  return token ? `sanode_access=${token}` : store.getAll().map(c => `${c.name}=${c.value}`).join('; ');
}

export async function getProducts(cookieHeader?: string): Promise<Product[]> {
  const organizationId = process.env.NEXT_PUBLIC_DEMO_ORGANIZATION_ID;
  const token = extractToken(cookieHeader);
  const headers: HeadersInit = {
    ...(cookieHeader ? { cookie: cookieHeader } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {})
  };
  const response = await fetch(`${apiUrl}/inventory/products${organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ''}`, { cache: 'no-store', headers });
  if (!response.ok) throw new Error('Inventory API is unavailable.');
  return response.json() as Promise<Product[]>;
}

export async function getLedger(cookieHeader?: string): Promise<LedgerEntry[]> {
  const token = extractToken(cookieHeader);
  const headers: HeadersInit = {
    ...(cookieHeader ? { cookie: cookieHeader } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {})
  };
  const response = await fetch(`${apiUrl}/inventory/ledger?limit=20`, { cache: 'no-store', headers });
  if (!response.ok) throw new Error('Inventory ledger is unavailable.');
  return response.json() as Promise<LedgerEntry[]>;
}

export type Customer = {
  id: string;
  name: string;
  type: string;
  createdAt: string;
};

export async function getCustomers(cookieHeader?: string, type?: string): Promise<Customer[]> {
  const headers: HeadersInit = cookieHeader ? { cookie: cookieHeader } : {};
  const query = type ? `?type=${encodeURIComponent(type)}` : '';
  const response = await fetch(`${apiUrl}/inventory/customers${query}`, { cache: 'no-store', headers });
  if (!response.ok) return [];
  return response.json() as Promise<Customer[]>;
}

export type Representative = {
  id: string;
  name: string;
  role: string;
};

export async function getRepresentatives(cookieHeader?: string): Promise<Representative[]> {
  const headers: HeadersInit = cookieHeader ? { cookie: cookieHeader } : {};
  const response = await fetch(`${apiUrl}/inventory/representatives`, { cache: 'no-store', headers });
  if (!response.ok) return [];
  return response.json() as Promise<Representative[]>;
}

