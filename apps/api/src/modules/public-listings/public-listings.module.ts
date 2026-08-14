import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module';
import { PublicListingsController } from './public-listings.controller';
import { PublicDestinationsController } from './public-destinations.controller';
import { PublicShopsController } from './public-shops.controller';
import { ListingsService } from './listings.service';
import { PublicListingsService } from './public-listings.service';

/**
 * Marketplace công khai + snapshot `public_listings`.
 * `ListingsService` (writer, ADR 0008) được export để `vehicles`/`platform-admin` gọi sync.
 */
@Module({
  // Quy tham số `province` (tên, link cũ) về mã đi qua ProvincesService — không tự query bảng bí danh.
  imports: [LocationsModule],
  controllers: [PublicListingsController, PublicDestinationsController, PublicShopsController],
  providers: [PublicListingsService, ListingsService],
  exports: [ListingsService],
})
export class PublicListingsModule {}
