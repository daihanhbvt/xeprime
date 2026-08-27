import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  BookingContactDto,
  PlatformBookingDetailDto,
  PlatformBookingListQueryDto,
  PlatformBookingPageDto,
} from './dto/platform-booking.dto';
import { PlatformBookingsService } from './platform-bookings.service';

/**
 * Đơn thuê toàn hệ thống (Phase 7 — build plan §11.1). CHỈ ĐỌC: nền tảng giám sát/hỗ trợ,
 * chuyển trạng thái đơn vẫn thuộc về gian hàng (ADR 0006 — lịch chỉ có một đường ghi).
 */
@ApiTags('platform-bookings')
@Controller('platform/bookings')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_BOOKING_VIEW)
export class PlatformBookingsController {
  constructor(private readonly bookings: PlatformBookingsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách đơn thuê toàn hệ thống (phân trang, lọc, tìm kiếm)' })
  @ApiOkResponse({ type: PlatformBookingPageDto })
  list(@Query() query: PlatformBookingListQueryDto): Promise<PlatformBookingPageDto> {
    return this.bookings.list(query) as Promise<PlatformBookingPageDto>;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một đơn thuê (SĐT khách ở dạng đã che)' })
  @ApiOkResponse({ type: PlatformBookingDetailDto })
  getOne(@Param('id') id: string): Promise<PlatformBookingDetailDto> {
    return this.bookings.getOne(id);
  }

  // Liệt kê lại quyền đọc: `RequirePermissions` ở handler GHI ĐÈ cấp class (getAllAndOverride),
  // nếu chỉ để `view_pii` thì role có mỗi quyền đó đọc được SĐT khách trên đơn mà không có
  // quyền xem danh sách đơn.
  @Post(':id/contact')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSION.PLATFORM_BOOKING_VIEW, PERMISSION.PLATFORM_CUSTOMER_PII_VIEW)
  @ApiOperation({ summary: 'Xem SĐT khách đầy đủ (ghi audit từng lần xem)' })
  @ApiOkResponse({ type: BookingContactDto })
  revealContact(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BookingContactDto> {
    return this.bookings.revealContact(id, user.id);
  }
}
