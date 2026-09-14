import { Module } from '@nestjs/common';
import { InsuranceReadService } from './insurance-read.service';
import { InsuranceService } from './insurance.service';
import { INSURANCE_PARTNER } from './partner/insurance-partner.port';
import { NoopInsurancePartner } from './partner/noop-insurance.partner';
import { PlatformInsuranceController } from './platform-insurance.controller';

/**
 * Bảo hiểm chuyến `IV`/`IP` — Phase 7 (ADR 0032 điều 4, ADR 0028 điều 5).
 *
 * `InsuranceService` là writer DUY NHẤT của `booking_insurance_policies`; `BookingsService` và
 * `HoldSettlementService` gọi các hàm `*WithinTx` trong transaction của chính chúng.
 *
 * Đối tác đi qua một PORT có token DI. Bản mặc định `NoopInsurancePartner` **từ chối trung thực**
 * — nó không bao giờ trả về một số chứng nhận bịa, vì một dòng `issued` giả là một lời khẳng
 * định với khách rằng họ có bảo hiểm. Cắm đối tác thật = đổi đúng dòng `useClass` dưới đây.
 *
 * Không phụ thuộc module nào khác: `AuditService` là @Global, và cổng ra là một interface.
 */
@Module({
  controllers: [PlatformInsuranceController],
  providers: [
    InsuranceService,
    InsuranceReadService,
    { provide: INSURANCE_PARTNER, useClass: NoopInsurancePartner },
  ],
  exports: [InsuranceService, InsuranceReadService],
})
export class InsuranceModule {}
