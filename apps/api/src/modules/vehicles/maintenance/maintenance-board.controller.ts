import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentTenant, RequirePermissions, TenantScoped } from '../../../common/decorators';
import type { TenantContext } from '../../../common/types/request-context';
import {
  MaintenanceBoardListDto,
  MaintenanceBoardQueryDto,
  MaintenanceBoardSummaryDto,
} from './dto/vehicle-maintenance.dto';
import { MaintenanceService } from './maintenance.service';
import { scopeOf } from './vehicle-maintenance.controller';

/**
 * Trung tâm bảo dưỡng toàn đội xe (Wave 6) — docs/design/12 §9.2.
 *
 * Dòng dữ liệu là XE chứ không phải phiếu: câu hỏi của người vận hành là "xe nào cần đụng
 * tới hôm nay". Lọc/sắp xếp/phân trang chạy ở database (xem `MaintenanceService.board`),
 * không kéo cả đội xe về rồi cắt.
 */
@ApiTags('maintenance')
@Controller('maintenance')
@TenantScoped()
export class MaintenanceBoardController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get()
  @RequirePermissions(PERMISSION.VEHICLE_MAINTENANCE_VIEW)
  @ApiOperation({ summary: 'Danh sách xe theo việc cần làm (quá hạn / sắp hạn / thiếu KM…)' })
  @ApiOkResponse({ type: MaintenanceBoardListDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: MaintenanceBoardQueryDto,
  ): Promise<MaintenanceBoardListDto> {
    return this.maintenance.board(tenant.tenantId, query, scopeOf(tenant));
  }

  @Get('summary')
  @RequirePermissions(PERMISSION.VEHICLE_MAINTENANCE_VIEW)
  @ApiOperation({ summary: 'Đếm theo từng nhóm việc — độc lập với trang/bộ lọc hiện tại' })
  @ApiOkResponse({ type: MaintenanceBoardSummaryDto })
  summary(@CurrentTenant() tenant: TenantContext): Promise<MaintenanceBoardSummaryDto> {
    // Nhóm việc "Thiếu KM trả" thuộc miền bàn giao — chỉ đếm khi người gọi có `handovers.view`
    // (Wave 8.1). Không có quyền thì trả 0 chứ không lộ số việc đang hở.
    return this.maintenance.boardSummary(tenant.tenantId, {
      canViewHandovers: tenant.permissions.includes(PERMISSION.HANDOVER_VIEW),
    });
  }
}
