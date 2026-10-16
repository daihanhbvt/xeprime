import { Controller, Get, HttpCode, HttpStatus, Post, Req, Body } from '@nestjs/common';
import { ApiGoneResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ACCOUNT_REALM,
  PHONE_VERIFICATION_PURPOSE,
  realmForClientApp,
  type AccountRealm,
  type MobileClientApp,
  type PhoneVerificationPurpose,
} from '@xeprime/types';
import { Public, Realms } from '../../common/decorators';
import { resolveOptionalUser, type OptionalUser } from '../../common/optional-user';
import type { RequestContext } from '../../common/types/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService, otpLoginRetired } from '../auth/auth.service';
import { NativeSessionService } from '../auth/native-session.service';
import { RequestRealmService } from '../auth/request-realm.service';
import { SessionService } from '../auth/session.service';
import {
  OtpConfigDto,
  SendOtpDto,
  SendOtpResultDto,
  VerifyOtpDto,
  VerifyOtpResultDto,
} from './dto/phone-verification.dto';
import { PhoneVerificationService } from './phone-verification.service';

/**
 * Xác thực SĐT bằng OTP (Phase 4) — công khai. Provider mock (dev, log mã) hoặc eSMS (thật),
 * chọn qua OTP_MODE. `@Throttle` siết riêng để hãm brute-force mã 6 số (ngoài rate-limit trong
 * service tính theo SĐT). Best-effort gắn userId để stamp `phone_verified_at` khi đã đăng nhập.
 *
 * Từ ADR 0060 OTP CHỈ chứng minh sở hữu số điện thoại — không route nào ở đây tạo tài khoản hay
 * cấp phiên. Mã `register` được đối chiếu trong `POST /auth/register`, mã `password_reset` trong
 * `POST /auth/password/reset-otp` — web có thể `verify-otp` trước để tách màn nhập mã khỏi màn đặt
 * mật khẩu, mã vẫn chỉ đổi được mật khẩu một lần; `POST login` (đăng nhập bằng OTP cũ) chỉ còn trả 410.
 *
 * Mỗi mã thuộc MỘT realm (ADR 0053): site web gọi thì realm của site; app native gọi thẳng (không
 * qua site) thì realm theo `clientApp`. Realm `platform` không có OTP.
 */
@ApiTags('phone-verification')
@Controller('auth/phone')
@Realms(ACCOUNT_REALM.CUSTOMER, ACCOUNT_REALM.PARTNER)
export class PhoneVerificationController {
  constructor(
    private readonly service: PhoneVerificationService,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly nativeSessions: NativeSessionService,
    private readonly realms: RequestRealmService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get('otp-config')
  @ApiOperation({ summary: 'Cấu hình OTP cho giao diện (có nhận mã test hay không)' })
  @ApiOkResponse({ type: OtpConfigDto })
  otpConfig(): OtpConfigDto {
    /*
     * LUÔN false: giao diện (web + hai app) chạy y như production — luôn gửi mã, luôn qua bước nhập
     * mã, không có chữ "thử nghiệm". Việc có tốn SMS hay không do SERVER quyết theo công tắc admin
     * "Gửi SMS mã OTP" (`isSmsDisabled`): tắt (chỉ dev/staging) ⇒ không gọi nhà mạng, mã 123456.
     * Giữ endpoint để app đã phát hành không lỗi khi gọi.
     */
    return { testCodeEnabled: false };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Gửi mã OTP tới số điện thoại. `register`: số đã có tài khoản ⇒ PHONE_TAKEN. `password_reset`: luôn trả như nhau. `login`: 410 OTP_LOGIN_RETIRED (ADR 0060)',
  })
  @ApiOkResponse({ type: SendOtpResultDto })
  @ApiGoneResponse({
    description: '`purpose=login` — đăng nhập bằng OTP đã gỡ (`OTP_LOGIN_RETIRED`).',
  })
  async sendOtp(@Body() dto: SendOtpDto, @Req() req: RequestContext): Promise<SendOtpResultDto> {
    const { realm } = await this.otpContext(req, dto.clientApp);
    const purpose = dto.purpose as PhoneVerificationPurpose;
    // Luật theo MỤC ĐÍCH thuộc về auth (có tài khoản chưa, có được tự đăng ký không) — xem
    // `AuthService.otpDeliveryFor`. Service OTP chỉ lo mã, cooldown và nhà mạng.
    const { deliver } = await this.auth.otpDeliveryFor(purpose, dto.phone, realm);
    const { expiresAt, devCode } = await this.service.sendOtp(dto.phone, purpose, realm, {
      deliver,
    });
    return { expiresAt: expiresAt.toISOString(), devCode };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác nhận mã OTP' })
  @ApiOkResponse({ type: VerifyOtpResultDto })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Req() req: RequestContext,
  ): Promise<VerifyOtpResultDto> {
    const { realm, current } = await this.otpContext(req, dto.clientApp);
    const purpose = dto.purpose as PhoneVerificationPurpose;
    await this.service.verifyOtp(
      dto.phone,
      purpose,
      dto.code,
      realm,
      // Mã quên mật khẩu chứng minh số của tài khoản ĐANG ĐẶT LẠI, không phải của người đang đăng
      // nhập (hộp quên mật khẩu mở được cả khi có phiên) — không gắn số đó vào tài khoản của phiên.
      purpose === PHONE_VERIFICATION_PURPOSE.PASSWORD_RESET ? null : (current?.userId ?? null),
    );
    return { verified: true };
  }

  /**
   * ĐÃ GỠ (ADR 0060) — đăng nhập bằng SĐT + OTP. Route ở lại chỉ để client cũ nhận một MÃ đọc
   * được (`OTP_LOGIN_RETIRED`, 410) thay vì 404 mơ hồ. Không đọc body, không đối chiếu mã, không
   * tạo tài khoản, không cấp phiên — kể cả khi mã gửi lên là đúng.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.GONE)
  @ApiOperation({
    summary: 'ĐÃ GỠ — đăng nhập bằng OTP. Luôn 410 OTP_LOGIN_RETIRED (ADR 0060)',
    deprecated: true,
  })
  @ApiGoneResponse({ description: 'Đăng nhập bằng OTP đã gỡ — dùng SĐT + mật khẩu.' })
  login(): never {
    throw otpLoginRetired();
  }

  /**
   * Realm của mã OTP và người đang đăng nhập (nếu có) — MỘT thứ tự cho cả `send-otp` lẫn
   * `verify-otp`, nếu không mã ghi ở realm này sẽ bị đem đi xác minh ở realm kia và luôn "sai mã".
   *
   * Có phiên (cookie hoặc Bearer) ⇒ realm của phiên: mã gắn vào chính tài khoản đó. Không phiên ⇒
   * site web đang gọi (proxy quyết), rồi tới app native theo `clientApp`, cuối cùng app khách.
   */
  private async otpContext(
    req: RequestContext,
    clientApp: MobileClientApp | undefined,
  ): Promise<{ realm: AccountRealm; current: OptionalUser | null }> {
    const current = await resolveOptionalUser(req, {
      sessions: this.sessions,
      prisma: this.prisma,
      realms: this.realms,
      nativeSessions: this.nativeSessions,
    });
    return { realm: current?.realm ?? req.realm ?? realmForClientApp(clientApp), current };
  }
}
