import { Module } from '@nestjs/common';
import { ListingsSyncModule } from '../public-listings/listings-sync.module';
import { PricingService } from './pricing.service';
import { PublicQuoteController } from './public-quote.controller';
import { ShopPoliciesController } from './shop-policies.controller';
import { VehicleDailyPricesController } from './vehicle-daily-prices.controller';

/**
 * Chính sách thuê & tính giá (Wave 2 — B2).
 *
 * `PricingService` là NGUỒN TÍNH GIÁ DUY NHẤT: public quote, preview báo giá giao nhận và
 * duyệt yêu cầu → tạo đơn đều đi qua nó. Bản ghi đè theo XE do VehiclesService ghi (một writer
 * cho vehicles + override của nó, tái dùng knockback ADR 0008); module này chỉ validate và đọc.
 */
@Module({
  // ListingsSyncModule: lưu chính sách gian hàng phải kéo theo nhãn "Miễn thế chấp" trên sàn
  // cho các xe đang kế thừa — ghi qua writer duy nhất của public_listings (ADR 0008).
  imports: [ListingsSyncModule],
  // `VehicleDailyPricesController`: giá riêng theo ngày — writer là chính PricingService,
  // để mọi báo giá và bản ghi đè cùng một chủ (không lặp lại writer thứ hai ở VehiclesService).
  controllers: [ShopPoliciesController, PublicQuoteController, VehicleDailyPricesController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
