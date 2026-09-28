import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentPlatform, PlatformOnly, RequirePermissions } from '../../common/decorators';
import type { PlatformContext } from '../../common/types/request-context';
import {
  PartnerActivityPageDto,
  PartnerActivityQueryDto,
  PartnerBillingDto,
  PartnerBookingListQueryDto,
  PartnerBookingPageDto,
  PartnerBookingRequestListQueryDto,
  PartnerBookingRequestPageDto,
  PartnerBookingSummaryDto,
  PartnerBookingSummaryQueryDto,
  PartnerCommissionDto,
  PartnerOverviewDto,
  PartnerProfileDto,
  PartnerSupportSessionPageDto,
  PartnerSupportSessionQueryDto,
  PartnerVehicleListQueryDto,
  PartnerVehiclePageDto,
} from './dto/platform-partner.dto';
import { PlatformPartnerDetailService } from './platform-partner-detail.service';
import { PlatformPartnerOperationsService } from './platform-partner-operations.service';

/**
 * Drawer CHI TIẾT đối tác của Platform Admin (28/09/2026) — **chỉ có GET**.
 *
 * Controller này cố ý không có một handler ghi nào: mọi thay đổi dữ liệu của đối tác đi qua phiên
 * hỗ trợ (ADR 0050) với capability allowlist của nó. Thêm một `@Post`/`@Patch` vào đây là phá
 * đúng lời hứa của màn hình — test `platform-partners.spec.ts` khoá điều đó.
 *
 * Quyền: class đòi `platform.tenants.view` (xem đối tác). Tab nào đọc dữ liệu của một miền khác thì
 * đòi THÊM quyền của miền đó — `@RequirePermissions` ở handler GHI ĐÈ metadata class
 * (`getAllAndOverride`), nên mỗi handler khai lại đủ bộ. Phần dữ liệu nhạy cảm bên trong một tab
 * (tiền, giấy tờ) server tự bỏ theo quyền người gọi (`CurrentPlatform`), không chặn cả tab.
 */
@ApiTags('platform-tenants')
@Controller('platform/partners/:tenantId')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_TENANT_VIEW)
export class PlatformPartnersController {
  constructor(
    private readonly detail: PlatformPartnerDetailService,
    private readonly operations: PlatformPartnerOperationsService,
  ) {}

  @Get('overview')
  @RequirePermissions(PERMISSION.PLATFORM_TENANT_VIEW)
  @ApiOperation({ summary: 'Chi tiết đối tác — đầu drawer + tab Tổng quan (chỉ đọc)' })
  @ApiOkResponse({ type: PartnerOverviewDto })
  overview(
    @Param('tenantId') tenantId: string,
    @CurrentPlatform() platform: PlatformContext,
  ): Promise<PartnerOverviewDto> {
    return this.detail.overview(tenantId, platform);
  }

  @Get('vehicles')
  @RequirePermissions(PERMISSION.PLATFORM_TENANT_VIEW, PERMISSION.PLATFORM_VEHICLE_VIEW)
  @ApiOperation({ summary: 'Xe của đối tác — phân trang, lọc, sắp xếp, kèm cảnh báo (chỉ đọc)' })
  @ApiOkResponse({ type: PartnerVehiclePageDto })
  vehicles(
    @Param('tenantId') tenantId: string,
    @Query() query: PartnerVehicleListQueryDto,
  ): Promise<PartnerVehiclePageDto> {
    return this.operations.vehicles(tenantId, query);
  }

  @Get('bookings')
  @RequirePermissions(PERMISSION.PLATFORM_TENANT_VIEW, PERMISSION.PLATFORM_BOOKING_VIEW)
  @ApiOperation({
    summary: 'Đơn thuê của đối tác — khách đã che; tổng tiền chỉ khi có platform.money.manage',
  })
  @ApiOkResponse({ type: PartnerBookingPageDto })
  bookings(
    @Param('tenantId') tenantId: string,
    @Query() query: PartnerBookingListQueryDto,
    @CurrentPlatform() platform: PlatformContext,
  ): Promise<PartnerBookingPageDto> {
    return this.operations.bookings(tenantId, query, platform);
  }

  @Get('bookings/summary')
  @RequirePermissions(PERMISSION.PLATFORM_TENANT_VIEW, PERMISSION.PLATFORM_BOOKING_VIEW)
  @ApiOperation({ summary: 'Số đơn theo nhóm trạng thái + đơn sắp nhận xe + yêu cầu chờ duyệt' })
  @ApiOkResponse({ type: PartnerBookingSummaryDto })
  bookingSummary(
    @Param('tenantId') tenantId: string,
    @Query() query: PartnerBookingSummaryQueryDto,
  ): Promise<PartnerBookingSummaryDto> {
    return this.operations.bookingSummary(tenantId, query);
  }

  @Get('booking-requests')
  @RequirePermissions(PERMISSION.PLATFORM_TENANT_VIEW, PERMISSION.PLATFORM_BOOKING_VIEW)
  @ApiOperation({ summary: 'Yêu cầu thuê của đối tác — khách đã che (chỉ đọc)' })
  @ApiOkResponse({ type: PartnerBookingRequestPageDto })
  bookingRequests(
    @Param('tenantId') tenantId: string,
    @Query() query: PartnerBookingRequestListQueryDto,
  ): Promise<PartnerBookingRequestPageDto> {
    return this.operations.bookingRequests(tenantId, query);
  }

  @Get('profile')
  @RequirePermissions(PERMISSION.PLATFORM_TENANT_VIEW)
  @ApiOperation({
    summary: 'Hồ sơ đối tác — PII đã che; giấy tờ pháp lý chỉ khi có platform.sellers.verify',
  })
  @ApiOkResponse({ type: PartnerProfileDto })
  profile(
    @Param('tenantId') tenantId: string,
    @CurrentPlatform() platform: PlatformContext,
  ): Promise<PartnerProfileDto> {
    return this.detail.profile(tenantId, platform);
  }

  @Get('billing')
  @RequirePermissions(PERMISSION.PLATFORM_TENANT_VIEW, PERMISSION.PLATFORM_BILLING_MANAGE)
  @ApiOperation({ summary: 'Gói & phí của gian hàng gói — gói, hạn mức, hoá đơn (chỉ đọc)' })
  @ApiOkResponse({ type: PartnerBillingDto })
  billing(@Param('tenantId') tenantId: string): Promise<PartnerBillingDto> {
    return this.detail.billing(tenantId);
  }

  @Get('commission')
  @RequirePermissions(PERMISSION.PLATFORM_TENANT_VIEW)
  @ApiOperation({
    summary:
      'Phí dịch vụ & số liệu theo tháng của chủ xe cá nhân — số tiền theo platform.money.manage',
  })
  @ApiOkResponse({ type: PartnerCommissionDto })
  commission(
    @Param('tenantId') tenantId: string,
    @CurrentPlatform() platform: PlatformContext,
  ): Promise<PartnerCommissionDto> {
    return this.detail.commission(tenantId, platform);
  }

  @Get('activity')
  @RequirePermissions(PERMISSION.PLATFORM_TENANT_VIEW, PERMISSION.PLATFORM_AUDIT_VIEW)
  @ApiOperation({ summary: 'Nhật ký hoạt động của đối tác — không kèm IP/thiết bị (chỉ đọc)' })
  @ApiOkResponse({ type: PartnerActivityPageDto })
  activity(
    @Param('tenantId') tenantId: string,
    @Query() query: PartnerActivityQueryDto,
    @CurrentPlatform() platform: PlatformContext,
  ): Promise<PartnerActivityPageDto> {
    return this.operations.activity(tenantId, query, platform);
  }

  @Get('support-sessions')
  @RequirePermissions(PERMISSION.PLATFORM_TENANT_VIEW, PERMISSION.PLATFORM_AUDIT_VIEW)
  @ApiOperation({ summary: 'Các phiên hỗ trợ đã mở cho đối tác (chỉ đọc)' })
  @ApiOkResponse({ type: PartnerSupportSessionPageDto })
  supportSessions(
    @Param('tenantId') tenantId: string,
    @Query() query: PartnerSupportSessionQueryDto,
  ): Promise<PartnerSupportSessionPageDto> {
    return this.operations.supportSessions(tenantId, query);
  }
}
