import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { FinanceModule } from '../finance/finance.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

/**
 * Ghi nhận thanh toán đơn (Phase 6). Dùng `ReceiptsService` (FinanceModule) auto-tạo phiếu thu
 * và `BookingsService` (BookingsModule) trả đơn đã cập nhật. AuditService là @Global.
 */
@Module({
  imports: [FinanceModule, BookingsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
