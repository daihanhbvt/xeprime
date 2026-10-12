import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, SUPPORT_CAPABILITY } from '@xeprime/types';
import {
  CurrentTenant,
  Realms,
  SupportAction,
  TenantScoped,
} from '../../common/decorators';
import type { TenantContext } from '../../common/types/request-context';
import { PartnerDashboardOverviewDto, PartnerDashboardQueryDto } from './dto/partner-dashboard.dto';
import { PartnerDashboardService } from './partner-dashboard.service';

/**
 * Tổng quan SITE PARTNER — cả hai tuyến (gian hàng gói và chủ xe tuyến hoa hồng).
 *
 * KHÔNG `@SubscriptionTrackOnly`: chủ xe cá nhân cũng có một Tổng quan. Ranh giới tuyến đi vào
 * TỪNG KHỐI ở service (báo cáo theo kỳ chỉ có ở tuyến gói — ADR 0027 điều 1), không chặn cả trang.
 *
 * KHÔNG có cổng quyền chung (`@RequirePermissions`), cố ý — đây là bề mặt TỔNG HỢP: mỗi khối
 * tự gác bằng đúng quyền của dữ liệu nó lộ ra và về `null` khi thiếu (đơn → `bookings.view`, yêu
 * cầu → `booking_requests.view`, xe → `vehicles.view`); khối duy nhất không gác là uy tín, vốn là
 * số công khai trên chợ. Một cổng chung sẽ sai ở cả hai chiều:
 *  - `tenants.view` làm phiên hỗ trợ gian hàng (ADR 0050) nhận 403 — năng lực "xem đơn" của phiên
 *    chỉ suy ra `bookings.view` (`SUPPORT_CAPABILITY_PERMISSIONS`), trong khi trang Tổng quan của
 *    phiên gác bằng đúng năng lực đó;
 *  - `bookings.view` làm một vai tuỳ biến không xem đơn mất luôn cả khối xe và uy tín.
 * Phạm vi vẫn là membership (`@TenantScoped`), cùng khuôn với `GET /shop/wallet`.
 */
@ApiTags('partner-dashboard')
@Controller('dashboard')
@TenantScoped()
@Realms(ACCOUNT_REALM.PARTNER)
export class PartnerDashboardController {
  constructor(private readonly dashboard: PartnerDashboardService) {}

  @Get('overview')
  @SupportAction(SUPPORT_CAPABILITY.BOOKING_VIEW)
  @ApiOperation({
    summary:
      'Tổng quan partner: việc giao/nhận hôm nay, yêu cầu chờ duyệt, lịch 7 ngày, tháng này so cùng kỳ, xe trên chợ, uy tín',
  })
  @ApiOkResponse({ type: PartnerDashboardOverviewDto })
  overview(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: PartnerDashboardQueryDto,
  ): Promise<PartnerDashboardOverviewDto> {
    return this.dashboard.overview(tenant, query);
  }
}
