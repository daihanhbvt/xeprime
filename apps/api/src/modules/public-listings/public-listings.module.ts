import { Module } from '@nestjs/common';
import { PublicListingsController } from './public-listings.controller';
import { PublicShopsController } from './public-shops.controller';
import { ListingsService } from './listings.service';
import { PublicListingsService } from './public-listings.service';

/**
 * Marketplace công khai + snapshot `public_listings`.
 * `ListingsService` (writer, ADR 0008) được export để `vehicles`/`platform-admin` gọi sync.
 */
@Module({
  controllers: [PublicListingsController, PublicShopsController],
  providers: [PublicListingsService, ListingsService],
  exports: [ListingsService],
})
export class PublicListingsModule {}
