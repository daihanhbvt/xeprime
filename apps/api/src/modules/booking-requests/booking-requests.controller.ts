import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import {
  CurrentTenant,
  CurrentUser,
  RequirePermissions,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import {
  ApproveBookingRequestDto,
  BookingRequestDto,
  BookingRequestListQueryDto,
  BookingRequestPageDto,
  RejectBookingRequestDto,
} from './dto/booking-request.dto';
import { BookingRequestsService } from './booking-requests.service';

/**
 * Inbox yêu cầu đặt xe của gian hàng — tenant-scoped. Duyệt tạo Booking (giữ chỗ lịch,
 * chặn trùng bằng constraint DB — ADR 0006). `tenantId`/`userId` từ scope, không nhận client.
 */
@ApiTags('booking-requests')
@Controller('booking-requests')
@TenantScoped()
export class BookingRequestsController {
  constructor(private readonly requests: BookingRequestsService) {}

  @Get()
  @RequirePermissions(PERMISSION.BOOKING_REQUEST_VIEW)
  @ApiOperation({ summary: 'Danh sách yêu cầu đặt xe (phân trang, filter trạng thái)' })
  @ApiOkResponse({ type: BookingRequestPageDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: BookingRequestListQueryDto,
  ): Promise<BookingRequestPageDto> {
    return this.requests.list(tenant.tenantId, query) as Promise<BookingRequestPageDto>;
  }

  @Get(':id')
  @RequirePermissions(PERMISSION.BOOKING_REQUEST_VIEW)
  @ApiOperation({ summary: 'Chi tiết một yêu cầu' })
  @ApiOkResponse({ type: BookingRequestDto })
  getOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<BookingRequestDto> {
    return this.requests.getOne(tenant.tenantId, id);
  }

  /**
   * Duyệt được NGAY, kể cả yêu cầu có giao xe tận nơi (Wave 9): đơn sinh ra với phí giao nhận
   * `0đ — Miễn phí`. Chủ xe thống nhất phí với khách ngoài ứng dụng rồi cập nhật bằng
   * `PATCH /bookings/:id/delivery-fee`.
   */
  @Post(':id/approve')
  @RequirePermissions(PERMISSION.BOOKING_REQUEST_APPROVE)
  @ApiOperation({
    summary: 'Duyệt yêu cầu → tạo đơn thuê (giữ chỗ lịch, phí giao nhận 0)',
    description:
      'Thuê dài hạn: body bắt buộc scheduledPickupAt — gian hàng chốt giờ nhận, server tính ' +
      'giờ trả theo gói tháng lịch (ADR 0011). Trùng lịch → 409, yêu cầu vẫn chờ duyệt.',
  })
  @ApiOkResponse({ type: BookingRequestDto })
  approve(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApproveBookingRequestDto,
  ): Promise<BookingRequestDto> {
    return this.requests.approve(tenant.tenantId, user.id, id, dto);
  }

  @Post(':id/reject')
  @RequirePermissions(PERMISSION.BOOKING_REQUEST_APPROVE)
  @ApiOperation({ summary: 'Từ chối yêu cầu' })
  @ApiOkResponse({ type: BookingRequestDto })
  reject(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectBookingRequestDto,
  ): Promise<BookingRequestDto> {
    return this.requests.reject(tenant.tenantId, user.id, id, dto.reason);
  }
}
