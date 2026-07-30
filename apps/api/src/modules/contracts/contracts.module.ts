import { Module } from '@nestjs/common';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';

/**
 * Hợp đồng thuê (Phase 6 §11.7). Snapshot từ booking, số HĐ cố định, idempotent theo booking.
 * AuditService là @Global nên không cần import.
 */
@Module({
  controllers: [ContractsController],
  providers: [ContractsService],
})
export class ContractsModule {}
