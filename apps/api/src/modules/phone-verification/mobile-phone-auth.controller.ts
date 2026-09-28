import { Body, Controller, ForbiddenException, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { API_ERROR_CODE, MOBILE_CLIENT_APP, PHONE_VERIFICATION_PURPOSE } from '@xeprime/types';
import { Public, VerifiesCredentials } from '../../common/decorators';
import { AuthService } from '../auth/auth.service';
import { assertMobileAppAccess } from '../auth/mobile-app-access';
import { NativeSessionService } from '../auth/native-session.service';
import { MobileDeviceDto, MobileSessionDto } from '../auth/dto/mobile-auth.dto';
import { MobilePhoneLoginDto } from './dto/phone-verification.dto';
import { PhoneVerificationService } from './phone-verification.service';

/**
 * Đăng nhập bằng SĐT + OTP cho APP NATIVE — ADR 0017 + 0019.
 *
 * Vì sao là một endpoint RIÊNG chứ không thêm cờ vào `POST /auth/phone/login`: hai họ endpoint
 * trả hai loại phiên khác nhau, và đó là ranh giới mà `MobileAuthController` đã dựng sẵn — web
 * nhận `Set-Cookie` httpOnly, native nhận cặp token trong body. Một endpoint nhìn vào header rồi
 * đoán mình đang phục vụ ai là chỗ để lọt một cookie tới app, hoặc một refresh token tới trình
 * duyệt (nơi không có `httpOnly` bảo vệ nó).
 *
 * Controller RIÊNG chứ không thêm route vào `MobileAuthController`: OTP thuộc module
 * `phone-verification`, và kéo `PhoneVerificationService` sang `AuthModule` sẽ tạo phụ thuộc
 * vòng (module này vốn đã dùng `AuthService`).
 *
 * Hai bước TRƯỚC nó — `POST /auth/phone/send-otp` và `verify-otp` — dùng chung cho cả hai nền
 * tảng: chúng trả JSON thuần, không đụng cookie, nên app gọi thẳng được.
 */
@ApiTags('phone-verification')
@Controller('auth/mobile/phone')
export class MobilePhoneAuthController {
  constructor(
    private readonly service: PhoneVerificationService,
    private readonly auth: AuthService,
    private readonly nativeSessions: NativeSessionService,
  ) {}

  /**
   * Passwordless: OTP `purpose=login` vừa chứng minh sở hữu SĐT vừa cấp phiên native.
   *
   * 10 lần/phút, khớp bản web: mã 6 số là cửa brute-force, và `verifyOtp` còn tự khoá mã sau
   * `OTP_MAX_ATTEMPTS` lần sai.
   */
  @Public()
  @VerifiesCredentials()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Native: đăng nhập bằng SĐT + OTP (tự tạo tài khoản nếu chưa có)',
  })
  @ApiOkResponse({ type: MobileSessionDto })
  async login(@Body() dto: MobilePhoneLoginDto): Promise<MobileSessionDto> {
    // Đúng thứ tự của bản web: verify OTP đúng mục đích → tìm/tạo tài khoản → mới phát phiên.
    await this.service.verifyOtp(dto.phone, PHONE_VERIFICATION_PURPOSE.LOGIN, dto.code, null);
    /*
     * XePrime Partner KHÔNG tạo tài khoản: ở app đó, một số chưa đăng ký phải dừng lại bằng
     * `PARTNER_REGISTRATION_NOT_SUPPORTED` chứ không được âm thầm thành tài khoản mới — tài
     * khoản ấy chắc chắn không có gian hàng nên sẽ bị chặn ngay câu lệnh sau, và thứ còn lại
     * là một hàng rác đã chiếm mất số điện thoại của chính người dùng đó.
     *
     * Partner có tài khoản THẬT vẫn đăng nhập OTP bình thường — nhánh này chỉ khác ở chỗ
     * không tạo mới.
     */
    const userId =
      dto.clientApp === MOBILE_CLIENT_APP.PARTNER
        ? (await this.auth.resolveExistingUserByPhone(dto.phone))?.userId
        : (await this.auth.resolveOrCreateUserByPhone(dto.phone)).userId;

    if (!userId) {
      throw new ForbiddenException({
        code: API_ERROR_CODE.PARTNER_REGISTRATION_NOT_SUPPORTED,
        message: 'Ứng dụng XePrime Partner không tạo tài khoản mới',
      });
    }

    // Quyền + tenant scope đi trong BODY, không trong token (ADR 0017 §1). Đọc TRƯỚC khi phát
    // phiên: lượt bị chặn phạm vi app (403 PARTNER_ACCESS_REQUIRED) không để lại phiên sống.
    const user = await this.auth.me(userId);
    assertMobileAppAccess(user, dto.clientApp);

    const pair = await this.nativeSessions.issueSession(
      userId,
      toDeviceInfo(dto.device),
      dto.clientApp ?? MOBILE_CLIENT_APP.CUSTOMER,
    );

    return {
      tokens: {
        accessToken: pair.accessToken,
        accessTokenExpiresIn: pair.accessTokenExpiresIn,
        refreshToken: pair.refreshToken,
        refreshTokenExpiresAt: pair.refreshTokenExpiresAt.toISOString(),
      },
      user,
    };
  }
}

/**
 * `exactOptionalPropertyTypes` bật: `{ deviceName: undefined }` KHÔNG gán được vào
 * `{ deviceName?: string }`. Chuyển tường minh thay vì spread để trường vắng mặt là vắng mặt thật.
 */
function toDeviceInfo(device: MobileDeviceDto | undefined) {
  if (!device) return {};
  return {
    ...(device.deviceName === undefined ? {} : { deviceName: device.deviceName }),
    ...(device.devicePlatform === undefined ? {} : { devicePlatform: device.devicePlatform }),
    ...(device.appVersion === undefined ? {} : { appVersion: device.appVersion }),
  };
}
