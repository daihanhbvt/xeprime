import { Module } from '@nestjs/common';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';

/**
 * Hợp đồng thuê (Phase 6 §11.7). Snapshot từ booking, số HĐ cố định, idempotent theo booking.
 * AuditService là @Global nên không cần import.
 *
 * `BankAccountsModule` để lấy tài khoản nhận tiền của gian hàng in lên hợp đồng — không tự
 * query `bank_accounts`, vì `BankAccountsService` là writer/reader duy nhất của bảng đó
 * (ADR 0033).
 */
@Module({
  imports: [BankAccountsModule],
  controllers: [ContractsController],
  providers: [ContractsService],
})
export class ContractsModule {}
