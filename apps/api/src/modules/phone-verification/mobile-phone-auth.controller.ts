import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ACCOUNT_REALM,
  MOBILE_CLIENT_APP,
  PHONE_VERIFICATION_PURPOSE,
  realmForClientApp,
  type AccountRealm,
} from '@xeprime/types';
import { Public, Realms, VerifiesCredentials } from '../../common/decorators';
import { AuthService } from '../auth/auth.service';
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
@Realms(ACCOUNT_REALM.CUSTOMER, ACCOUNT_REALM.PARTNER)
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
    const realm = realmForClientApp(dto.clientApp);
    await this.service.verifyOtp(
      dto.phone,
      PHONE_VERIFICATION_PURPOSE.LOGIN,
      dto.code,
      acceptedOtpRealms(realm),
      null,
    );
    // Tìm/tạo tài khoản theo SĐT TRONG realm của app (ADR 0053): app Partner tạo tài khoản đối tác
    // cho số chưa đăng ký, như site partner. Quyền + tenant scope đi trong BODY, không trong token
    // (ADR 0017 §1).
    // `displayName` chỉ đặt tên cho tài khoản TẠO MỚI — tên khách gõ ở form đặt xe, như bản web.
    const { userId } = await this.auth.resolveOrCreateUserByPhone(
      dto.phone,
      realm,
      dto.displayName,
    );
    const user = await this.auth.me(userId);

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
/**
 * Realm của mã OTP được nhận cho một lượt đăng nhập native.
 *
 * App khách: đúng realm `customer`. App Partner: `partner` HOẶC `customer` — CẦU TƯƠNG THÍCH có hạn,
 * không phải luật: bản app hiện có gọi `POST /auth/phone/send-otp` mà KHÔNG gửi `clientApp`, nên
 * mã của nó được ghi realm `customer` (mặc định của app cũ). Siết cứng ở đây là gãy đăng nhập OTP
 * của app Partner trong đợt mà mobile không được sửa (ADR 0053, mục mobile). Mã OTP chứng minh sở
 * hữu SỐ ĐIỆN THOẠI — tài khoản nào được đăng nhập vẫn chỉ tra trong realm `partner`.
 *
 * Gỡ vế `customer` khi app Partner gửi `clientApp: 'partner'` ở `send-otp`.
 */
function acceptedOtpRealms(realm: AccountRealm): readonly AccountRealm[] {
  return realm === ACCOUNT_REALM.PARTNER
    ? [ACCOUNT_REALM.PARTNER, ACCOUNT_REALM.CUSTOMER]
    : [realm];
}

function toDeviceInfo(device: MobileDeviceDto | undefined) {
  if (!device) return {};
  return {
    ...(device.deviceName === undefined ? {} : { deviceName: device.deviceName }),
    ...(device.devicePlatform === undefined ? {} : { devicePlatform: device.devicePlatform }),
    ...(device.appVersion === undefined ? {} : { appVersion: device.appVersion }),
  };
}
