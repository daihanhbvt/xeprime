import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { BookingExtensionsModule } from '../booking-extensions/booking-extensions.module';
import { HoldsModule } from '../holds/holds.module';
import { WalletModule } from '../wallet/wallet.module';
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
  // WalletModule (ADR 0092): tiền về muộn của khoản giữ chỗ / phụ lục được ghi có ví khách.
  imports: [BillingModule, HoldsModule, BookingExtensionsModule, WalletModule],
  controllers: [SepayController, BankTransactionsController],
  providers: [SepayService, BankTransactionsService],
  exports: [SepayService],
})
export class SepayModule {}
