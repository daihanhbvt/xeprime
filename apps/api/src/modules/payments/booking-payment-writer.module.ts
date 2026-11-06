import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { BookingPaymentWriter } from './booking-payment.writer';

/**
 * Module LÁ của lõi ghi thu tiền đơn — chỉ phụ thuộc `FinanceModule` (+ Audit @Global), nên cả
 * `PaymentsModule` lẫn `BookingsModule` (lượt nhận lại xe) import được mà không tạo vòng.
 */
@Module({
  imports: [FinanceModule],
  providers: [BookingPaymentWriter],
  exports: [BookingPaymentWriter],
})
export class BookingPaymentWriterModule {}
