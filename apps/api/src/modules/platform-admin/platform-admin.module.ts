import { Module } from '@nestjs/common';
import { PublicListingsModule } from '../public-listings/public-listings.module';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformApprovalService } from './platform-approval.service';

/**
 * Nền tảng — duyệt gian hàng (Phase 2). Endpoint gắn `@PlatformOnly()` (PlatformScopeGuard nạp
 * scope) + `@RequirePermissions(platform.approvals.review)`; mọi thao tác ghi `audit_logs`.
 * Xe/giấy tờ và dashboard đầy đủ mở ở Phase 7.
 */
@Module({
  imports: [PublicListingsModule],
  controllers: [PlatformAdminController],
  providers: [PlatformApprovalService],
})
export class PlatformAdminModule {}
