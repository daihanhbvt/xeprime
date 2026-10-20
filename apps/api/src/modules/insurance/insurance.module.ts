import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InsuranceReadService } from './insurance-read.service';
import { InsuranceService } from './insurance.service';
import { INSURANCE_PARTNER, type InsurancePartner } from './partner/insurance-partner.port';
import { MicMockInsurancePartner } from './partner/mic-mock-insurance.partner';
import { NoopInsurancePartner } from './partner/noop-insurance.partner';
import { PlatformInsuranceController } from './platform-insurance.controller';

/**
 * Bảo hiểm chuyến `IV`/`IP` — Phase 7 (ADR 0032 điều 4, ADR 0028 điều 5).
 *
 * `InsuranceService` là writer DUY NHẤT của `booking_insurance_policies`; `BookingsService` và
 * `HoldSettlementService` gọi các hàm `*WithinTx` trong transaction của chính chúng.
 *
 * Đối tác đi qua một PORT có token DI, chọn bằng `INSURANCE_PARTNER`:
 *
 *   none     — MẶC ĐỊNH: `NoopInsurancePartner` **từ chối trung thực**, không bao giờ trả về một số
 *              chứng nhận bịa — một dòng `issued` giả là một lời khẳng định với khách rằng họ có
 *              bảo hiểm.
 *   mic_mock — `MicMockInsurancePartner`: GCN điện tử MIC GIẢ LẬP để chạy trọn luồng ở dev/staging.
 *              `env.schema.ts` từ chối boot nếu bật nó ở production.
 *
 * Cắm đối tác thật = thêm một nhánh ở đây, không sửa `InsuranceService`.
 *
 * Không phụ thuộc module nào khác: `AuditService` là @Global, và cổng ra là một interface.
 */
@Module({
  controllers: [PlatformInsuranceController],
  providers: [
    InsuranceService,
    InsuranceReadService,
    {
      provide: INSURANCE_PARTNER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): InsurancePartner => {
        if (config.get<string>('INSURANCE_PARTNER') === 'mic_mock') {
          new Logger(InsuranceModule.name).warn(
            'INSURANCE_PARTNER=mic_mock — GCN bảo hiểm là GIẢ LẬP, không có hiệu lực bảo hiểm thật',
          );
          return new MicMockInsurancePartner();
        }
        return new NoopInsurancePartner();
      },
    },
  ],
  exports: [InsuranceService, InsuranceReadService],
})
export class InsuranceModule {}
