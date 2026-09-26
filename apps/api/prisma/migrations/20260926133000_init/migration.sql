-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'WAREHOUSE', 'SALES', 'MR', 'ACCOUNTS', 'VIEWER');
CREATE TYPE "LedgerType" AS ENUM ('OPENING_BALANCE', 'GOODS_RECEIPT', 'COMMERCIAL_DISPATCH', 'FREE_GOODS_DISPATCH', 'MR_SAMPLE_DISPATCH', 'CUSTOMER_RETURN', 'DAMAGE_WRITE_OFF', 'EXPIRY_QUARANTINE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT');
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'DISPATCHED', 'CANCELLED');

CREATE TABLE "Organization" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "User" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "email" TEXT NOT NULL, "name" TEXT NOT NULL, "passwordHash" TEXT NOT NULL, "role" "UserRole" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Product" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "composition" TEXT,
  "stripsPerBox" INTEGER NOT NULL, "reorderLevelStrips" INTEGER NOT NULL DEFAULT 0, "availableStrips" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Batch" (
  "id" TEXT NOT NULL, "productId" TEXT NOT NULL, "batchNumber" TEXT NOT NULL, "manufacturingDate" TIMESTAMP(3), "expiryDate" TIMESTAMP(3) NOT NULL,
  "unitCostPaise" INTEGER NOT NULL, "receivedStrips" INTEGER NOT NULL, "availableStrips" INTEGER NOT NULL, "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "supplierName" TEXT NOT NULL, "supplierRef" TEXT NOT NULL, "isQuarantined" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TradeScheme" (
  "id" TEXT NOT NULL, "productId" TEXT NOT NULL, "name" TEXT NOT NULL, "minimumBoxes" INTEGER NOT NULL, "freeStrips" INTEGER NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL, "effectiveUntil" TIMESTAMP(3), "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TradeScheme_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SalesOrder" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "orderNumber" TEXT NOT NULL, "customerName" TEXT NOT NULL, "customerType" TEXT NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "dispatchedAt" TIMESTAMP(3),
  CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SalesOrderLine" (
  "id" TEXT NOT NULL, "salesOrderId" TEXT NOT NULL, "productId" TEXT NOT NULL, "billedBoxes" INTEGER NOT NULL, "billedStrips" INTEGER NOT NULL,
  "freeStrips" INTEGER NOT NULL DEFAULT 0, "unitPricePaise" INTEGER NOT NULL, "schemeSnapshot" JSONB,
  CONSTRAINT "SalesOrderLine_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "StockLedgerEntry" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "productId" TEXT NOT NULL, "batchId" TEXT, "type" "LedgerType" NOT NULL,
  "quantityStrips" INTEGER NOT NULL, "balanceAfterProduct" INTEGER NOT NULL, "balanceAfterBatch" INTEGER, "referenceType" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL, "note" TEXT, "idempotencyKey" TEXT, "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockLedgerEntry_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "StockAllocation" (
  "id" TEXT NOT NULL, "salesOrderLineId" TEXT, "stockLedgerEntryId" TEXT NOT NULL, "batchId" TEXT NOT NULL, "quantityStrips" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "StockAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Product_organizationId_name_idx" ON "Product"("organizationId", "name");
CREATE UNIQUE INDEX "Product_organizationId_code_key" ON "Product"("organizationId", "code");
CREATE INDEX "Batch_productId_expiryDate_availableStrips_idx" ON "Batch"("productId", "expiryDate", "availableStrips");
CREATE UNIQUE INDEX "Batch_productId_batchNumber_key" ON "Batch"("productId", "batchNumber");
CREATE UNIQUE INDEX "SalesOrder_orderNumber_key" ON "SalesOrder"("orderNumber");
CREATE UNIQUE INDEX "StockLedgerEntry_idempotencyKey_key" ON "StockLedgerEntry"("idempotencyKey");
CREATE INDEX "StockLedgerEntry_productId_createdAt_idx" ON "StockLedgerEntry"("productId", "createdAt");
CREATE INDEX "StockLedgerEntry_batchId_createdAt_idx" ON "StockLedgerEntry"("batchId", "createdAt");
CREATE INDEX "StockLedgerEntry_organizationId_createdAt_idx" ON "StockLedgerEntry"("organizationId", "createdAt");

ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TradeScheme" ADD CONSTRAINT "TradeScheme_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockAllocation" ADD CONSTRAINT "StockAllocation_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "SalesOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockAllocation" ADD CONSTRAINT "StockAllocation_stockLedgerEntryId_fkey" FOREIGN KEY ("stockLedgerEntryId") REFERENCES "StockLedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockAllocation" ADD CONSTRAINT "StockAllocation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
