import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION } from '@xeprime/types';
import { CurrentUser, PlatformOnly, Realms, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { PlatformBookingPageDto } from './dto/platform-booking.dto';
import {
  PlatformTripBookingListQueryDto,
  PlatformTripRemindResultDto,
  PlatformTripRequestListQueryDto,
  PlatformTripRequestPageDto,
  PlatformTripSummaryDto,
  PlatformTripSummaryQueryDto,
} from './dto/platform-trip.dto';
import { PlatformBookingsService } from './platform-bookings.service';
import { PlatformTripsService } from './platform-trips.service';

/**
 * Vận hành chuyến toàn hệ thống — bốn hàng đợi theo chặng của một chuyến (ADR 0044) + nhắc tay
 * chủ xe. Cùng quyền đọc với đơn thuê: màn này không mở thêm dữ liệu nào ngoài những gì
 * `/platform/bookings` và hộp thư yêu cầu của từng gian hàng đã cho thấy.
 */
@ApiTags('platform-trips')
@Controller('platform/trips')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_BOOKING_VIEW)
@Realms(ACCOUNT_REALM.PLATFORM)
export class PlatformTripsController {
  constructor(
    private readonly trips: PlatformTripsService,
    private readonly bookingsService: PlatformBookingsService,
  ) {}

  @Get('summary')
  @ApiOperation({ summary: 'Số dòng + số khẩn của bốn hàng đợi vận hành, và lịch giao/trả hôm nay' })
  @ApiOkResponse({ type: PlatformTripSummaryDto })
  summary(@Query() query: PlatformTripSummaryQueryDto): Promise<PlatformTripSummaryDto> {
    return this.trips.summary(query);
  }

  @Get('requests')
  @ApiOperation({ summary: 'Hàng đợi yêu cầu thuê: chờ chủ xe duyệt / chờ khách giữ chỗ' })
  @ApiOkResponse({ type: PlatformTripRequestPageDto })
  requests(@Query() query: PlatformTripRequestListQueryDto): Promise<PlatformTripRequestPageDto> {
    return this.trips.requests(query) as Promise<PlatformTripRequestPageDto>;
  }

  @Get('bookings')
  @ApiOperation({ summary: 'Hàng đợi đơn thuê: sắp giao xe (kể cả quá giờ) / đang thuê' })
  @ApiOkResponse({ type: PlatformBookingPageDto })
  bookings(@Query() query: PlatformTripBookingListQueryDto): Promise<PlatformBookingPageDto> {
    return this.bookingsService.listQueue(query) as Promise<PlatformBookingPageDto>;
  }

  @Post('requests/:id/remind')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Nhắc tay chủ xe về một yêu cầu đang chờ duyệt (thông báo + audit, có cooldown)',
  })
  @ApiOkResponse({ type: PlatformTripRemindResultDto })
  remind(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PlatformTripRemindResultDto> {
    return this.trips.remind(id, user.id);
  }
}
