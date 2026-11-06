import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION } from '@xeprime/types';
import {
  BRANCH_SCOPED_RESOURCE,
  BranchScoped,
  CurrentTenant,
  CurrentUser,
  Realms,
  RequirePermissions,
  TenantScoped,
} from '../../common/decorators';
import type { AuthenticatedUser, TenantContext } from '../../common/types/request-context';
import { BookingExtensionsService } from './booking-extensions.service';
import {
  BookingExtensionDto,
  BookingExtensionQuoteDto,
  BookingExtensionQuoteQueryDto,
  CreateBookingExtensionDto,
} from './dto/booking-extension.dto';

/**
 * PHỤ LỤC GIA HẠN một đơn dài hạn đang chạy (ADR 0077) — chỉ chủ xe/nhân viên có quyền sửa đơn
 * tạo được (điều 7). Không nằm sau cờ gói: vận hành chuyến đang chạy là của mọi tuyến
 * (ADR 0027 điều 3). Không mở cho phiên hỗ trợ — các dòng này mang tiền phía chủ xe.
 */
@ApiTags('bookings')
@Controller('bookings/:id/extensions')
@TenantScoped()
@Realms(ACCOUNT_REALM.PARTNER)
export class BookingExtensionsController {
  constructor(private readonly extensions: BookingExtensionsService) {}

  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Get()
  @RequirePermissions(PERMISSION.BOOKING_VIEW)
  @ApiOperation({ summary: 'Các phụ lục gia hạn của một đơn (cũ trước)' })
  @ApiOkResponse({ type: [BookingExtensionDto] })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<BookingExtensionDto[]> {
    return this.extensions.listForBooking(tenant.tenantId, id);
  }

  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Get('quote')
  @RequirePermissions(PERMISSION.BOOKING_UPDATE)
  @ApiOperation({
    summary: 'Xem trước giá + lịch trống của một phụ lục gia hạn N tháng (miễn phí nền tảng)',
  })
  @ApiOkResponse({ type: BookingExtensionQuoteDto })
  quote(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Query() query: BookingExtensionQuoteQueryDto,
  ): Promise<BookingExtensionQuoteDto> {
    return this.extensions.quote(tenant.tenantId, id, query.months);
  }

  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Post()
  @RequirePermissions(PERMISSION.BOOKING_UPDATE)
  @ApiOperation({
    summary:
      'Tạo phụ lục gia hạn: kéo lịch xe, phát mã XPE… để khách chuyển khoản; hiệu lực khi tiền về đủ',
  })
  @ApiCreatedResponse({ type: BookingExtensionDto })
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateBookingExtensionDto,
  ): Promise<BookingExtensionDto> {
    return this.extensions.create(tenant.tenantId, id, dto.months, user.id);
  }

  @BranchScoped(BRANCH_SCOPED_RESOURCE.BOOKING)
  @Post(':extensionId/cancel')
  @RequirePermissions(PERMISSION.BOOKING_UPDATE)
  @ApiOperation({
    summary: 'Huỷ phụ lục còn chờ thanh toán - nhả phần lịch kéo thêm, hoàn phần khách đã chuyển',
  })
  @ApiOkResponse({ type: BookingExtensionDto })
  cancel(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('extensionId') extensionId: string,
  ): Promise<BookingExtensionDto> {
    return this.extensions.cancel(tenant.tenantId, id, extensionId, user.id);
  }
}
