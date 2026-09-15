import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { FinanceModule } from '../finance/finance.module';
import { AccountPaymentsController } from './account-payments.controller';
import { AccountPaymentsService } from './account-payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

/**
 * Ghi nhận thanh toán đơn (Phase 6). Dùng `ReceiptsService` (FinanceModule) auto-tạo phiếu thu
 * và `BookingsService` (BookingsModule) trả đơn đã cập nhật. AuditService là @Global.
 *
 * HAI bề mặt trên cùng một bảng, và chúng KHÔNG dùng chung service:
 *  · `PaymentsController` — GIAN HÀNG ghi nhận tiền đã thu (tenant-scoped, có quyền ghi).
 *  · `AccountPaymentsController` — KHÁCH đọc tiền mình đã trả (khoá theo `customerUserId`).
 * Ranh giới đọc của hai phía khác hẳn nhau, nên trộn vào một service là mời một lượt sửa làm
 * rò dữ liệu của phía kia.
 */
@Module({
  imports: [FinanceModule, BookingsModule],
  controllers: [PaymentsController, AccountPaymentsController],
  providers: [PaymentsService, AccountPaymentsService],
})
export class PaymentsModule {}
