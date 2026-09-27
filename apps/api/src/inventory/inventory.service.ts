import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Batch, LedgerType, Prisma, Product } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCustomerDto, CreateProductDto, DispatchOrderDto, DispatchPreviewDto, ReceiveBatchDto, SampleDispatchDto } from './dto.js';

type Allocation = { batch: Batch; quantityStrips: number };

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listCustomers(organizationId: string, type?: string) {
    if (!organizationId) throw new BadRequestException('Authenticated organization is required.');
    const whereClause: Prisma.CustomerWhereInput = { organizationId };
    if (type) {
      whereClause.type = { contains: type, mode: 'insensitive' };
    }
    const customers = await this.prisma.customer.findMany({
      where: whereClause,
      orderBy: { name: 'asc' }
    });
    if (customers.length === 0 && !type) {
      const defaults = [
        { name: 'Om Hospital & Research Centre', type: 'Hospital' },
        { name: 'Apollo Pharmacy — MG Road', type: 'Pharmacy / Retailer' },
        { name: 'Dr. V. Mehta Clinic', type: 'Doctor' },
        { name: 'City Care Multispeciality Hospital', type: 'Hospital' },
        { name: 'Sanjivani Medical Store', type: 'Pharmacy / Retailer' }
      ];
      await this.prisma.customer.createMany({
        data: defaults.map(d => ({ ...d, organizationId })),
        skipDuplicates: true
      });
      return this.prisma.customer.findMany({
        where: whereClause,
        orderBy: { name: 'asc' }
      });
    }
    return customers;
  }

  async listRepresentatives(organizationId: string) {
    if (!organizationId) throw new BadRequestException('Authenticated organization is required.');
    const users = await this.prisma.user.findMany({
      where: { organizationId, role: { in: ['MR', 'SALES'] } },
      select: { id: true, name: true, role: true }
    });
    const defaults = [
      { id: 'rep-1', name: 'Rajesh Kumar (South Zone)', role: 'MR' },
      { id: 'rep-2', name: 'Amit Sharma (West Zone)', role: 'MR' },
      { id: 'rep-3', name: 'Vikram Singh (North Zone)', role: 'MR' },
      { id: 'rep-4', name: 'Priya Mehta (Central Zone)', role: 'MR' },
      { id: 'rep-5', name: 'Sunil Verma (East Zone)', role: 'MR' }
    ];
    if (users.length === 0) {
      return defaults;
    }
    const result = [...users];
    for (const d of defaults) {
      if (!result.some(u => u.name.toLowerCase() === d.name.toLowerCase())) {
        result.push(d as any);
      }
    }
    return result;
  }

  async createCustomer(dto: CreateCustomerDto) {
    const organizationId = dto.organizationId;
    if (!organizationId) throw new BadRequestException('Authenticated organization is required.');
    return this.prisma.customer.upsert({
      where: { organizationId_name: { organizationId, name: dto.name.trim() } },
      update: { type: dto.type },
      create: { organizationId, name: dto.name.trim(), type: dto.type }
    });
  }

  async createProduct(dto: CreateProductDto) {
    const organizationId = dto.organizationId;
    if (!organizationId) throw new BadRequestException('Authenticated organization is required.');
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.product.findUnique({
      where: { organizationId_code: { organizationId, code } }
    });
    if (existing) throw new ConflictException(`Product with code '${code}' already exists.`);
    return this.prisma.product.create({
      data: {
        organizationId,
        code,
        name: dto.name.trim(),
        composition: dto.composition?.trim() || null,
        stripsPerBox: dto.stripsPerBox,
        reorderLevelStrips: dto.reorderLevelStrips ?? 0,
        availableStrips: 0,
        isActive: true
      },
      include: { batches: true }
    });
  }

  listProducts(organizationId: string) {
    if (!organizationId) throw new BadRequestException('Authenticated organization is required.');
    return this.prisma.product.findMany({
      where: { isActive: true, organizationId },
      include: { batches: { where: { availableStrips: { gt: 0 } }, orderBy: { expiryDate: 'asc' } } },
      orderBy: { name: 'asc' }
    });
  }

  listLedger(organizationId: string, productId?: string, limit = 30) {
    if (!organizationId) throw new BadRequestException('Authenticated organization is required.');
    return this.prisma.stockLedgerEntry.findMany({
      where: { organizationId, ...(productId ? { productId } : {}) },
      take: Math.min(Math.max(limit, 1), 100),
      orderBy: { createdAt: 'desc' },
      include: {
        product: { select: { name: true, code: true, stripsPerBox: true } },
        batch: { select: { batchNumber: true, expiryDate: true } },
        createdBy: { select: { name: true } }
      }
    });
  }

  async getProduct(productId: string, organizationId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId, organizationId },
      include: {
        batches: { orderBy: { expiryDate: 'asc' } },
        ledgerEntries: { take: 100, orderBy: { createdAt: 'desc' }, include: { batch: true } }
      }
    });
    if (!product) throw new NotFoundException('Product not found.');
    return product;
  }

  async previewCommercialDispatch(dto: DispatchPreviewDto, organizationId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: dto.productId, organizationId, isActive: true } });
    if (!product) throw new NotFoundException('Product not found for this organization.');
    const now = new Date();
    const stripsPerBox = product.stripsPerBox;
    const billedStrips = dto.billedStrips ?? ((dto.billedBoxes ?? 1) * stripsPerBox);
    const billedBoxes = dto.billedBoxes ?? Math.ceil(billedStrips / stripsPerBox);
    const activeScheme = await this.prisma.tradeScheme.findFirst({
      where: { productId: product.id, isActive: true, minimumBoxes: { lte: billedBoxes }, effectiveFrom: { lte: now }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }] },
      orderBy: [{ freeStrips: 'desc' }, { minimumBoxes: 'desc' }]
    });
    const freeStrips = activeScheme?.freeStrips ?? 0;
    const totalStrips = billedStrips + freeStrips;
    const batches = await this.prisma.batch.findMany({
      where: { productId: product.id, availableStrips: { gt: 0 }, expiryDate: { gte: now }, isQuarantined: false },
      orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }]
    });
    let remaining = totalStrips;
    const allocations = batches.flatMap(batch => {
      if (!remaining) return [];
      const quantityStrips = Math.min(batch.availableStrips, remaining);
      remaining -= quantityStrips;
      return [{ batchNumber: batch.batchNumber, expiryDate: batch.expiryDate, quantityStrips, availableAfterStrips: batch.availableStrips - quantityStrips }];
    });
    return {
      product: { id: product.id, name: product.name, stripsPerBox: product.stripsPerBox },
      billedBoxes: dto.billedBoxes,
      billedStrips,
      freeStrips,
      totalStrips,
      scheme: activeScheme ? { name: activeScheme.name, minimumBoxes: activeScheme.minimumBoxes, freeStrips: activeScheme.freeStrips } : null,
      allocations,
      sufficient: remaining === 0,
      shortfallStrips: remaining,
      calculatedAt: now.toISOString(),
      notice: 'This is a live FEFO preview. Availability is rechecked when the dispatch is confirmed.'
    };
  }

  async receiveBatch(dto: ReceiveBatchDto, createdById?: string) {
    const organizationId = dto.organizationId;
    if (!organizationId) throw new BadRequestException('Authenticated organization is required.');
    const existing = await this.prisma.stockLedgerEntry.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existing) return { idempotent: true, receipt: existing };

    const product = await this.prisma.product.findFirst({ where: { id: dto.productId, organizationId } });
    if (!product) throw new NotFoundException('Product not found for this organization.');
    const expiryDate = new Date(dto.expiryDate);
    if (Number.isNaN(expiryDate.getTime()) || expiryDate <= new Date()) throw new BadRequestException('Received inventory must have a future expiry date.');
    const receivedStrips = dto.receivedBoxes * product.stripsPerBox;

    const supplierName = dto.supplierName?.trim() || 'Vendor Direct';

    return this.prisma.$transaction(async tx => {
      const lockedProduct = await this.lockProduct(tx, product.id);
      const duplicateBatch = await tx.batch.findUnique({ where: { productId_batchNumber: { productId: product.id, batchNumber: dto.batchNumber } } });
      if (duplicateBatch) throw new ConflictException('This batch number already exists for the selected product. Receive it through a controlled amendment instead.');

      const newProductBalance = lockedProduct.availableStrips + receivedStrips;
      const batch = await tx.batch.create({
        data: {
          productId: product.id,
          batchNumber: dto.batchNumber,
          expiryDate,
          manufacturingDate: dto.manufacturingDate ? new Date(dto.manufacturingDate) : null,
          unitCostPaise: dto.unitCostPaise,
          mrpPaise: dto.mrpPaise ?? null,
          gstRate: dto.gstRate ?? null,
          receivedStrips,
          availableStrips: receivedStrips,
          supplierName,
          supplierRef: dto.supplierRef
        }
      });
      await tx.product.update({ where: { id: product.id }, data: { availableStrips: newProductBalance } });
      const receipt = await tx.stockLedgerEntry.create({
        data: {
          organizationId, productId: product.id, batchId: batch.id,
          type: LedgerType.GOODS_RECEIPT, quantityStrips: receivedStrips,
          balanceAfterProduct: newProductBalance, balanceAfterBatch: receivedStrips,
          referenceType: 'GOODS_RECEIPT', referenceId: batch.id,
          note: `Received ${dto.receivedBoxes} box(es) [Inv: ${dto.supplierRef}] from ${supplierName}.`,
          idempotencyKey: dto.idempotencyKey, createdById
        }
      });
      return { idempotent: false, batch, receipt };
    });
  }

  async dispatchCommercialOrder(dto: DispatchOrderDto, createdById?: string) {
    const organizationId = dto.organizationId;
    if (!organizationId) throw new BadRequestException('Authenticated organization is required.');
    const existing = await this.prisma.stockLedgerEntry.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existing) return { idempotent: true, orderId: existing.referenceId };

    const product = await this.prisma.product.findFirst({ where: { id: dto.productId, organizationId } });
    if (!product) throw new NotFoundException('Product not found for this organization.');
    const stripsPerBox = product.stripsPerBox;
    const billedStrips = dto.billedStrips ?? ((dto.billedBoxes ?? 1) * stripsPerBox);
    const billedBoxes = dto.billedBoxes ?? Math.ceil(billedStrips / stripsPerBox);
    const activeScheme = await this.prisma.tradeScheme.findFirst({
      where: {
        productId: product.id, isActive: true, minimumBoxes: { lte: billedBoxes }, effectiveFrom: { lte: new Date() },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: new Date() } }]
      },
      orderBy: [{ freeStrips: 'desc' }, { minimumBoxes: 'desc' }]
    });
    const freeStrips = Math.max(dto.freeStrips ?? 0, activeScheme?.freeStrips ?? 0);
    const totalStrips = billedStrips + freeStrips;

    return this.prisma.$transaction(async tx => {
      // Auto-cache client to master directory if new
      await tx.customer.upsert({
        where: { organizationId_name: { organizationId, name: dto.customerName.trim() } },
        update: { type: dto.customerType },
        create: { organizationId, name: dto.customerName.trim(), type: dto.customerType }
      });

      const lockedProduct = await this.lockProduct(tx, product.id);
      if (!lockedProduct || lockedProduct.availableStrips < totalStrips) throw new ConflictException('Insufficient available stock. Refresh the order and try again.');
      const allocations = await this.lockAndAllocateFEFO(tx, product.id, totalStrips);
      const order = await tx.salesOrder.create({
        data: { organizationId, orderNumber: `SO-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`, customerName: dto.customerName.trim(), customerType: dto.customerType, status: 'DISPATCHED', dispatchedAt: new Date() }
      });
      const line = await tx.salesOrderLine.create({
        data: {
          salesOrderId: order.id, productId: product.id, billedBoxes, billedStrips, freeStrips,
          unitPricePaise: dto.unitPricePaise,
          schemeSnapshot: activeScheme ? { schemeId: activeScheme.id, name: activeScheme.name, freeStrips: activeScheme.freeStrips } : Prisma.JsonNull
        }
      });
      const entries = await this.persistDispatchAllocations(tx, {
        organizationId, productId: product.id, orderId: order.id, lineId: line.id,
        allocations, billedStrips, totalStrips, openingProductBalance: lockedProduct.availableStrips,
        note: dto.note, idempotencyKey: dto.idempotencyKey, createdById
      });
      await tx.product.update({ where: { id: product.id }, data: { availableStrips: lockedProduct.availableStrips - totalStrips } });
      return { idempotent: false, orderId: order.id, billedStrips, freeStrips, totalStrips, allocations: entries };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async dispatchSample(dto: SampleDispatchDto, createdById?: string) {
    const organizationId = dto.organizationId;
    if (!organizationId) throw new BadRequestException('Authenticated organization is required.');
    const existing = await this.prisma.stockLedgerEntry.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existing) return { idempotent: true, referenceId: existing.referenceId };
    const product = await this.prisma.product.findFirst({ where: { id: dto.productId, organizationId } });
    if (!product) throw new NotFoundException('Product not found for this organization.');

    // Calculate effective strips based on unit type (Boxes vs Strips)
    const unit = (dto.unitType || 'Strips').toLowerCase() === 'boxes' ? 'Boxes' : 'Strips';
    const inputQty = dto.quantity ?? (dto.quantityStrips ?? 1);
    const effectiveStrips = unit === 'Boxes'
      ? inputQty * (product.stripsPerBox || 10)
      : (dto.quantityStrips ?? inputQty);

    if (effectiveStrips < 1) {
      throw new BadRequestException('Sample quantity must be at least 1 strip or 1 box.');
    }

    // Auto-cache Doctor into master client directory if not present
    const docName = dto.doctorName?.trim();
    if (docName) {
      await this.prisma.customer.upsert({
        where: { organizationId_name: { organizationId, name: docName } },
        update: {},
        create: { organizationId, name: docName, type: 'Doctor' }
      }).catch(() => {});
    }

    const mrName = dto.mrName?.trim() || 'Field Representative';

    return this.prisma.$transaction(async tx => {
      const lockedProduct = await this.lockProduct(tx, product.id);
      if (!lockedProduct || lockedProduct.availableStrips < effectiveStrips) {
        throw new ConflictException(`Insufficient available stock for this sample (${effectiveStrips} strips requested, ${lockedProduct?.availableStrips ?? 0} available).`);
      }
      const allocations = await this.lockAndAllocateFEFO(tx, product.id, effectiveStrips);
      let productBalance = lockedProduct.availableStrips;
      const referenceId = `SAMPLE-${Date.now()}`;
      const qtyLabel = unit === 'Boxes'
        ? `${inputQty} boxes (${effectiveStrips} strips)`
        : `${effectiveStrips} strips`;

      for (const allocation of allocations) {
        productBalance -= allocation.quantityStrips;
        const batchBalance = allocation.batch.availableStrips - allocation.quantityStrips;
        await tx.batch.update({ where: { id: allocation.batch.id }, data: { availableStrips: batchBalance } });
        const entry = await tx.stockLedgerEntry.create({
          data: {
            organizationId, productId: product.id, batchId: allocation.batch.id,
            type: LedgerType.MR_SAMPLE_DISPATCH, quantityStrips: -allocation.quantityStrips,
            balanceAfterProduct: productBalance, balanceAfterBatch: batchBalance,
            referenceType: 'MR_SAMPLE', referenceId,
            note: `MR: ${mrName}; Doctor: ${docName}; Given: ${qtyLabel}.${dto.note ? ` ${dto.note.trim()}` : ''}`,
            idempotencyKey: allocation === allocations[0] ? dto.idempotencyKey : null, createdById
          }
        });
        await tx.stockAllocation.create({ data: { stockLedgerEntryId: entry.id, batchId: allocation.batch.id, quantityStrips: allocation.quantityStrips } });
      }
      await tx.product.update({ where: { id: product.id }, data: { availableStrips: lockedProduct.availableStrips - effectiveStrips } });
      return {
        idempotent: false,
        referenceId,
        productName: product.name,
        doctorName: docName,
        mrName,
        unitType: unit,
        quantity: inputQty,
        quantityStrips: effectiveStrips,
        allocations: allocations.map(a => ({
          batchNumber: a.batch.batchNumber,
          expiryDate: a.batch.expiryDate,
          quantityStrips: a.quantityStrips,
          availableAfterStrips: a.batch.availableStrips - a.quantityStrips
        }))
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async lockAndAllocateFEFO(tx: Prisma.TransactionClient, productId: string, requestedStrips: number): Promise<Allocation[]> {
    const batches = await tx.$queryRaw<Batch[]>`
      SELECT * FROM "Batch"
      WHERE "productId" = ${productId}
        AND "availableStrips" > 0
        AND "expiryDate" >= CURRENT_DATE
        AND "isQuarantined" = false
      ORDER BY "expiryDate" ASC, "receivedAt" ASC
      FOR UPDATE
    `;
    let remaining = requestedStrips;
    const allocations: Allocation[] = [];
    for (const batch of batches) {
      if (remaining === 0) break;
      const quantityStrips = Math.min(batch.availableStrips, remaining);
      allocations.push({ batch, quantityStrips });
      remaining -= quantityStrips;
    }
    if (remaining > 0) throw new ConflictException('Insufficient non-expired stock after FEFO allocation.');
    return allocations;
  }

  private async lockProduct(tx: Prisma.TransactionClient, productId: string): Promise<Product> {
    const products = await tx.$queryRaw<Product[]>`SELECT * FROM "Product" WHERE "id" = ${productId} FOR UPDATE`;
    const product = products[0];
    if (!product) throw new NotFoundException('Product not found.');
    return product;
  }

  private async persistDispatchAllocations(
    tx: Prisma.TransactionClient,
    input: { organizationId: string; productId: string; orderId: string; lineId: string; allocations: Allocation[]; billedStrips: number; totalStrips: number; openingProductBalance: number; note?: string; idempotencyKey: string; createdById?: string }
  ) {
    const summary: Array<{ batchNumber: string; commercialStrips: number; freeStrips: number }> = [];
    let commercialRemaining = input.billedStrips;
    let productBalance = input.openingProductBalance;
    for (const allocation of input.allocations) {
      const commercialStrips = Math.min(commercialRemaining, allocation.quantityStrips);
      const freeStrips = allocation.quantityStrips - commercialStrips;
      commercialRemaining -= commercialStrips;
      let batchBalance = allocation.batch.availableStrips;
      for (const [type, quantityStrips] of [[LedgerType.COMMERCIAL_DISPATCH, commercialStrips], [LedgerType.FREE_GOODS_DISPATCH, freeStrips]] as const) {
        if (!quantityStrips) continue;
        batchBalance -= quantityStrips;
        productBalance -= quantityStrips;
        const entry = await tx.stockLedgerEntry.create({
          data: {
            organizationId: input.organizationId, productId: input.productId, batchId: allocation.batch.id, type,
            quantityStrips: -quantityStrips, balanceAfterProduct: productBalance, balanceAfterBatch: batchBalance,
            referenceType: 'SALES_ORDER', referenceId: input.orderId, note: input.note ?? null,
            idempotencyKey: type === LedgerType.COMMERCIAL_DISPATCH && allocation === input.allocations[0] ? input.idempotencyKey : null, createdById: input.createdById
          }
        });
        await tx.stockAllocation.create({ data: { salesOrderLineId: input.lineId, stockLedgerEntryId: entry.id, batchId: allocation.batch.id, quantityStrips } });
      }
      await tx.batch.update({ where: { id: allocation.batch.id }, data: { availableStrips: batchBalance } });
      summary.push({ batchNumber: allocation.batch.batchNumber, commercialStrips, freeStrips });
    }
    return summary;
  }
}
