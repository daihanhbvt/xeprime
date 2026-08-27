import { Module } from '@nestjs/common';
import { BranchesModule } from '../branches/branches.module';
import { LocationsModule } from '../locations/locations.module';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

/**
 * Vòng đời gian hàng phía chủ shop: đăng ký, hồ sơ, gửi duyệt.
 * Duyệt/từ chối (phía nền tảng) nằm ở PlatformAdminModule — hai phía không dùng chung guard.
 *
 * Import `BranchesModule` vì đăng ký gian hàng tạo chi nhánh mặc định trong CÙNG transaction —
 * đi qua service của chi nhánh chứ không tự `tx.tenantBranch.create()` ở đây.
 */
@Module({
  imports: [LocationsModule, BranchesModule],
  controllers: [TenantsController],
  providers: [TenantsService],
})
export class TenantsModule {}
