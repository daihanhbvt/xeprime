import { Module } from '@nestjs/common';
import { PublicListingsModule } from '../public-listings/public-listings.module';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformApprovalService } from './platform-approval.service';
import { PlatformTenantsController } from './platform-tenants.controller';
import { PlatformTenantsService } from './platform-tenants.service';

/**
 * Nền tảng — duyệt gian hàng (Phase 2) + quản lý gian hàng (Phase 7: list + khoá/mở khoá).
 * Endpoint gắn `@PlatformOnly()` (PlatformScopeGuard nạp scope) + `@RequirePermissions(platform.*)`;
 * mọi thao tác ghi `audit_logs`. AuditService là @Global.
 */
@Module({
  imports: [PublicListingsModule],
  controllers: [PlatformAdminController, PlatformTenantsController],
  providers: [PlatformApprovalService, PlatformTenantsService],
})
export class PlatformAdminModule {}
