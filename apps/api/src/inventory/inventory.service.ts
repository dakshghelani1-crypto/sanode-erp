import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Batch, LedgerType, Prisma, Product } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { DispatchOrderDto, DispatchPreviewDto, ReceiveBatchDto, SampleDispatchDto } from './dto.js';

type Allocation = { batch: Batch; quantityStrips: number };

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

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
    const activeScheme = await this.prisma.tradeScheme.findFirst({
      where: { productId: product.id, isActive: true, minimumBoxes: { lte: dto.billedBoxes }, effectiveFrom: { lte: now }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }] },
      orderBy: [{ freeStrips: 'desc' }, { minimumBoxes: 'desc' }]
    });
    const billedStrips = dto.billedBoxes * product.stripsPerBox;
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

    return this.prisma.$transaction(async tx => {
      const lockedProduct = await this.lockProduct(tx, product.id);
      const duplicateBatch = await tx.batch.findUnique({ where: { productId_batchNumber: { productId: product.id, batchNumber: dto.batchNumber } } });
      if (duplicateBatch) throw new ConflictException('This batch number already exists for the selected product. Receive it through a controlled amendment instead.');

      const newProductBalance = lockedProduct.availableStrips + receivedStrips;
      const batch = await tx.batch.create({
        data: {
          productId: product.id, batchNumber: dto.batchNumber, expiryDate,
          manufacturingDate: dto.manufacturingDate ? new Date(dto.manufacturingDate) : null,
          unitCostPaise: dto.unitCostPaise, receivedStrips, availableStrips: receivedStrips,
          supplierName: dto.supplierName, supplierRef: dto.supplierRef
        }
      });
      await tx.product.update({ where: { id: product.id }, data: { availableStrips: newProductBalance } });
      const receipt = await tx.stockLedgerEntry.create({
        data: {
          organizationId, productId: product.id, batchId: batch.id,
          type: LedgerType.GOODS_RECEIPT, quantityStrips: receivedStrips,
          balanceAfterProduct: newProductBalance, balanceAfterBatch: receivedStrips,
          referenceType: 'GOODS_RECEIPT', referenceId: batch.id,
          note: `Received ${dto.receivedBoxes} box(es) from ${dto.supplierName}; reference ${dto.supplierRef}.`,
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
    const activeScheme = await this.prisma.tradeScheme.findFirst({
      where: {
        productId: product.id, isActive: true, minimumBoxes: { lte: dto.billedBoxes }, effectiveFrom: { lte: new Date() },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: new Date() } }]
      },
      orderBy: [{ freeStrips: 'desc' }, { minimumBoxes: 'desc' }]
    });
    const billedStrips = dto.billedBoxes * product.stripsPerBox;
    const freeStrips = Math.max(dto.freeStrips, activeScheme?.freeStrips ?? 0);
    const totalStrips = billedStrips + freeStrips;

    return this.prisma.$transaction(async tx => {
      const lockedProduct = await this.lockProduct(tx, product.id);
      if (!lockedProduct || lockedProduct.availableStrips < totalStrips) throw new ConflictException('Insufficient available stock. Refresh the order and try again.');
      const allocations = await this.lockAndAllocateFEFO(tx, product.id, totalStrips);
      const order = await tx.salesOrder.create({
        data: { organizationId, orderNumber: `SO-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`, customerName: dto.customerName, customerType: dto.customerType, status: 'DISPATCHED', dispatchedAt: new Date() }
      });
      const line = await tx.salesOrderLine.create({
        data: {
          salesOrderId: order.id, productId: product.id, billedBoxes: dto.billedBoxes, billedStrips, freeStrips,
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

    return this.prisma.$transaction(async tx => {
      const lockedProduct = await this.lockProduct(tx, product.id);
      if (!lockedProduct || lockedProduct.availableStrips < dto.quantityStrips) throw new ConflictException('Insufficient available stock for this sample.');
      const allocations = await this.lockAndAllocateFEFO(tx, product.id, dto.quantityStrips);
      let productBalance = lockedProduct.availableStrips;
      const referenceId = `SAMPLE-${Date.now()}`;
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
            note: `MR: ${dto.mrName}; Doctor: ${dto.doctorName}.${dto.note ? ` ${dto.note}` : ''}`,
            idempotencyKey: allocation === allocations[0] ? dto.idempotencyKey : null, createdById
          }
        });
        await tx.stockAllocation.create({ data: { stockLedgerEntryId: entry.id, batchId: allocation.batch.id, quantityStrips: allocation.quantityStrips } });
      }
      await tx.product.update({ where: { id: product.id }, data: { availableStrips: lockedProduct.availableStrips - dto.quantityStrips } });
      return { idempotent: false, referenceId, quantityStrips: dto.quantityStrips, allocations };
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
