import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PlatformLocationsController } from './platform-locations.controller';
import { ProvincesController } from './provinces.controller';
import { ProvincesService } from './provinces.service';

/**
 * Danh mục hành chính. `ProvincesService` được export vì đăng ký gian hàng và quản lý chi nhánh
 * đều phải hỏi cùng một chỗ "mã tỉnh này có dùng được không" — không ai tự query bảng `provinces`.
 */
@Module({
  imports: [AuditModule],
  controllers: [ProvincesController, PlatformLocationsController],
  providers: [ProvincesService],
  exports: [ProvincesService],
})
export class LocationsModule {}
