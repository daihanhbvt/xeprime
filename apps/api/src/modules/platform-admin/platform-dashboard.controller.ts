import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION } from '@xeprime/types';
import { CurrentPlatform, PlatformOnly, Realms, RequirePermissions } from '../../common/decorators';
import type { PlatformContext } from '../../common/types/request-context';
import {
  PlatformDashboardOverviewDto,
  PlatformDashboardSummaryDto,
} from './dto/platform-dashboard.dto';
import { PlatformDashboardService } from './platform-dashboard.service';

/** Dashboard nền tảng (Phase 7). `@PlatformOnly` — không dùng chung guard với API gian hàng. */
@ApiTags('platform-dashboard')
@Controller('platform/dashboard')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_DASHBOARD_VIEW)
@Realms(ACCOUNT_REALM.PLATFORM)
export class PlatformDashboardController {
  constructor(private readonly dashboard: PlatformDashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Tổng quan nền tảng: gian hàng / listing / đơn thuê / chờ duyệt' })
  @ApiOkResponse({ type: PlatformDashboardSummaryDto })
  summary(): Promise<PlatformDashboardSummaryDto> {
    return this.dashboard.summary();
  }

  @Get('overview')
  @ApiOperation({
    summary:
      'KPI tháng so cùng kỳ (đơn, GMV, khách/đối tác mới, doanh thu nền tảng), xu hướng 30 ngày, phễu kích hoạt đối tác',
  })
  @ApiOkResponse({ type: PlatformDashboardOverviewDto })
  overview(@CurrentPlatform() platform: PlatformContext): Promise<PlatformDashboardOverviewDto> {
    return this.dashboard.overview(platform);
  }
}
