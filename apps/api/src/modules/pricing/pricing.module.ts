import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { PublicQuoteController } from './public-quote.controller';
import { ShopPoliciesController } from './shop-policies.controller';

/**
 * Chính sách thuê & tính giá (Wave 2 — B2).
 *
 * `PricingService` là NGUỒN TÍNH GIÁ DUY NHẤT: public quote, preview báo giá giao nhận và
 * duyệt yêu cầu → tạo đơn đều đi qua nó. Bản ghi đè theo XE do VehiclesService ghi (một writer
 * cho vehicles + override của nó, tái dùng knockback ADR 0008); module này chỉ validate và đọc.
 */
@Module({
  controllers: [ShopPoliciesController, PublicQuoteController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
