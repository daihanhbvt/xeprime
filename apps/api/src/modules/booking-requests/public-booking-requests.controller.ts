import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM, ACCOUNT_REALM_VALUES } from '@xeprime/types';
import { CurrentUser, Public, Realms } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  BookingRequestReceiptDto,
  CheckAvailabilityDto,
  CheckAvailabilityResultDto,
  CreateBookingRequestDto,
} from './dto/booking-request.dto';
import { VehicleBusyDaysDto, VehicleBusyDaysQueryDto } from '../calendar/dto/busy-days.dto';
import { BookingRequestsService } from './booking-requests.service';

/**
 * Yêu cầu thuê từ Marketplace.
 *
 * KHÔNG nhận `tenant_id`: server suy từ xe (chỉ xe đã duyệt của shop đang hoạt động). Không giữ
 * chỗ lịch — mới là yêu cầu (ADR 0044).
 *
 * **Gửi yêu cầu cần TÀI KHOẢN KHÁCH đã đăng nhập** (ADR 0060). Route `POST` không còn `@Public()`:
 * `AuthGuard` trả 401 khi chưa có phiên (cookie của site khách hoặc Bearer của app XePrime), và
 * `@Realms(customer)` trả 403 `REALM_NOT_ALLOWED` cho phiên partner/platform. Không còn đường
 * "khách vãng lai xác thực OTP rồi được tạo tài khoản + cấp phiên" — chỗ cấp phiên duy nhất ngoài
 * `modules/auth` đã gỡ cùng với nó. Danh tính của yêu cầu đọc từ tài khoản, không từ payload.
 *
 * Hai route XEM lịch trống ở dưới vẫn công khai và mở cho mọi site: chúng chỉ nói xe bận hay rảnh,
 * và khách chưa đăng nhập vẫn phải kiểm được khung giờ trước khi được mời đăng nhập.
 */
@ApiTags('public-booking-requests')
@Controller('public/booking-requests')
@Realms(ACCOUNT_REALM.CUSTOMER)
export class PublicBookingRequestsController {
  constructor(private readonly requests: BookingRequestsService) {}

  @Post()
  @ApiOperation({
    summary: 'Khách (đã đăng nhập, SĐT đã xác minh) gửi yêu cầu thuê một xe trên Marketplace',
  })
  @ApiCreatedResponse({ type: BookingRequestReceiptDto })
  submit(
    @Body() dto: CreateBookingRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BookingRequestReceiptDto> {
    return this.requests.submitPublic(dto, user.id);
  }

  @Public()
  @Realms(...ACCOUNT_REALM_VALUES)
  @Post('check-availability')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Khách kiểm tra nhanh khung giờ của một xe có trống không (preview)' })
  @ApiOkResponse({ type: CheckAvailabilityResultDto })
  checkAvailability(@Body() dto: CheckAvailabilityDto): Promise<CheckAvailabilityResultDto> {
    return this.requests.checkPublicAvailability(dto.vehicleId, dto.pickupAt, dto.returnAt);
  }

  /**
   * Lịch bận của một xe để hộp chọn thời gian thuê KHOÁ ngày bận ngay trên lịch.
   *
   * `GET` để trình duyệt và TanStack Query cache được — dữ liệu này đọc lại mỗi lần mở lịch,
   * và nó không phải bí mật: chỉ nói xe bận hay rảnh, không nói bận vì đơn của ai.
   */
  @Public()
  @Realms(...ACCOUNT_REALM_VALUES)
  @Get('busy-days')
  @ApiOperation({ summary: 'Ngày/giờ xe đã bận trong một cửa sổ, để tô lịch chọn thời gian thuê' })
  @ApiOkResponse({ type: VehicleBusyDaysDto })
  busyDays(@Query() query: VehicleBusyDaysQueryDto): Promise<VehicleBusyDaysDto> {
    return this.requests.listPublicBusyDays(query.vehicleId, query.from, query.to);
  }
}
