import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION, SUPPORT_CAPABILITY } from '@xeprime/types';
import {
  CurrentTenant,
  Realms,
  RequirePermissions,
  SupportAction,
  TenantScoped,
} from '../../common/decorators';
import type { TenantContext } from '../../common/types/request-context';
import { BookingHistoryQueryDto, BookingHistoryPageDto } from './dto/booking-history.dto';
import { BookingHistoryService } from './booking-history.service';

/**
 * "Đơn đã kết thúc" của gian hàng — đơn đã đóng + yêu cầu không thành đơn, một danh sách
 * (05/11/2026). Chỉ đọc. `tenantId` và chi nhánh từ scope của phiên, không nhận từ client.
 */
@ApiTags('bookings')
@Controller('booking-history')
@TenantScoped()
@Realms(ACCOUNT_REALM.PARTNER)
export class BookingHistoryController {
  constructor(private readonly history: BookingHistoryService) {}

  @Get()
  @RequirePermissions(PERMISSION.BOOKING_VIEW)
  @SupportAction(SUPPORT_CAPABILITY.BOOKING_VIEW)
  @ApiOperation({
    summary: 'Đơn đã kết thúc: đơn hoàn thành / huỷ / khách không đến + yêu cầu không thành đơn',
    description:
      'Xếp theo lúc kết thúc giảm dần, phân trang server-side. Dòng YÊU CẦU chỉ có khi người xem ' +
      'có booking_requests.view (meta.includesRequests). meta.tabCounts đếm bốn ngăn cùng bộ lọc.',
  })
  @ApiOkResponse({ type: BookingHistoryPageDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: BookingHistoryQueryDto,
  ): Promise<BookingHistoryPageDto> {
    return this.history.list(
      tenant,
      query,
      // Quyền SUY từ capability trong phiên hỗ trợ — cùng mảng `permissions` (TenantContext).
      tenant.permissions.includes(PERMISSION.BOOKING_REQUEST_VIEW),
    );
  }
}
