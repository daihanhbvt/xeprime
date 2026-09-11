import { Module } from '@nestjs/common';
import { AccountBankAccountsController } from './account-bank-accounts.controller';
import { BankAccountsService } from './bank-accounts.service';
import { ShopBankAccountsController } from './shop-bank-accounts.controller';

/**
 * Tài khoản ngân hàng NHẬN TIỀN (ADR 0033).
 *
 * Một service cho hai bề mặt — cá nhân và gian hàng — vì cả hai đọc/ghi cùng một bảng với cùng
 * luật che PII, cùng luật "đúng một mặc định" và cùng luật lưu trữ thay vì xoá. Tách đôi là mời
 * hai bên trôi khỏi nhau ở đúng những chỗ mà lệch nhau nghĩa là tiền vào sai tài khoản.
 *
 * Export service: `HoldSettlementService` (và sau này luồng rút tiền) cần đọc tài khoản nhận để
 * ghi SNAPSHOT vào lệnh chuyển — không tự query bảng này.
 */
@Module({
  controllers: [AccountBankAccountsController, ShopBankAccountsController],
  providers: [BankAccountsService],
  exports: [BankAccountsService],
})
export class BankAccountsModule {}
