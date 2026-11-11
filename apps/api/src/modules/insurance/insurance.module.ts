import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createInsurancePartner, MicClient, readMicConfig } from '@xeprime/prisma';
import { BookingInsuranceController } from './booking-insurance.controller';
import {
  PlatformInsuranceProductsController,
  PublicInsuranceProductsController,
} from './insurance-products.controller';
import { InsuranceCertificateService } from './insurance-certificate.service';
import { InsuranceEligibilityService } from './insurance-eligibility.service';
import { InsuranceOfferService } from './insurance-offer.service';
import { InsuranceProductsService } from './insurance-products.service';
import { InsuranceReadService } from './insurance-read.service';
import { InsuranceRemittanceController } from './insurance-remittance.controller';
import { InsuranceRemittanceService } from './insurance-remittance.service';
import { InsuranceService } from './insurance.service';
import {
  INSURANCE_PARTNER,
  MIC_CLIENT,
  type InsurancePartner,
} from './partner/insurance-partner.port';
import { PlatformInsuranceController } from './platform-insurance.controller';
import { VehicleInsuranceController } from './vehicle-insurance.controller';

/** Bộ `MIC_*` đọc qua ConfigService — cùng tên biến worker đọc từ process.env. */
function micConfigFrom(config: ConfigService) {
  const keys = [
    'MIC_BASE_URL',
    'MIC_USERNAME',
    'MIC_PASSWORD',
    'MIC_CLIENT_ID',
    'MIC_CLIENT_SECRET',
    'MIC_SANDBOX',
  ];
  return readMicConfig(Object.fromEntries(keys.map((k) => [k, config.get<string>(k)])));
}

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
    VehicleInsuranceController,
    InsuranceRemittanceController,
  ],
  providers: [
    InsuranceService,
    InsuranceReadService,
    InsuranceProductsService,
    // Cổng "nền tảng có bán bảo hiểm loại này không" — PricingModule đọc nó cho mọi đường tính tiền.
    InsuranceOfferService,
    // Điều kiện xe + báo giá bảo hiểm vật chất xe theo bậc (ADR 0088) — PricingModule đọc nó.
    InsuranceEligibilityService,
    InsuranceCertificateService,
    // Bảng kê trả phí hãng (ADR 0088 điều 6) — writer duy nhất của insurance_premium_remittances.
    InsuranceRemittanceService,
    /*
     * Client MIC dùng chung cho API (tải GCN PDF). `null` khi không chạy adapter MIC thật — mọi
     * chỗ dùng nó phải xử lý nhánh đó (GCN giả lập không có PDF).
     */
    {
      provide: MIC_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): MicClient | null => {
        if (config.get<string>('INSURANCE_PARTNER') !== 'mic') return null;
        const mic = micConfigFrom(config);
        return mic ? new MicClient(mic) : null;
      },
    },
    {
      provide: INSURANCE_PARTNER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): InsurancePartner => {
        const logger = new Logger(InsuranceModule.name);
        const partner = createInsurancePartner(config.get<string>('INSURANCE_PARTNER'), {
          appEnv: config.get<string>('APP_ENV'),
          logger: { warn: (message, meta) => logger.warn({ msg: message, ...meta }) },
          mic: micConfigFrom(config),
        });
        if (config.get<string>('INSURANCE_PARTNER') === 'mic_mock') {
          logger.warn(
            'INSURANCE_PARTNER=mic_mock - GCN bảo hiểm là GIẢ LẬP (TEST-…), không có hiệu lực bảo hiểm thật',
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
    InsuranceEligibilityService,
    InsuranceCertificateService,
    INSURANCE_PARTNER,
    MIC_CLIENT,
  ],
})
export class InsuranceModule {}
