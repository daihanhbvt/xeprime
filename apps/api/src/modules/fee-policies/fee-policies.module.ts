import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FeePoliciesService } from './fee-policies.service';
import { PlatformFeePoliciesController } from './platform-fee-policies.controller';

/**
 * Chính sách phí có phiên bản (R3). Export service vì `PricingModule` (báo giá),
 * `BookingRequestsModule` (duyệt → hold) và `PublicListingsModule` (denormalize %) đều cần
 * "policy hiện hành" — và chỉ được lấy qua đây.
 */
@Module({
  imports: [AuditModule],
  providers: [FeePoliciesService],
  controllers: [PlatformFeePoliciesController],
  exports: [FeePoliciesService],
})
export class FeePoliciesModule {}
