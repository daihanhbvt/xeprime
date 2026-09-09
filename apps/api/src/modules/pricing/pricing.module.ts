import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { FeePoliciesModule } from '../fee-policies/fee-policies.module';
import { GeoModule } from '../geo/geo.module';
import { ListingsSyncModule } from '../public-listings/listings-sync.module';
import { VehicleSettingsModule } from '../vehicle-settings/vehicle-settings.module';
import { DeliveryDistanceService } from './delivery-distance.service';
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
  // GeoModule: khoảng cách giao xe hỏi bản đồ ở `DeliveryDistanceService` — PricingService
  // vẫn không biết Internet tồn tại.
  // BillingModule + FeePoliciesModule (R3): báo giá công khai gắn phụ phí phía khách theo chế độ
  // thu phí của tenant và chính sách phí hiện hành (ADR 0029) — đọc, không ghi.
  // VehicleSettingsModule: báo giá công khai nói luôn "có tự nhận được không" (08/09/2026).
  imports: [ListingsSyncModule, GeoModule, BillingModule, FeePoliciesModule, VehicleSettingsModule],
  // `VehicleDailyPricesController`: giá riêng theo ngày — writer là chính PricingService,
  // để mọi báo giá và bản ghi đè cùng một chủ (không lặp lại writer thứ hai ở VehiclesService).
  controllers: [ShopPoliciesController, PublicQuoteController, VehicleDailyPricesController],
  providers: [PricingService, DeliveryDistanceService],
  exports: [PricingService],
})
export class PricingModule {}
