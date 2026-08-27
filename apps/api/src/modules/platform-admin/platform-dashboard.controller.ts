import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { PlatformOnly, RequirePermissions } from '../../common/decorators';
import { PlatformDashboardSummaryDto } from './dto/platform-dashboard.dto';
import { PlatformDashboardService } from './platform-dashboard.service';

/** Dashboard nền tảng (Phase 7). `@PlatformOnly` — không dùng chung guard với API gian hàng. */
@ApiTags('platform-dashboard')
@Controller('platform/dashboard')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_DASHBOARD_VIEW)
export class PlatformDashboardController {
  constructor(private readonly dashboard: PlatformDashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Tổng quan nền tảng: gian hàng / listing / đơn thuê / chờ duyệt' })
  @ApiOkResponse({ type: PlatformDashboardSummaryDto })
  summary(): Promise<PlatformDashboardSummaryDto> {
    return this.dashboard.summary();
  }
}
