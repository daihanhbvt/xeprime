import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ACCOUNT_REALM,
  PHONE_VERIFICATION_PURPOSE,
  realmForClientApp,
  type AccountRealm,
  type MobileClientApp,
  type PhoneVerificationPurpose,
} from '@xeprime/types';
import type { Response } from 'express';
import { Public, Realms, VerifiesCredentials, WebRealm } from '../../common/decorators';
import { resolveOptionalUser, type OptionalUser } from '../../common/optional-user';
import type { RequestContext } from '../../common/types/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { NativeSessionService } from '../auth/native-session.service';
import { RequestRealmService } from '../auth/request-realm.service';
import { SessionService } from '../auth/session.service';
import { MeDto } from '../auth/dto/auth.dto';
import {
  PhoneLoginDto,
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
 * `POST login` là passwordless (ADR 0002): OTP purpose=login vừa xác thực SĐT vừa cấp session
 * httpOnly — tái dùng `SessionService` như mọi luồng đăng nhập khác, không nhét quyền vào token.
 *
 * Mỗi mã thuộc MỘT realm (ADR 0053): site web gọi thì realm của site; app native gọi thẳng (không
 * qua site) thì realm theo `clientApp`. Realm `platform` không có OTP — tài khoản quản trị chỉ đăng
 * nhập bằng mật khẩu.
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
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gửi mã OTP tới số điện thoại' })
  @ApiOkResponse({ type: SendOtpResultDto })
  async sendOtp(@Body() dto: SendOtpDto, @Req() req: RequestContext): Promise<SendOtpResultDto> {
    const { realm } = await this.otpContext(req, dto.clientApp);
    const { expiresAt, devCode } = await this.service.sendOtp(
      dto.phone,
      dto.purpose as PhoneVerificationPurpose,
      realm,
    );
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
    await this.service.verifyOtp(
      dto.phone,
      dto.purpose as PhoneVerificationPurpose,
      dto.code,
      realm,
      current?.userId ?? null,
    );
    return { verified: true };
  }

  @Public()
  @VerifiesCredentials()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập passwordless bằng SĐT + OTP (tự tạo tài khoản nếu chưa có)' })
  @ApiOkResponse({ type: MeDto })
  async login(
    @Body() dto: PhoneLoginDto,
    @WebRealm() realm: AccountRealm,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDto> {
    // Verify OTP purpose=login (đúng mục đích, không dùng chéo) → tìm/tạo tài khoản theo SĐT TRONG
    // realm của site → cấp session cookie của realm đó. Tất cả sau khi khách đã chứng minh sở hữu
    // SĐT bằng mã đúng.
    await this.service.verifyOtp(
      dto.phone,
      PHONE_VERIFICATION_PURPOSE.LOGIN,
      dto.code,
      realm,
      null,
    );
    const { userId } = await this.auth.resolveOrCreateUserByPhone(
      dto.phone,
      realm,
      dto.displayName,
    );
    const { token } = this.sessions.issue(userId);
    this.sessions.attach(res, token, realm);
    return this.auth.me(userId);
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
