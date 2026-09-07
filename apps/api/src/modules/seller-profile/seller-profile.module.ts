import { Module } from '@nestjs/common';
import { PlatformSellerProfilesController } from './platform-seller-profiles.controller';
import { SellerProfileController } from './seller-profile.controller';
import { SellerProfileService } from './seller-profile.service';

/**
 * Hồ sơ người bán (R3). Một service phục vụ HAI bề mặt — gian hàng khai, nền tảng xác minh —
 * vì cả hai đọc/ghi cùng một bảng và cùng một máy trạng thái; tách đôi là mời hai bên trôi khỏi
 * nhau về luật "khi nào sửa được".
 */
@Module({
  controllers: [SellerProfileController, PlatformSellerProfilesController],
  providers: [SellerProfileService],
  exports: [SellerProfileService],
})
export class SellerProfileModule {}
