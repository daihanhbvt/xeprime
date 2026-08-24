import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public, VerifiesCredentials } from '../../common/decorators';
import { AuthService } from './auth.service';
import {
  NativeSessionService,
  type NativeDeviceInfo,
  type NativeTokenPair,
} from './native-session.service';
import {
  MobileDeviceDto,
  MobileLoginDto,
  MobileLogoutDto,
  MobileRefreshDto,
  MobileSessionDto,
  MobileSessionExchangeDto,
  MobileTokenPairDto,
} from './dto/mobile-auth.dto';

/**
 * Xác thực cho app native — ADR 0017.
 *
 * Controller RIÊNG dưới `/auth/mobile`, không thêm nhánh vào `AuthController`. Lý do là ràng buộc
 * quan trọng nhất của cả thay đổi này: **response của web không được đổi một byte nào.** Hai
 * controller nghĩa là không có một dòng `if (isMobile)` nào trong đường đăng nhập của web.
 *
 * `@Throttle` siết riêng từng endpoint, chặt hơn hẳn mức chung 120 req/phút của app
 * (`app.module.ts`): mức chung dành cho một người dùng đang lướt app, còn ba endpoint dưới đây là
 * ba cửa dò mật khẩu và dò refresh token.
 */
@ApiTags('auth')
@Controller('auth/mobile')
export class MobileAuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly nativeSessions: NativeSessionService,
  ) {}

  /**
   * Đổi ID token của Firebase lấy cặp token native.
   *
   * Tương ứng `POST /auth/session` của web, khác đúng một chỗ: trả token trong body thay vì đặt
   * cookie. Web KHÔNG bao giờ được gọi endpoint này — nó không có `httpOnly` để bảo vệ.
   */
  @Public()
  @VerifiesCredentials()
  @Post('session')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Native: đổi Firebase ID token lấy access + refresh token' })
  @ApiOkResponse({ type: MobileSessionDto })
  async createSession(@Body() dto: MobileSessionExchangeDto): Promise<MobileSessionDto> {
    const { userId } = await this.auth.upsertUserFromIdToken(dto.idToken);
    return this.buildSession(userId, dto.device);
  }

  /**
   * Đăng nhập bằng email/SĐT + mật khẩu.
   *
   * 5 lần/phút: đây là cửa dò mật khẩu duy nhất của app native. `AuthService.loginWithPassword`
   * đã trả cùng một lỗi cho "không có tài khoản" và "sai mật khẩu", nên rate limit là lớp còn lại.
   */
  @Public()
  @VerifiesCredentials()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Native: đăng nhập bằng email/SĐT + mật khẩu' })
  @ApiOkResponse({ type: MobileSessionDto })
  async login(@Body() dto: MobileLoginDto): Promise<MobileSessionDto> {
    const { userId } = await this.auth.loginWithPassword(dto.identifier, dto.password);
    return this.buildSession(userId, dto.device);
  }

  /**
   * Xoay refresh token.
   *
   * `@Public()` vì access token lúc này đã hết hạn — chính refresh token trong body là bằng chứng.
   * Trả về CẶP MỚI; token vừa gửi lên chết ngay. Gửi lại nó lần nữa ⇒ thu hồi cả phiên
   * (ADR 0017 §4).
   */
  @Public()
  @VerifiesCredentials()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Native: xoay refresh token, nhận cặp token mới' })
  @ApiOkResponse({ type: MobileTokenPairDto })
  async refresh(@Body() dto: MobileRefreshDto): Promise<MobileTokenPairDto> {
    return toTokenPairDto(await this.nativeSessions.rotate(dto.refreshToken));
  }

  /**
   * Thu hồi phiên của thiết bị này.
   *
   * `@Public()` và **luôn 204**, kể cả với token lạ: đăng xuất là thao tác dọn dẹp, và một 404 ở
   * đây cho phép dò xem một chuỗi có phải refresh token hợp lệ. App gọi được cả khi access token
   * đã hết hạn — đúng lúc người dùng bấm "Đăng xuất" sau nhiều ngày không mở app.
   */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Native: thu hồi phiên của thiết bị hiện tại' })
  @ApiNoContentResponse()
  async logout(@Body() dto: MobileLogoutDto): Promise<void> {
    await this.nativeSessions.revokeByRefreshToken(dto.refreshToken);
  }

  private async buildSession(
    userId: string,
    device: MobileDeviceDto | undefined,
  ): Promise<MobileSessionDto> {
    const pair = await this.nativeSessions.issueSession(userId, toDeviceInfo(device));
    // `me()` đọc quyền + tenant scope từ DB. Chúng đi trong BODY, không trong token (ADR 0017 §1).
    const user = await this.auth.me(userId);
    return { tokens: toTokenPairDto(pair), user };
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

/** `sessionId` CỐ Ý không ra ngoài: client không cần nó, và nó là mã nội bộ để thu hồi. */
function toTokenPairDto(pair: NativeTokenPair): MobileTokenPairDto {
  return {
    accessToken: pair.accessToken,
    accessTokenExpiresIn: pair.accessTokenExpiresIn,
    refreshToken: pair.refreshToken,
    refreshTokenExpiresAt: pair.refreshTokenExpiresAt.toISOString(),
  };
}
