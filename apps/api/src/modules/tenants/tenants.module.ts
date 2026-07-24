import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

/**
 * Vòng đời gian hàng phía chủ shop: đăng ký, hồ sơ, gửi duyệt.
 * Duyệt/từ chối (phía nền tảng) nằm ở PlatformAdminModule — hai phía không dùng chung guard.
 */
@Module({
  controllers: [TenantsController],
  providers: [TenantsService],
})
export class TenantsModule {}
