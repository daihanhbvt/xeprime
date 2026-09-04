import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { BankTransactionsController } from './bank-transactions.controller';
import { BankTransactionsService } from './bank-transactions.service';
import { SepayController } from './sepay.controller';
import { SepayService } from './sepay.service';

/**
 * Đối soát SePay (ADR 0016/0022 — R2). `SepayService` là writer DUY NHẤT của
 * `bank_transactions`; hiệu ứng lên hoá đơn/gói đi qua `BillingService` (writer của hai bảng
 * đó) trong CÙNG transaction — hai sổ không bao giờ lệch nhau nửa chừng.
 */
@Module({
  imports: [BillingModule],
  controllers: [SepayController, BankTransactionsController],
  providers: [SepayService, BankTransactionsService],
  exports: [SepayService],
})
export class SepayModule {}
