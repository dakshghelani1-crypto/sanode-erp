import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateCustomerDto {
  @IsString() name!: string;
  @IsString() type!: string;
  @IsOptional() @IsString() organizationId?: string;
}

export class DispatchPreviewDto {
  @IsString() productId!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) billedBoxes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) billedStrips?: number;
}

export class CreateProductDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() composition?: string;
  @Type(() => Number) @IsInt() @Min(1) stripsPerBox!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) reorderLevelStrips?: number;
  @IsOptional() @IsString() organizationId?: string;
}

export class ReceiveBatchDto {
  @IsString() productId!: string;
  @IsString() batchNumber!: string;
  @IsDateString() expiryDate!: string;
  @IsOptional() @IsDateString() manufacturingDate?: string;
  @Type(() => Number) @IsInt() @Min(1) receivedBoxes!: number;
  @Type(() => Number) @IsInt() @Min(0) unitCostPaise!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) mrpPaise?: number;
  @IsOptional() @Type(() => Number) gstRate?: number;
  @IsOptional() @IsString() supplierName?: string;
  @IsString() supplierRef!: string;
  @IsOptional() @IsString() organizationId?: string;
  @IsString() idempotencyKey!: string;
}

export class DispatchOrderDto {
  @IsOptional() @IsString() organizationId?: string;
  @IsString() productId!: string;
  @IsString() customerName!: string;
  @IsString() customerType!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) billedBoxes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) billedStrips?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) freeStrips?: number;
  @Type(() => Number) @IsInt() @Min(0) unitPricePaise!: number;
  @IsOptional() @IsString() note?: string;
  @IsString() idempotencyKey!: string;
}

export class SampleDispatchDto {
  @IsOptional() @IsString() organizationId?: string;
  @IsString() productId!: string;
  @IsString() doctorName!: string;
  @IsString() mrName!: string;
  @IsOptional() @IsString() unitType?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantityStrips?: number;
  @IsOptional() @IsString() note?: string;
  @IsString() idempotencyKey!: string;
}
