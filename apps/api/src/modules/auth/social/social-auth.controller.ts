import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  API_ERROR_CODE,
  AUTH_PROVIDER_VALUES,
  SUPPORTED_LOCALES,
  isAuthProvider,
} from '@xeprime/types';
import type { Response } from 'express';
import { Public } from '../../../common/decorators';
import { SessionService } from '../session.service';
import { NativeAuthCodeService } from './native-auth-code.service';
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
 * ⚠️ **Không dùng DTO cho query, và đó là điều bắt buộc chứ không phải sở thích.**
 *
 * `bootstrap.ts` cài `ValidationPipe` TOÀN CỤC với `forbidNonWhitelisted: true`, và pipe toàn cục
 * ở NestJS **luôn chạy** — `@UsePipes` ở method chỉ THÊM pipe, không thay thế. Gắn một DTO vào
 * `@Query()` nghĩa là mọi tham số ngoài danh sách đều thành 400. Mà chặng callback thì Google tự
 * gắn thêm `iss`, `scope`, `authuser`, `prompt`; Facebook gắn `error_reason`,
 * `error_description`. Kết quả: đăng nhập hỏng 100% và người dùng thấy một trang JSON.
 *
 * Đọc từng tham số bằng `@Query('ten')` thì metatype là `String`, và `ValidationPipe` bỏ qua kiểu
 * nguyên thuỷ — tham số lạ đơn giản là không được đọc tới. Đây cũng là mô hình đúng về mặt ngữ
 * nghĩa: query của chặng callback do BÊN THỨ BA soạn, ta chỉ lấy ba trường mình quan tâm và mặc
 * kệ phần còn lại.
 *
 * Vì thế: không `@VerifiesCredentials()` (route này không bao giờ trả 401), và mọi lỗi đi qua
 * `webRedirect` để về web dưới dạng `?authError=<mã>` — web tra bảng chữ từ MÃ như với mọi lỗi
 * API khác (ADR 0012).
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
    private readonly nativeCodes: NativeAuthCodeService,
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
  @ApiQuery({
    name: 'next',
    required: false,
    description:
      'Đường dẫn nội bộ để quay về sau khi đăng nhập. Không an toàn (có scheme, protocol-relative…) thì bị bỏ qua và về trang chủ.',
    example: '/xe/01HZX9',
  })
  @ApiQuery({
    name: 'locale',
    required: false,
    enum: SUPPORTED_LOCALES,
    description:
      'Ngôn ngữ cho màn đồng ý của provider (màn đó do Google/Facebook render, không phải XePrime). Giá trị lạ rơi về `vi`.',
  })
  @ApiQuery({
    name: 'client',
    required: false,
    enum: ['web', 'native'],
    description:
      'Bỏ trống = web (callback đặt cookie httpOnly). `native` = app (callback trả one-time code về deep link) — khi đó `code_challenge` và `redirect_uri` là BẮT BUỘC.',
  })
  @ApiQuery({
    name: 'code_challenge',
    required: false,
    description: 'PKCE S256 challenge của APP. Chỉ dùng khi `client=native`.',
  })
  @ApiQuery({
    name: 'redirect_uri',
    required: false,
    description:
      'Deep link nhận one-time code. Phải nằm trong allowlist `MOBILE_AUTH_REDIRECT_URIS`. Chỉ dùng khi `client=native`.',
    example: 'xeprime://auth/callback',
  })
  @ApiResponse({ status: 302, description: 'Chuyển hướng tới màn đồng ý của provider.' })
  async begin(
    @Param('provider') providerKey: string,
    @Query('next') next: string | undefined,
    @Query('locale') locale: string | undefined,
    @Query('client') client: string | undefined,
    @Query('code_challenge') codeChallenge: string | undefined,
    @Query('redirect_uri') redirectUri: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const safeNext = next ?? null;

    if (!isAuthProvider(providerKey)) {
      res.redirect(this.social.webRedirect(safeNext, API_ERROR_CODE.SOCIAL_NOT_CONFIGURED));
      return;
    }

    try {
      const native = this.social.resolveNativeContext({ client, codeChallenge, redirectUri });
      res.redirect(
        await this.social.begin({
          provider: providerKey,
          next: safeNext,
          locale: locale ?? null,
          ...(native ? { native } : {}),
        }),
      );
    } catch (error) {
      /*
       * Lỗi ở chặng NÀY luôn về web, kể cả khi app gọi.
       *
       * Cố ý: `redirect_uri` chỉ đáng tin sau khi qua allowlist, và nhánh lỗi phổ biến nhất ở đây
       * CHÍNH LÀ nó không qua được. Redirect về một deep link chưa kiểm để "báo lỗi cho tử tế" là
       * tự mở đúng lỗ hổng vừa chặn.
       */
      this.social.logFailure(providerKey, error);
      res.redirect(this.social.webRedirect(safeNext, socialErrorCode(error)));
    }
  }

  /**
   * Kết thúc: đổi `code` lấy danh tính, phát session cookie, đưa người dùng về web.
   *
   * `next` KHÔNG đọc từ query ở đây mà lấy từ hàng `oauth_states` đã phát: giá trị trong query
   * lúc này do provider gửi lại, còn giá trị trong DB là bản chính ta đã kiểm ở bước bắt đầu.
   */
  @Public()
  @Get(':provider/callback')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Provider gọi về sau khi người dùng đồng ý — phát session cookie rồi về web',
    description:
      'Chỉ provider điều hướng tới đây, và nó tự gắn thêm tham số riêng (`iss`, `scope`, `authuser`, `prompt`…) — endpoint cố ý bỏ qua mọi tham số ngoài ba cái dưới đây. Luôn trả 302 về `APP_WEB_URL`; hỏng thì kèm `?authError=<mã>` (`SOCIAL_STATE_INVALID` · `SOCIAL_CANCELLED` · `SOCIAL_EXCHANGE_FAILED` · `CONFLICT` · `ACCOUNT_LOCKED`).',
  })
  @ApiParam({ name: 'provider', enum: AUTH_PROVIDER_VALUES })
  @ApiQuery({ name: 'code', required: false, description: 'Authorization code khi người dùng đã đồng ý.' })
  @ApiQuery({ name: 'state', required: false, description: 'Giá trị `state` đã phát ở bước bắt đầu.' })
  @ApiQuery({
    name: 'error',
    required: false,
    description: 'Mã lỗi của provider. `access_denied` = người dùng bấm huỷ.',
    example: 'access_denied',
  })
  @ApiResponse({ status: 302, description: 'Chuyển hướng về web, kèm Set-Cookie khi thành công.' })
  async callback(
    @Param('provider') providerKey: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') providerError: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    // Người dùng bấm huỷ ở màn đồng ý. Không phải sự cố — đừng ghi log lỗi, và đừng nói với họ
    // rằng có gì đó hỏng.
    if (providerError) {
      const cancelled = providerError === 'access_denied';
      res.redirect(
        this.social.webRedirect(
          null,
          cancelled ? API_ERROR_CODE.SOCIAL_CANCELLED : API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED,
        ),
      );
      return;
    }

    if (!isAuthProvider(providerKey) || !code || !state) {
      res.redirect(this.social.webRedirect(null, API_ERROR_CODE.SOCIAL_STATE_INVALID));
      return;
    }

    try {
      const result = await this.social.complete({ provider: providerKey, code, state });

      if (!result.ok) {
        // Hỏng thì trả lỗi về ĐÚNG nơi đã mở luồng: deep link nếu là app, web nếu là trình duyệt.
        // `redirectNext` đi kèm cả khi hỏng — người bấm Google từ `/manage/login` phải quay lại
        // đúng trang đó kèm thông báo, không bị thả giữa marketplace.
        res.redirect(
          result.native
            ? this.social.nativeRedirect(result.native, { error: result.errorCode })
            : this.social.webRedirect(result.redirectNext, result.errorCode),
        );
        return;
      }

      /*
       * Đây là chỗ DUY NHẤT hai nền tảng rẽ đôi, và rẽ vì đúng lý do của ADR 0017: cookie không
       * đặt được cho app native, còn token thì không được giao cho trình duyệt (nó không có
       * `httpOnly` để bảo vệ).
       *
       * App KHÔNG nhận thẳng cặp token ở đây — deep link nằm lại trong log của hệ điều hành. Nó
       * nhận một mã sống 60 giây, dùng một lần, và chỉ đổi được khi kèm `code_verifier` mà app
       * giữ trong bộ nhớ (`POST /auth/mobile/social/exchange`).
       */
      if (result.native) {
        const oneTimeCode = await this.nativeCodes.issue({
          userId: result.userId,
          codeChallenge: result.native.codeChallenge,
        });
        res.redirect(this.social.nativeRedirect(result.native, { code: oneTimeCode }));
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
