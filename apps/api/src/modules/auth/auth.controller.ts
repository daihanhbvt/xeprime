import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ACCOUNT_REALM,
  ACCOUNT_REALM_VALUES,
  realmForClientApp,
  type AccountRealm,
} from '@xeprime/types';
import type { Response } from 'express';
import {
  CurrentUser,
  Public,
  Realms,
  VerifiesCredentials,
  WebRealm,
} from '../../common/decorators';
import type { AuthenticatedUser, RequestContext } from '../../common/types/request-context';
import { AuthService } from './auth.service';
import { SessionService, WEB_REVOKE_REASON } from './session.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  MeDto,
  RegisterCheckDto,
  RegisterDto,
  ResetPasswordDto,
  ResetPasswordWithOtpDto,
  SetPasswordDto,
} from './dto/auth.dto';

/**
 * Xác thực cho WEB — phiên bằng httpOnly cookie (ADR 0002), tách theo realm (ADR 0053).
 *
 * Mọi route ở đây phục vụ cả ba site, và realm của tài khoản đến từ SITE đang gọi (`@WebRealm()` —
 * header proxy đã qua khoá), không bao giờ từ body. Cùng một số điện thoại đăng ký ở site khách và
 * site partner là hai tài khoản, hai mật khẩu, hai cookie khác tên.
 *
 * `@Throttle` trên bốn route công khai dưới đây siết chặt hơn hẳn mức chung 120 req/phút của app
 * (`app.module.ts`), và đặt **bằng đúng** mức của cặp song sinh native ở `MobileAuthController`:
 * hai controller gọi CÙNG `AuthService.loginWithPassword` / `AuthService.register`, nên để web
 * rộng hơn nghĩa là cửa dò mật khẩu chặt nhất của hệ thống chính là cửa lỏng nhất — kẻ dò chỉ
 * việc đổi URL.
 *
 * Hai lớp hãm dò mật khẩu: rate limit theo IP ở đây, và khoá theo ĐỊNH DANH ở `LoginThrottleService`
 * (ADR 0076 — chặn dò một tài khoản từ nhiều IP). `loginWithPassword` trả cùng một lỗi cho "không
 * có tài khoản" và "sai mật khẩu", so bcrypt với hash giả khi không tìm thấy user, và khoá cả định
 * danh không tồn tại — không lớp nào tố cáo *ai tồn tại*.
 *
 * `password/forgot` siết cùng mức vì mỗi request GỬI MỘT EMAIL tới địa chỉ người khác nhập vào:
 * không siết thì đây là một khẩu súng bắn thư miễn phí, dù nó luôn trả 204 và không rò rỉ gì.
 */
@ApiTags('auth')
@Controller('auth')
@Realms(...ACCOUNT_REALM_VALUES)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  // 5/phút — bằng `POST /auth/mobile/register`. Mã OTP sai được đếm và khoá ở
  // `PhoneVerificationService`; mức này hãm phần còn lại (băm mật khẩu tốn ~250ms mỗi lượt).
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Đăng ký bằng số điện thoại + mật khẩu + mã OTP `purpose=register` — tài khoản thuộc realm của site đang gọi',
  })
  @ApiOkResponse({ type: MeDto })
  async register(
    @Body() dto: RegisterDto,
    @WebRealm() realm: AccountRealm,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDto> {
    const { userId } = await this.auth.register(dto, realm);
    await this.issueSession(res, userId, realm);
    return this.auth.me(userId);
  }

  /**
   * Bước 1 của đăng ký: kiểm thông tin TRƯỚC khi sang bước nhập mã — form chỉ chuyển bước khi mọi
   * thứ đã hợp lệ (luật ô của DTO, site có tự đăng ký, SĐT chưa có tài khoản ở site này). Không gửi
   * mã, không tạo gì.
   *
   * Realm: site đang gọi (proxy); request không qua site nào (app native) thì theo `clientApp`.
   */
  @Public()
  @Realms(ACCOUNT_REALM.CUSTOMER, ACCOUNT_REALM.PARTNER)
  @Post('register/check')
  @HttpCode(HttpStatus.NO_CONTENT)
  // 10/phút — bằng `send-otp`: cùng một câu trả lời "số đã có tài khoản", cùng mức chặn dò số.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Kiểm thông tin đăng ký (SĐT, mật khẩu, họ tên, SĐT chưa có tài khoản) trước bước nhập mã OTP',
  })
  @ApiNoContentResponse()
  async checkRegistration(
    @Body() dto: RegisterCheckDto,
    @Req() req: RequestContext,
  ): Promise<void> {
    const realm = req.realm ?? realmForClientApp(dto.clientApp);
    await this.auth.checkRegistration(dto.phone, realm);
  }

  @Public()
  @VerifiesCredentials()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // 5/phút theo IP — bằng `POST /auth/mobile/login`. Lớp thứ hai (theo ĐỊNH DANH, mọi IP) nằm ở
  // `LoginThrottleService` (ADR 0076).
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Đăng nhập bằng số điện thoại + mật khẩu (site quản trị: email hoặc số điện thoại) — ADR 0060',
  })
  @ApiOkResponse({ type: MeDto })
  async login(
    @Body() dto: LoginDto,
    @WebRealm() realm: AccountRealm,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDto> {
    const { userId } = await this.auth.loginWithPassword(dto.identifier, dto.password, realm);
    await this.issueSession(res, userId, realm);
    return this.auth.me(userId);
  }

  @Post('password/set')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Đặt mật khẩu lần đầu cho tài khoản chưa có (vd tạo bằng Google/Facebook)',
  })
  @ApiNoContentResponse()
  async setPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetPasswordDto,
  ): Promise<void> {
    await this.auth.setPassword(user.id, dto.password);
  }

  @Post('password/change')
  @HttpCode(HttpStatus.NO_CONTENT)
  // 5/phút — bằng `login`: route này SO mật khẩu hiện tại, tức là một cửa dò mật khẩu của chính
  // phiên đang đăng nhập (máy bỏ quên, cookie bị lấy). Không hãm thì kẻ có phiên đoán được mật
  // khẩu cũ để đổi sang mật khẩu của họ và chiếm hẳn tài khoản.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Đổi mật khẩu — cần mật khẩu hiện tại; tài khoản chưa có thì dùng password/set. Mọi phiên KHÁC (web + app) bị đăng xuất',
  })
  @ApiNoContentResponse()
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword, {
      sessionId: user.sessionId,
      transport: user.transport,
    });
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(HttpStatus.NO_CONTENT)
  // 5/phút — mỗi request gửi một email tới địa chỉ do người gọi nhập.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Quên mật khẩu: gửi link đặt lại qua email (về site của tài khoản)' })
  @ApiNoContentResponse()
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @WebRealm() realm: AccountRealm,
  ): Promise<void> {
    // Luôn 204 dù email có tồn tại hay không (không rò rỉ email đã đăng ký).
    await this.auth.requestPasswordReset(dto.email, realm);
  }

  @Public()
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  // 10/phút — token đặt lại là 32 byte ngẫu nhiên nên không dò nổi bằng vét cạn; mức này để một
  // client hỏng không bơm được vào bảng token, không phải để chống đoán.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Đặt lại mật khẩu từ token trong email' })
  @ApiNoContentResponse()
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @WebRealm() realm: AccountRealm,
  ): Promise<void> {
    await this.auth.resetPassword(dto.token, dto.password, realm);
  }

  /**
   * Quên mật khẩu bằng SỐ ĐIỆN THOẠI (ADR 0060) — site khách, site partner và hai app.
   *
   * Bước trước: `POST /auth/phone/send-otp { purpose: 'password_reset' }` — luôn trả như nhau dù số
   * có tài khoản hay không. Web xác minh mã riêng ở màn "Nhập mã OTP" (`POST /auth/phone/verify-otp`)
   * rồi mới hỏi mật khẩu mới; app gửi mã + mật khẩu cùng lúc — route này nhận cả hai, và TIÊU mã.
   * Bước này: mã đúng ⇒ đặt mật khẩu mới, 204. KHÔNG phát cookie hay token — OTP ở đây mở quyền đổi
   * mật khẩu, không phải một cách đăng nhập.
   *
   * Realm: site đang gọi (proxy); request không qua site nào (app native gọi host API riêng) thì
   * theo `clientApp`. Site quản trị bị chặn bởi `@Realms` — tài khoản `platform` đặt lại qua email.
   */
  @Public()
  @Realms(ACCOUNT_REALM.CUSTOMER, ACCOUNT_REALM.PARTNER)
  @Post('password/reset-otp')
  @HttpCode(HttpStatus.NO_CONTENT)
  // 10/phút — bằng `verify-otp`: mã 6 số là cửa dò. Lần đoán sai được đếm trên CHÍNH hàng mã (đang
  // chờ hay đã qua bước "Nhập mã OTP"), chạm `OTP_POLICY.MAX_ATTEMPTS` là mã bị khoá.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Quên mật khẩu bằng SĐT: mã OTP `purpose=password_reset` + mật khẩu mới (không cấp phiên)',
  })
  @ApiNoContentResponse()
  async resetPasswordWithOtp(
    @Body() dto: ResetPasswordWithOtpDto,
    @Req() req: RequestContext,
  ): Promise<void> {
    const realm = req.realm ?? realmForClientApp(dto.clientApp);
    await this.auth.resetPasswordWithOtp(dto.phone, dto.code, dto.password, realm);
  }

  @Public()
  @Delete('session')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Đăng xuất: thu hồi phiên của cookie (phía server) rồi xoá cookie của site đang gọi',
  })
  async logout(
    @Req() req: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    // Đăng xuất là của MỘT realm (ADR 0053 điều 4) — không có "đăng xuất mọi nơi". Không xác định
    // được site thì không có cookie nào của mình để xoá.
    if (!req.realm) return;
    const token = (req.cookies as Record<string, string> | undefined)?.[
      this.sessions.cookieName(req.realm)
    ];
    /*
     * Thu hồi ở SERVER trước (ADR 0076): xoá cookie trên trình duyệt này thôi thì bản cookie đã bị
     * sao chép ở nơi khác vẫn sống đủ 7 ngày. Cookie hỏng/hết hạn ⇒ không có phiên nào để thu hồi,
     * vẫn xoá cookie và trả 204 — đăng xuất không bao giờ thất bại.
     */
    if (token) {
      try {
        const { sid } = this.sessions.verify(token);
        await this.sessions.revoke(sid, WEB_REVOKE_REASON.LOGOUT);
      } catch {
        // Cookie không còn hợp lệ — đã là "đăng xuất" theo mọi nghĩa.
      }
    }
    this.sessions.clear(res, req.realm);
  }

  private async issueSession(res: Response, userId: string, realm: AccountRealm): Promise<void> {
    const { token } = await this.sessions.issue(userId);
    this.sessions.attach(res, token, realm);
  }

  @Get('me')
  @ApiOperation({ summary: 'Thông tin user hiện tại kèm tenant scope và quyền' })
  @ApiOkResponse({ type: MeDto })
  me(@CurrentUser() user: AuthenticatedUser): Promise<MeDto> {
    return this.auth.me(user.id);
  }
}
