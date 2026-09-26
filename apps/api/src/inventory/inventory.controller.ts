import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard, type AuthenticatedUser } from '../auth/jwt-auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { DispatchOrderDto, DispatchPreviewDto, ReceiveBatchDto, SampleDispatchDto } from './dto.js';
import { InventoryService } from './inventory.service.js';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('products') listProducts(@Req() req: Request & { user: AuthenticatedUser }, @Query('organizationId') _organizationId?: string) { return this.inventory.listProducts(req.user.organizationId); }
  @Get('ledger') ledger(@Req() req: Request & { user: AuthenticatedUser }, @Query('productId') productId?: string, @Query('limit') limit?: string) { return this.inventory.listLedger(req.user.organizationId, productId, limit ? Number(limit) : undefined); }
  @Get('dispatch-preview') previewDispatch(@Req() req: Request & { user: AuthenticatedUser }, @Query() query: DispatchPreviewDto) { return this.inventory.previewCommercialDispatch(query, req.user.organizationId); }
  @Get('products/:productId') product(@Req() req: Request & { user: AuthenticatedUser }, @Param('productId') productId: string) { return this.inventory.getProduct(productId, req.user.organizationId); }
  @Post('receipts') @Roles('ADMIN', 'WAREHOUSE', 'ACCOUNTS') receive(@Req() req: Request & { user: AuthenticatedUser }, @Body() dto: ReceiveBatchDto) { return this.inventory.receiveBatch({ ...dto, organizationId: req.user.organizationId }, req.user.userId); }
  @Post('dispatches') @Roles('ADMIN', 'WAREHOUSE', 'SALES') dispatch(@Req() req: Request & { user: AuthenticatedUser }, @Body() dto: DispatchOrderDto) { return this.inventory.dispatchCommercialOrder({ ...dto, organizationId: req.user.organizationId }, req.user.userId); }
  @Post('samples') @Roles('ADMIN', 'MR', 'SALES') sample(@Req() req: Request & { user: AuthenticatedUser }, @Body() dto: SampleDispatchDto) { return this.inventory.dispatchSample({ ...dto, organizationId: req.user.organizationId }, req.user.userId); }
}
