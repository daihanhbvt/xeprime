import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module';
import { PricingModule } from '../pricing/pricing.module';
import { PublicListingsController } from './public-listings.controller';
import { PublicDestinationsController } from './public-destinations.controller';
import { PublicShopsController } from './public-shops.controller';
import { ListingsSyncModule } from './listings-sync.module';
import { PublicListingsService } from './public-listings.service';
import { MarketPriceService } from './market-price.service';
import { VehicleSettingsModule } from '../vehicle-settings/vehicle-settings.module';
import { HostMetricsModule } from '../host-metrics/host-metrics.module';

/**
 * Marketplace công khai. Snapshot `public_listings` do `ListingsSyncModule` giữ (writer,
 * ADR 0008) — module này chỉ ĐỌC, và re-export writer để các module cũ không phải đổi import.
 */
@Module({
  // Quy tham số `province` (tên, link cũ) về mã đi qua ProvincesService — không tự query bảng bí danh.
  // PricingModule: chi tiết listing lộ mốc ưu đãi dài hạn (đọc qua effectivePolicy — một nguồn giá).
  // VehicleSettingsModule: chi tiết xe công bố giấy tờ/điều khoản/khung giờ/phụ phí mặc định.
  // HostMetricsModule: ba chỉ số công khai của gian hàng — một nguồn tính cho mọi bề mặt
  // (ADR 0045 điều 2), không phải một phép cộng mảng trạng thái viết lại ở từng service.
  imports: [
    LocationsModule,
    PricingModule,
    ListingsSyncModule,
    VehicleSettingsModule,
    HostMetricsModule,
  ],
  controllers: [PublicListingsController, PublicDestinationsController, PublicShopsController],
  providers: [PublicListingsService, MarketPriceService],
  exports: [ListingsSyncModule],
})
export class PublicListingsModule {}
