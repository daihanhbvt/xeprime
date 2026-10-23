import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createInsurancePartner } from '@xeprime/prisma';
import { BookingInsuranceController } from './booking-insurance.controller';
import {
  PlatformInsuranceProductsController,
  PublicInsuranceProductsController,
} from './insurance-products.controller';
import { InsuranceOfferService } from './insurance-offer.service';
import { InsuranceProductsService } from './insurance-products.service';
import { InsuranceReadService } from './insurance-read.service';
import { InsuranceService } from './insurance.service';
import { INSURANCE_PARTNER, type InsurancePartner } from './partner/insurance-partner.port';
import { PlatformInsuranceController } from './platform-insurance.controller';

/**
 * Bảo hiểm chuyến `IV`/`IP` — ADR 0032 điều 4, ADR 0028 điều 5, ADR 0064.
 *
 * `InsuranceService` là writer DUY NHẤT của `booking_insurance_policies`; `BookingsService` và
 * `HoldSettlementService` gọi các hàm `*WithinTx` trong transaction của chính chúng.
 * `InsuranceProductsService` là writer duy nhất của `insurance_products`.
 *
 * Đối tác đi qua một PORT có token DI, chọn bằng `INSURANCE_PARTNER` qua CHÍNH hàm worker dùng
 * (`createInsurancePartner` ở `@xeprime/prisma`):
 *
 *   none     — MẶC ĐỊNH: từ chối trung thực, không bao giờ trả về một số chứng nhận bịa.
 *   mic_mock — GCN MIC GIẢ LẬP (`TEST-MIC-…`, `is_test = true`) để chạy trọn luồng ở dev/staging.
 *              `env.schema.ts` từ chối boot nếu bật nó ở production; hàm chọn adapter cũng ném.
 *
 * Việc PHÁT HÀNH thật chạy ở worker (`jobs/insurance-issue.ts`) mỗi 60 giây. API chỉ đọc
 * `partner.configured` (nút thử lại) và `partner.partnerName` (snapshot hợp đồng).
 */
@Module({
  controllers: [
    PlatformInsuranceController,
    PlatformInsuranceProductsController,
    PublicInsuranceProductsController,
    BookingInsuranceController,
  ],
  providers: [
    InsuranceService,
    InsuranceReadService,
    InsuranceProductsService,
    // Cổng "nền tảng có bán bảo hiểm loại này không" — PricingModule đọc nó cho mọi đường tính tiền.
    InsuranceOfferService,
    {
      provide: INSURANCE_PARTNER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): InsurancePartner => {
        const logger = new Logger(InsuranceModule.name);
        const partner = createInsurancePartner(config.get<string>('INSURANCE_PARTNER'), {
          appEnv: config.get<string>('APP_ENV'),
          logger: { warn: (message, meta) => logger.warn({ msg: message, ...meta }) },
        });
        if (partner.configured) {
          logger.warn(
            'INSURANCE_PARTNER=mic_mock — GCN bảo hiểm là GIẢ LẬP (TEST-…), không có hiệu lực bảo hiểm thật',
          );
        }
        return partner;
      },
    },
  ],
  exports: [
    InsuranceService,
    InsuranceReadService,
    InsuranceProductsService,
    InsuranceOfferService,
    INSURANCE_PARTNER,
  ],
})
export class InsuranceModule {}
