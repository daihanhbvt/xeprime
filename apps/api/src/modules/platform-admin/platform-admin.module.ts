import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { BranchesModule } from '../branches/branches.module';
import { PricingModule } from '../pricing/pricing.module';
import { PublicListingsModule } from '../public-listings/public-listings.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformApprovalService } from './platform-approval.service';
import { PlatformAuditController } from './platform-audit.controller';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformBookingsController } from './platform-bookings.controller';
import { PlatformBookingsService } from './platform-bookings.service';
import { PlatformCustomersController } from './platform-customers.controller';
import { PlatformCustomersService } from './platform-customers.service';
import { PlatformDashboardController } from './platform-dashboard.controller';
import { PlatformDashboardService } from './platform-dashboard.service';
import { PlatformStaffController } from './platform-staff.controller';
import { PlatformStaffService } from './platform-staff.service';
import { PlatformPartnerDetailService } from './platform-partner-detail.service';
import { PlatformPartnerOperationsService } from './platform-partner-operations.service';
import { PlatformPartnersController } from './platform-partners.controller';
import { PlatformTenantsController } from './platform-tenants.controller';
import { PlatformTenantsService } from './platform-tenants.service';
import { PlatformVehiclesController } from './platform-vehicles.controller';
import { PlatformVehiclesService } from './platform-vehicles.service';
import { PlatformVehicleApprovalsController } from './platform-vehicle-approvals.controller';
import { PlatformVehicleApprovalService } from './platform-vehicle-approval.service';

/**
 * Nền tảng — duyệt gian hàng (Phase 2) + Phase 7: quản lý gian hàng (list + khoá/mở khoá),
 * dashboard nền tảng, đọc nhật ký hệ thống, và 3 màn giám sát toàn hệ thống (xe / đơn thuê /
 * khách thuê — build plan §11.1).
 * Endpoint gắn `@PlatformOnly()` (PlatformScopeGuard nạp scope) + `@RequirePermissions(platform.*)`;
 * mọi thao tác ghi `audit_logs`. AuditService là @Global (chỉ GHI — đường đọc ở PlatformAuditService).
 */
@Module({
  // PricingModule: chính sách thuê HIỆU LỰC của xe cho màn duyệt xe (phiếu cũ đọc dữ liệu sống).
  // VehiclesModule (cảnh báo xe) + BranchesModule (chi nhánh kèm số xe): drawer chi tiết đối tác
  // đọc lại đúng hai nguồn đó thay vì dựng bản thứ hai của luật.
  imports: [PublicListingsModule, BillingModule, PricingModule, VehiclesModule, BranchesModule],
  controllers: [
    PlatformAdminController,
    PlatformVehicleApprovalsController,
    PlatformTenantsController,
    PlatformPartnersController,
    PlatformDashboardController,
    PlatformAuditController,
    PlatformStaffController,
    PlatformVehiclesController,
    PlatformBookingsController,
    PlatformCustomersController,
  ],
  providers: [
    PlatformApprovalService,
    PlatformVehicleApprovalService,
    PlatformTenantsService,
    PlatformPartnerDetailService,
    PlatformPartnerOperationsService,
    PlatformDashboardService,
    PlatformAuditService,
    PlatformStaffService,
    PlatformVehiclesService,
    PlatformBookingsService,
    PlatformCustomersService,
  ],
})
export class PlatformAdminModule {}
