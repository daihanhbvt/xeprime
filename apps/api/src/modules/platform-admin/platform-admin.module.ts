import { Module } from '@nestjs/common';

/**
 * Skeleton — Phase 7.
 *
 * Ràng buộc: endpoint ở đây gắn `@PlatformOnly()`, KHÔNG dùng chung `TenantScopeGuard`
 * với API gian hàng (security rule: platform API không dùng chung guard với tenant API).
 * Mọi thao tác phải ghi `audit_logs`, và xem PII phải audit riêng.
 */
@Module({})
export class PlatformAdminModule {}
