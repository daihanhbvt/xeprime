import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators';
import { resolveOptionalUserId } from '../../common/optional-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import type { MobileDeviceDto } from '../auth/dto/mobile-auth.dto';
import { NativeSessionService, type NativeDeviceInfo } from '../auth/native-session.service';
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
 * tài khoản theo SĐT, rồi controller cấp phiên để khách vào thẳng /trips + chat mà không phải
 * nhập mật khẩu. Khách đang đăng nhập giữ nguyên phiên.
 *
 * Phiên đó có HAI dạng, theo `client` trong body: web nhận cookie httpOnly (ADR 0002), app native
 * nhận cặp token trong `receipt.session` (ADR 0017). Đây là chỗ DUY NHẤT ngoài `modules/auth` cấp
 * phiên, và nó cấp vì cùng một lý do: OTP `purpose=booking` đã chứng minh sở hữu SĐT rồi, hỏi lại
 * bằng một vòng OTP `purpose=login` nữa là hỏi cùng một câu hai lần.
 */
@ApiTags('public-booking-requests')
@Controller('public/booking-requests')
export class PublicBookingRequestsController {
  constructor(
    private readonly requests: BookingRequestsService,
    private readonly sessions: SessionService,
    private readonly nativeSessions: NativeSessionService,
    private readonly auth: AuthService,
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
    const customerUserId = await resolveOptionalUserId(
      req,
      this.sessions,
      this.prisma,
      this.nativeSessions,
    );
    const { receipt, loginUserId } = await this.requests.submitPublic(dto, customerUserId);
    if (!loginUserId) return receipt;

    /*
     * Khách vãng lai vừa được tạo tài khoản từ SĐT đã xác thực — cấp phiên luôn, và cấp ĐÚNG
     * LOẠI phiên mà client dùng được.
     *
     * Web: cookie httpOnly như trước. Native: cặp token trong body — app không có cookie jar, nên
     * một `Set-Cookie` ở đây là phiên rơi vào hư không và khách vừa đặt xe xong bị coi như chưa
     * đăng nhập (ADR 0017).
     *
     * Không có nhánh "đoán từ header": ở đúng lời gọi này khách CHƯA có credential nào để mà
     * đoán. Client phải tự khai bằng `client: 'native'`.
     */
    if (dto.client === 'native') {
      const pair = await this.nativeSessions.issueSession(loginUserId, toDeviceInfo(dto.device));
      return {
        ...receipt,
        session: {
          tokens: {
            accessToken: pair.accessToken,
            accessTokenExpiresIn: pair.accessTokenExpiresIn,
            refreshToken: pair.refreshToken,
            refreshTokenExpiresAt: pair.refreshTokenExpiresAt.toISOString(),
          },
          user: await this.auth.me(loginUserId),
        },
      };
    }

    const { token } = this.sessions.issue(loginUserId);
    this.sessions.attach(res, token);
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

/**
 * `exactOptionalPropertyTypes` bật: `{ deviceName: undefined }` KHÔNG gán được vào
 * `{ deviceName?: string }`. Chuyển tường minh thay vì spread để trường vắng mặt là vắng mặt thật.
 */
function toDeviceInfo(device: MobileDeviceDto | undefined): NativeDeviceInfo {
  if (!device) return {};
  return {
    ...(device.deviceName === undefined ? {} : { deviceName: device.deviceName }),
    ...(device.devicePlatform === undefined ? {} : { devicePlatform: device.devicePlatform }),
    ...(device.appVersion === undefined ? {} : { appVersion: device.appVersion }),
  };
}
