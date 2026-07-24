import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentTenant, CurrentUser, RequirePermissions, TenantScoped } from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import {
  BookingDetailDto,
  BookingListQueryDto,
  BookingPageDto,
  CreateBookingDto,
  TransitionBookingDto,
  UpdateBookingDto,
} from './dto/booking.dto';
import { BookingsService } from './bookings.service';

/**
 * Quản lý đơn thuê của gian hàng — tất cả tenant-scoped.
 *
 * `tenantId`/`userId` LUÔN lấy từ scope (`@CurrentTenant`/`@CurrentUser`), không nhận từ client
 * (CLAUDE.md mục 5). Chống trùng lịch nằm ở constraint DB (ADR 0006), không ở tầng app.
 */
@ApiTags('bookings')
@Controller('bookings')
@TenantScoped()
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  @RequirePermissions(PERMISSION.BOOKING_VIEW)
  @ApiOperation({ summary: 'Danh sách đơn thuê (phân trang, filter, sort)' })
  @ApiOkResponse({ type: BookingPageDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: BookingListQueryDto,
  ): Promise<BookingPageDto> {
    return this.bookings.list(tenant.tenantId, query) as Promise<BookingPageDto>;
  }

  @Get(':id')
  @RequirePermissions(PERMISSION.BOOKING_VIEW)
  @ApiOperation({ summary: 'Chi tiết một đơn thuê' })
  @ApiOkResponse({ type: BookingDetailDto })
  getOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<BookingDetailDto> {
    return this.bookings.getOne(tenant.tenantId, id);
  }

  @Post()
  @RequirePermissions(PERMISSION.BOOKING_CREATE)
  @ApiOperation({ summary: 'Tạo đơn thuê (giữ chỗ lịch, chặn trùng bằng constraint DB)' })
  @ApiCreatedResponse({ type: BookingDetailDto })
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBookingDto,
  ): Promise<BookingDetailDto> {
    return this.bookings.create(tenant.tenantId, user.id, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSION.BOOKING_UPDATE)
  @ApiOperation({ summary: 'Sửa đơn (đổi khung giờ sẽ reschedule lịch)' })
  @ApiOkResponse({ type: BookingDetailDto })
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateBookingDto,
  ): Promise<BookingDetailDto> {
    return this.bookings.update(tenant.tenantId, id, dto);
  }

  @Post(':id/transition')
  @RequirePermissions(PERMISSION.BOOKING_UPDATE)
  @ApiOperation({ summary: 'Chuyển trạng thái đơn (validate canTransitionBooking)' })
  @ApiOkResponse({ type: BookingDetailDto })
  transition(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TransitionBookingDto,
  ): Promise<BookingDetailDto> {
    return this.bookings.transition(tenant.tenantId, id, user.id, dto);
  }
}
