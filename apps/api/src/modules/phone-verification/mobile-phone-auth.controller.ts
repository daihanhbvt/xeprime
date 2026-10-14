import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiGoneResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ACCOUNT_REALM } from '@xeprime/types';
import { Public, Realms } from '../../common/decorators';
import { otpLoginRetired } from '../auth/auth.service';

/**
 * Đăng nhập bằng SĐT + OTP cho APP NATIVE — ĐÃ GỠ (ADR 0060).
 *
 * Từ ADR 0060 OTP chỉ chứng minh sở hữu số điện thoại; không mã nào tạo tài khoản hay cấp phiên.
 * App đăng nhập bằng `POST /auth/mobile/login` (SĐT + mật khẩu) hoặc mạng xã hội, quên mật khẩu
 * qua `POST /auth/password/reset-otp`.
 *
 * Route ở lại để bản app đang phát hành nhận một MÃ đọc được (`OTP_LOGIN_RETIRED`, 410) thay vì
 * 404: nó không đọc body, không đối chiếu mã, không tạo tài khoản và không phát token — kể cả khi
 * mã gửi lên là đúng. Phiên đã cấp trước đó không bị đụng tới.
 */
@ApiTags('phone-verification')
@Controller('auth/mobile/phone')
@Realms(ACCOUNT_REALM.CUSTOMER, ACCOUNT_REALM.PARTNER)
export class MobilePhoneAuthController {
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.GONE)
  @ApiOperation({
    summary: 'ĐÃ GỠ — Native: đăng nhập bằng OTP. Luôn 410 OTP_LOGIN_RETIRED (ADR 0060)',
    deprecated: true,
  })
  @ApiGoneResponse({ description: 'Đăng nhập bằng OTP đã gỡ — dùng SĐT + mật khẩu.' })
  login(): never {
    throw otpLoginRetired();
  }
}
