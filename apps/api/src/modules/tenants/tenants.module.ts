import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { BranchesModule } from '../branches/branches.module';
import { LocationsModule } from '../locations/locations.module';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

/**
 * Vòng đời gian hàng phía chủ shop: đăng ký, hồ sơ, gửi duyệt.
 * Duyệt/từ chối (phía nền tảng) nằm ở PlatformAdminModule — hai phía không dùng chung guard.
 *
 * Import `BranchesModule` + `BillingModule` vì đăng ký gian hàng tạo chi nhánh mặc định VÀ gán
 * gói mặc định (ADR 0015 điều 9) trong CÙNG transaction —
 * đi qua service của chi nhánh chứ không tự `tx.tenantBranch.create()` ở đây.
 */
@Module({
  imports: [LocationsModule, BranchesModule, BillingModule],
  controllers: [TenantsController],
  providers: [TenantsService],
})
export class TenantsModule {}
