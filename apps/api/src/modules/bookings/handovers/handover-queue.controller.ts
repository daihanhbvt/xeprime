import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentTenant, RequirePermissions, TenantScoped } from '../../../common/decorators';
import type { TenantContext } from '../../../common/types/request-context';
import { MissingOdometerQueryDto, MissingOdometerQueueDto } from './dto/handover.dto';
import { HandoversService } from './handovers.service';

/**
 * Hàng đợi vận hành của bàn giao — toàn đội xe, không thuộc một đơn nào (Wave 8).
 *
 * Đây KHÔNG phải module điều hướng mới: nó cấp dữ liệu cho nhóm việc `Thiếu KM trả` trong
 * Trung tâm bảo dưỡng đã có. Tách controller vì phạm vi là gian hàng, còn
 * `BookingHandoversController` gắn cứng vào `/bookings/:id`.
 */
@ApiTags('handover-queue')
@Controller('handovers')
@TenantScoped()
export class HandoverQueueController {
  constructor(private readonly handovers: HandoversService) {}

  /**
   * Danh sách biên bản TRẢ XE đã xác nhận nhưng chưa có KM.
   *
   * Quyền XEM là `handovers.view` — thấy việc tồn tại. Quyền GIẢI QUYẾT là
   * `vehicles.odometer.correct` ở endpoint bổ sung KM của từng đơn; hàng đợi không tự cấp
   * thêm quyền nào.
   */
  @Get('missing-odometer')
  @RequirePermissions(PERMISSION.HANDOVER_VIEW)
  @ApiOperation({ summary: 'Hàng đợi "Thiếu KM trả" toàn gian hàng (phân trang)' })
  @ApiOkResponse({ type: MissingOdometerQueueDto })
  missingOdometer(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: MissingOdometerQueryDto,
  ): Promise<MissingOdometerQueueDto> {
    return this.handovers.missingOdometerQueue(tenant.tenantId, query);
  }
}
