import { Global, Module } from '@nestjs/common';
import { FeePoliciesModule } from '../fee-policies/fee-policies.module';
import { TenantSupportController } from './tenant-support.controller';
import { TenantSupportService } from './tenant-support.service';

/**
 * Không gian hỗ trợ gian hàng — ADR 0050.
 *
 * Global vì `TenantScopeGuard` (đăng ký ở tầng app, chạy cho mọi request tenant-scoped) cần
 * `TenantSupportService` để xác minh phiên — cùng lý do `RbacModule` là global.
 */
@Global()
@Module({
  // % phí dịch vụ của gian hàng tuyến hoa hồng — cùng nguồn `/auth/me` đọc.
  imports: [FeePoliciesModule],
  controllers: [TenantSupportController],
  providers: [TenantSupportService],
  exports: [TenantSupportService],
})
export class TenantSupportModule {}
