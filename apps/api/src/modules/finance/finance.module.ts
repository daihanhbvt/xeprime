import { Module } from '@nestjs/common';
import { FinanceCategoriesController } from './finance-categories.controller';
import { FinanceCategoriesService } from './finance-categories.service';
import { FinanceOverviewController } from './finance-overview.controller';
import { FinanceOverviewService } from './finance-overview.service';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';

/**
 * Tài chính Thu/Chi (Phase 6). AuditService là @Global. Export `ReceiptsService` để PaymentsModule
 * (S2) auto-tạo phiếu thu đã-duyệt khi ghi nhận thanh toán.
 */
@Module({
  controllers: [FinanceCategoriesController, ReceiptsController, FinanceOverviewController],
  providers: [FinanceCategoriesService, ReceiptsService, FinanceOverviewService],
  exports: [ReceiptsService],
})
export class FinanceModule {}
