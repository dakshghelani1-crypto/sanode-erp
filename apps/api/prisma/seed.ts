import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync } from 'node:crypto';

const prisma = new PrismaClient();

const products = [
  { code: 'LUM-DROP', name: 'Lumen Drops', composition: 'Paediatric drops', reorderLevelStrips: 5000, batches: [{ number: 'Batch 01', expiry: '2027-04-30', boxes: 5000 }, { number: 'Batch 02', expiry: '2027-09-30', boxes: 10000 }] },
  { code: 'FER-10', name: 'Ferenorm', composition: 'Iron formulation', reorderLevelStrips: 3000, batches: [{ number: 'FRN-2401', expiry: '2027-02-28', boxes: 2843 }] },
  { code: 'CEF-200', name: 'CefiMax 200', composition: 'Cefixime 200mg', reorderLevelStrips: 5000, batches: [{ number: 'CF-9021', expiry: '2027-08-31', boxes: 5000 }] },
  { code: 'PAN-DSR', name: 'PantoDSR', composition: 'Pantoprazole + Domperidone', reorderLevelStrips: 2500, batches: [{ number: 'PT-8412', expiry: '2027-11-30', boxes: 2850 }] },
  { code: 'CLV-625', name: 'ClavamStrong 625', composition: 'Amoxicillin + Clavulanate', reorderLevelStrips: 3000, batches: [{ number: 'CL-7741', expiry: '2027-05-31', boxes: 1800 }] },
  { code: 'MON-L', name: 'Montair-L', composition: 'Montelukast + Levocetirizine', reorderLevelStrips: 3000, batches: [{ number: 'ML-3920', expiry: '2027-10-31', boxes: 2200 }] }
];

async function main() {
  const organization = await prisma.organization.upsert({ where: { id: 'sanode-demo' }, update: { name: 'Sanode Pharmaceuticals' }, create: { id: 'sanode-demo', name: 'Sanode Pharmaceuticals' } });
  const seedPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMeBeforeProduction!';
  const salt = randomBytes(16);
  const passwordHash = `scrypt:${salt.toString('base64')}:${scryptSync(seedPassword, salt, 64).toString('base64')}`;
  await prisma.user.upsert({ where: { email: 'admin@sanode.local' }, update: { organizationId: organization.id, name: 'Sanode Admin', role: 'ADMIN', isActive: true, passwordHash }, create: { organizationId: organization.id, email: 'admin@sanode.local', name: 'Sanode Admin', role: 'ADMIN', passwordHash } });
  for (const item of products) {
    const availableStrips = item.batches.reduce((sum, batch) => sum + batch.boxes * 10, 0);
    const product = await prisma.product.upsert({
      where: { organizationId_code: { organizationId: organization.id, code: item.code } },
      update: { name: item.name, composition: item.composition, availableStrips, reorderLevelStrips: item.reorderLevelStrips },
      create: { organizationId: organization.id, code: item.code, name: item.name, composition: item.composition, stripsPerBox: 10, availableStrips, reorderLevelStrips: item.reorderLevelStrips }
    });
    for (const input of item.batches) {
      const strips = input.boxes * 10;
      await prisma.batch.upsert({
        where: { productId_batchNumber: { productId: product.id, batchNumber: input.number } },
        update: { availableStrips: strips, receivedStrips: strips, expiryDate: new Date(input.expiry) },
        create: { productId: product.id, batchNumber: input.number, expiryDate: new Date(input.expiry), unitCostPaise: 0, receivedStrips: strips, availableStrips: strips, supplierName: 'Sanode Manufacturing', supplierRef: 'OPENING-BALANCE' }
      });
    }
  }
  const ferenorm = await prisma.product.findUnique({ where: { organizationId_code: { organizationId: organization.id, code: 'FER-10' } } });
  if (ferenorm) {
    await prisma.tradeScheme.upsert({
      where: { id: 'ferenorm-buy-2-free-4' },
      update: { isActive: true },
      create: { id: 'ferenorm-buy-2-free-4', productId: ferenorm.id, name: 'Buy 2 boxes, get 4 strips free', minimumBoxes: 2, freeStrips: 4, effectiveFrom: new Date('2026-01-01') }
    });
  }
  console.log(`Seeded ${products.length} products for ${organization.name}.`);
}

main().finally(() => prisma.$disconnect());
