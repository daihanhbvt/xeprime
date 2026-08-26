import { Controller, Get, Param, Query, Res, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { API_ERROR_CODE, AUTH_PROVIDER_VALUES, isAuthProvider } from '@xeprime/types';
import type { Response } from 'express';
import { Public } from '../../../common/decorators';
import { SessionService } from '../session.service';
import { SocialAuthQueryDto, SocialCallbackQueryDto } from '../dto/social-auth.dto';
import { socialErrorCode } from './social-auth.error';
import { SocialAuthService } from './social-auth.service';

/**
 * Đăng nhập Google/Facebook do BACKEND chủ trì — ADR 0019.
 *
 * Khác mọi controller khác của repo ở một điểm quyết định mọi thứ còn lại: **hai route này
 * không trả JSON.** Chúng là hai chặng của một lần điều hướng trình duyệt, nên đầu ra luôn là
 * `302`. Kể cả khi hỏng — trả `{"error":…}` ở đây nghĩa là người dùng đang bấm "Đăng nhập với
 * Google" và hạ cánh ở một trang trắng đầy JSON.
 *
 * Vì thế: không `@VerifiesCredentials()` (route này không bao giờ trả 401), và mọi lỗi đi qua
 * `redirectWithError` để về web dưới dạng `?authError=<mã>` — web tra bảng chữ từ MÃ như với
 * mọi lỗi API khác (ADR 0012).
 *
 * Client secret của Google/Facebook chỉ tồn tại ở tiến trình này. Trình duyệt không bao giờ
 * thấy nó, và cũng không bao giờ cầm access token của provider.
 */
@ApiTags('auth')
@Controller('auth/social')
export class SocialAuthController {
  constructor(
    private readonly social: SocialAuthService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Bắt đầu: phát `state` + PKCE rồi đẩy người dùng sang màn đồng ý của provider.
   *
   * 20 lần/phút: mỗi lần gọi ghi một hàng `oauth_states`, nên đây là cửa duy nhất có thể bơm
   * rác vào bảng đó mà không cần đăng nhập.
   */
  @Public()
  @Get(':provider')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Bắt đầu đăng nhập mạng xã hội — chuyển hướng sang Google/Facebook',
    description:
      'Trình duyệt điều hướng thẳng tới đây (không phải XHR). Luôn trả 302: sang provider nếu cấu hình đủ, hoặc về web kèm `?authError=SOCIAL_NOT_CONFIGURED`.',
  })
  @ApiParam({ name: 'provider', enum: AUTH_PROVIDER_VALUES })
  @ApiResponse({ status: 302, description: 'Chuyển hướng tới màn đồng ý của provider.' })
  async begin(
    @Param('provider') providerKey: string,
    @Query() query: SocialAuthQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const next = query.next ?? null;

    if (!isAuthProvider(providerKey)) {
      res.redirect(this.social.webRedirect(next, API_ERROR_CODE.SOCIAL_NOT_CONFIGURED));
      return;
    }

    try {
      res.redirect(
        await this.social.begin({ provider: providerKey, next, locale: query.locale ?? null }),
      );
    } catch (error) {
      this.social.logFailure(providerKey, error);
      res.redirect(this.social.webRedirect(next, socialErrorCode(error)));
    }
  }

  /**
   * Kết thúc: đổi `code` lấy danh tính, phát session cookie, đưa người dùng về web.
   *
   * `@UsePipes` nới `forbidNonWhitelisted` — xem docblock của `SocialCallbackQueryDto`: luật
   * toàn cục sẽ 400 vì những tham số mà chính Google gắn thêm.
   *
   * `next` KHÔNG đọc từ query ở đây mà lấy từ hàng `oauth_states` đã phát: giá trị trong query
   * lúc này do provider gửi lại, còn giá trị trong DB là bản chính ta đã kiểm ở bước bắt đầu.
   */
  @Public()
  @Get(':provider/callback')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }))
  @ApiOperation({
    summary: 'Provider gọi về sau khi người dùng đồng ý — phát session cookie rồi về web',
    description:
      'Chỉ provider điều hướng tới đây. Luôn trả 302 về `APP_WEB_URL`; hỏng thì kèm `?authError=<mã>` (`SOCIAL_STATE_INVALID` · `SOCIAL_CANCELLED` · `SOCIAL_EXCHANGE_FAILED` · `CONFLICT` · `ACCOUNT_LOCKED`).',
  })
  @ApiParam({ name: 'provider', enum: AUTH_PROVIDER_VALUES })
  @ApiResponse({ status: 302, description: 'Chuyển hướng về web, kèm Set-Cookie khi thành công.' })
  async callback(
    @Param('provider') providerKey: string,
    @Query() query: SocialCallbackQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    // Người dùng bấm huỷ ở màn đồng ý. Không phải sự cố — đừng ghi log lỗi, và đừng nói với họ
    // rằng có gì đó hỏng.
    if (query.error) {
      const cancelled = query.error === 'access_denied';
      res.redirect(
        this.social.webRedirect(
          null,
          cancelled ? API_ERROR_CODE.SOCIAL_CANCELLED : API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED,
        ),
      );
      return;
    }

    if (!isAuthProvider(providerKey) || !query.code || !query.state) {
      res.redirect(this.social.webRedirect(null, API_ERROR_CODE.SOCIAL_STATE_INVALID));
      return;
    }

    try {
      const result = await this.social.complete({
        provider: providerKey,
        code: query.code,
        state: query.state,
      });

      if (!result.ok) {
        // `redirectNext` đi kèm cả khi hỏng: người bấm Google từ `/manage/login` phải quay lại
        // đúng trang đó kèm thông báo, không bị thả giữa marketplace.
        res.redirect(this.social.webRedirect(result.redirectNext, result.errorCode));
        return;
      }

      // Cùng `SessionService` với `/auth/login` và `/auth/phone/login`: một luồng đăng nhập mới
      // không được đẻ ra một loại phiên mới (ADR 0002).
      const { token } = this.sessions.issue(result.userId);
      this.sessions.attach(res, token);
      res.redirect(this.social.webRedirect(result.redirectNext));
    } catch (error) {
      // Lưới an toàn: `complete()` đã tự xử lý mọi lỗi sau khi tiêu thụ `state`, nên tới đây chỉ
      // còn lỗi TRƯỚC đó (provider chưa cấu hình, `state` không hợp lệ) — lúc chưa biết `next`.
      this.social.logFailure(providerKey, error);
      res.redirect(this.social.webRedirect(null, socialErrorCode(error)));
    }
  }
}
