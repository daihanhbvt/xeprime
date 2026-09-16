import { Module } from '@nestjs/common';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { PlatformWithdrawalService } from './platform-withdrawal.service';
import { PlatformWithdrawalsController } from './platform-withdrawals.controller';
import { AccountWalletController, ShopWalletController } from './wallet.controller';
import { WalletReadService } from './wallet-read.service';
import { WalletStatementService } from './wallet-statement.service';
import { WalletService } from './wallet.service';
import { WithdrawalService } from './withdrawal.service';

/**
 * Sổ công nợ phải trả — "Ví điểm" (ADR 0033).
 *
 * Bốn service, bốn vai rõ ràng: `WalletService` là writer DUY NHẤT của sổ cái;
 * `WalletReadService` phục vụ màn số dư và sổ; `WalletStatementService` dựng bảng tổng hợp giao
 * dịch theo kỳ (đọc bookings/reviews/requests/hoá đơn gói, không đụng sổ ví);
 * `WithdrawalService` lo vòng đời lệnh rút. Tách đọc khỏi ghi để đường GHI TIỀN không mọc thêm
 * bề mặt mỗi lần cần một màn hình mới.
 *
 * Export `WalletService`: `holds` ghi có trong transaction của chính nó, không đụng bảng trực tiếp.
 */
@Module({
  imports: [BankAccountsModule],
  controllers: [AccountWalletController, ShopWalletController, PlatformWithdrawalsController],
  providers: [
    WalletService,
    WalletReadService,
    WalletStatementService,
    WithdrawalService,
    PlatformWithdrawalService,
  ],
  exports: [WalletService],
})
export class WalletModule {}
