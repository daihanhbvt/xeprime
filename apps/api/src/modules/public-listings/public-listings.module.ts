import { Module } from '@nestjs/common';
import { PublicListingsController } from './public-listings.controller';
import { PublicListingsService } from './public-listings.service';

@Module({
  controllers: [PublicListingsController],
  providers: [PublicListingsService],
})
export class PublicListingsModule {}
