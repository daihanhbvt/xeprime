import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators';
import { resolveOptionalUserId } from '../../common/optional-user';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from '../auth/session.service';
import {
  BookingRequestReceiptDto,
  CheckAvailabilityDto,
  CheckAvailabilityResultDto,
  CreateBookingRequestDto,
  VehicleBusyDaysDto,
  VehicleBusyDaysQueryDto,
} from './dto/booking-request.dto';
import { BookingRequestsService } from './booking-requests.service';

/**
 * Gửi yêu cầu thuê từ Marketplace — công khai (@Public), không cần đăng nhập trước.
 *
 * KHÔNG nhận `tenant_id`: server suy từ xe (chỉ xe đã duyệt của shop đang hoạt động). Rate
 * limit toàn cục (ThrottlerGuard) chặn spam. Không giữ chỗ lịch — mới là yêu cầu.
 *
 * Passwordless: khách vãng lai đã xác thực SĐT (OTP purpose=booking) được service tạo/đăng nhập
 * tài khoản theo SĐT; controller cấp session cookie httpOnly (ADR 0002) để khách vào thẳng
 * /trips + chat mà không phải nhập mật khẩu. Khách đang đăng nhập giữ nguyên phiên.
 */
@ApiTags('public-booking-requests')
@Controller('public/booking-requests')
export class PublicBookingRequestsController {
  constructor(
    private readonly requests: BookingRequestsService,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Khách gửi yêu cầu thuê một xe trên Marketplace' })
  @ApiCreatedResponse({ type: BookingRequestReceiptDto })
  async submit(
    @Body() dto: CreateBookingRequestDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<BookingRequestReceiptDto> {
    const customerUserId = await resolveOptionalUserId(req, this.sessions, this.prisma);
    const { receipt, loginUserId } = await this.requests.submitPublic(dto, customerUserId);
    if (loginUserId) {
      const { token } = this.sessions.issue(loginUserId);
      this.sessions.attach(res, token);
    }
    return receipt;
  }

  @Public()
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
  @Get('busy-days')
  @ApiOperation({ summary: 'Ngày/giờ xe đã bận trong một cửa sổ, để tô lịch chọn thời gian thuê' })
  @ApiOkResponse({ type: VehicleBusyDaysDto })
  busyDays(@Query() query: VehicleBusyDaysQueryDto): Promise<VehicleBusyDaysDto> {
    return this.requests.listPublicBusyDays(query.vehicleId, query.from, query.to);
  }
}
