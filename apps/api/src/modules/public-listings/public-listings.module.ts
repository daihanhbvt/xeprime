import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module';
import { PricingModule } from '../pricing/pricing.module';
import { PublicListingsController } from './public-listings.controller';
import { PublicDestinationsController } from './public-destinations.controller';
import { PublicShopsController } from './public-shops.controller';
import { ListingsSyncModule } from './listings-sync.module';
import { PublicListingsService } from './public-listings.service';
import { VehicleSettingsModule } from '../vehicle-settings/vehicle-settings.module';

/**
 * Marketplace công khai. Snapshot `public_listings` do `ListingsSyncModule` giữ (writer,
 * ADR 0008) — module này chỉ ĐỌC, và re-export writer để các module cũ không phải đổi import.
 */
@Module({
  // Quy tham số `province` (tên, link cũ) về mã đi qua ProvincesService — không tự query bảng bí danh.
  // PricingModule: chi tiết listing lộ mốc ưu đãi dài hạn (đọc qua effectivePolicy — một nguồn giá).
  // VehicleSettingsModule: chi tiết xe công bố giấy tờ/điều khoản/khung giờ/phụ phí mặc định.
  imports: [LocationsModule, PricingModule, ListingsSyncModule, VehicleSettingsModule],
  controllers: [PublicListingsController, PublicDestinationsController, PublicShopsController],
  providers: [PublicListingsService],
  exports: [ListingsSyncModule],
})
export class PublicListingsModule {}
