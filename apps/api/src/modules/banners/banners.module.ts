import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { BannersService } from './banners.service';
import { PlatformBannersController } from './platform-banners.controller';
import { PublicBannersController } from './public-banners.controller';

/**
 * Banner marketplace (hero trang chủ). Import `StorageModule` để presign upload ảnh banner —
 * KHÔNG dựng client R2 thứ hai.
 */
@Module({
  imports: [StorageModule],
  controllers: [PublicBannersController, PlatformBannersController],
  providers: [BannersService],
})
export class BannersModule {}
