import { Module } from '@nestjs/common';
import { PlatformTaxController } from './platform-tax.controller';
import { ShopTaxController } from './shop-tax.controller';
import { TaxReadService } from './tax-read.service';
import { TaxService } from './tax.service';

/**
 * Thuế khấu trừ của chuyến — Phase 8 (ADR 0032 điều 3, ADR 0028 điều 3–4).
 *
 * `TaxService` là writer DUY NHẤT của `tax_withholdings`; `BookingsService` gọi
 * `accrueForBookingWithinTx` trong transaction của lượt chuyển trạng thái.
 *
 * Module LÁ: chỉ cần Prisma + `AuditService` (@Global). Không import gì để `BookingsModule`
 * dùng được mà không tạo vòng — cùng lý do `InsuranceModule` đứng riêng.
 */
@Module({
  controllers: [PlatformTaxController, ShopTaxController],
  providers: [TaxService, TaxReadService],
  exports: [TaxService, TaxReadService],
})
export class TaxModule {}
