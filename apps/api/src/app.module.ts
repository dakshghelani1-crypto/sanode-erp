import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './health.controller.js';
import { PrismaService } from './prisma/prisma.service.js';
import { InventoryController } from './inventory/inventory.controller.js';
import { InventoryService } from './inventory/inventory.service.js';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    AuthModule
  ],
  controllers: [HealthController, InventoryController],
  providers: [
    PrismaService,
    InventoryService,
    { provide: APP_GUARD, useClass: ThrottlerGuard }
  ]
})
export class AppModule {}
