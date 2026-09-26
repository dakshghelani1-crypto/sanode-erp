import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class DispatchPreviewDto {
  @IsString() productId!: string;
  @Type(() => Number) @IsInt() @Min(1) billedBoxes!: number;
}

export class ReceiveBatchDto {
  @IsString() productId!: string;
  @IsString() batchNumber!: string;
  @IsDateString() expiryDate!: string;
  @IsOptional() @IsDateString() manufacturingDate?: string;
  @Type(() => Number) @IsInt() @Min(1) receivedBoxes!: number;
  @Type(() => Number) @IsInt() @Min(0) unitCostPaise!: number;
  @IsString() supplierName!: string;
  @IsString() supplierRef!: string;
  @IsOptional() @IsString() organizationId?: string;
  @IsString() idempotencyKey!: string;
}

export class DispatchOrderDto {
  @IsOptional() @IsString() organizationId?: string;
  @IsString() productId!: string;
  @IsString() customerName!: string;
  @IsString() customerType!: string;
  @Type(() => Number) @IsInt() @Min(1) billedBoxes!: number;
  @Type(() => Number) @IsInt() @Min(0) freeStrips!: number;
  @Type(() => Number) @IsInt() @Min(0) unitPricePaise!: number;
  @IsOptional() @IsString() note?: string;
  @IsString() idempotencyKey!: string;
}

export class SampleDispatchDto {
  @IsOptional() @IsString() organizationId?: string;
  @IsString() productId!: string;
  @IsString() doctorName!: string;
  @IsString() mrName!: string;
  @Type(() => Number) @IsInt() @Min(1) quantityStrips!: number;
  @IsOptional() @IsString() note?: string;
  @IsString() idempotencyKey!: string;
}
