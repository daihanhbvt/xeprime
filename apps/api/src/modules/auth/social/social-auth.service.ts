import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { isSafeNextPath } from '@xeprime/domain';
import {
  API_ERROR_CODE,
  AUTH_PROVIDER,
  DEFAULT_LOCALE,
  clientAppForRedirectUri,
  realmAllowsPasswordlessLogin,
  realmForClientApp,
  resolveAppLocale,
  type AccountRealm,
  type AuthProvider,
  type MobileClientApp,
} from '@xeprime/types';
import { AuthService } from '../auth.service';
import { RequestRealmService } from '../request-realm.service';
import { FacebookSocialProvider } from './facebook.provider';
import { GoogleSocialProvider } from './google.provider';
import { OauthStateService, STATE_TTL_MS } from './oauth-state.service';
import { SocialAuthFailure, socialErrorCode } from './social-auth.error';
import type { SocialProvider } from './social-provider';

/**
 * Cookie gắn một luồng OAuth web với trình duyệt đã mở nó — ADR 0076 điều 4. Host-only như cookie
 * phiên, nên mỗi site một bản; sống bằng `state` (`STATE_TTL_MS`).
 */
export const OAUTH_BROWSER_COOKIE = 'xp_oauth_state';

/** Client nào đang đăng nhập — quyết định callback phát cookie hay phát one-time code. */
export const SOCIAL_CLIENT = {
  WEB: 'web',
  NATIVE: 'native',
} as const;

export type SocialClient = (typeof SOCIAL_CLIENT)[keyof typeof SOCIAL_CLIENT];

/**
 * Kết quả của chặng callback — union tường minh thay vì "trả về hoặc ném".
 *
 * Lý do: `redirectNext` phải sống sót CẢ KHI HỎNG. Nó chỉ được biết sau khi `state` đã tiêu thụ,
 * nên nếu để lỗi bay ra bằng exception thì controller không còn cách nào biết người dùng xuất
 * phát từ đâu — và một chủ shop đăng nhập hỏng ở `/manage/login` sẽ hạ cánh giữa marketplace,
 * không hiểu vì sao mình ở đó.
 */
export type SocialCallbackResult =
  | {
      ok: true;
      userId: string;
      /** Realm của luồng (ADR 0053) — controller phát cookie của ĐÚNG realm này. */
      realm: AccountRealm;
      redirectNext: string | null;
      /** Khác null ⇒ client là APP NATIVE: đừng phát cookie, hãy redirect về deep link này. */
      native: NativeCallbackTarget | null;
    }
  | {
      ok: false;
      errorCode: string;
      realm: AccountRealm;
      redirectNext: string | null;
      native: NativeCallbackTarget | null;
    };

/** Đích trả kết quả cho app native — deep link đã qua allowlist + PKCE challenge của app. */
export interface NativeCallbackTarget {
  redirectUri: string;
  codeChallenge: string;
  /**
   * App đã khởi tạo luồng — suy TẤT ĐỊNH từ scheme của `redirectUri` (đã qua allowlist), không
   * phải một trường client tự khai. One-time code phát ra mang giá trị này và bước exchange
   * đối chiếu lại (`NativeAuthCodeService.consume`).
   */
  clientApp: MobileClientApp;
}

/**
 * Điều phối đăng nhập mạng xã hội — ADR 0019.
 *
 * Ba việc, và cố ý không hơn: chọn provider, giữ `state`, và giao danh tính đã xác minh cho
 * `AuthService`. Nó KHÔNG phát phiên — cookie của web (`SessionService`) và cặp token của native
 * (`NativeSessionService`) là hai vòng đời khác nhau, và chỗ quyết định phát cái nào là
 * controller, đúng như cách `/auth/login` và `/auth/mobile/login` đang tách.
 */
@Injectable()
export class SocialAuthService {
  private readonly logger = new Logger(SocialAuthService.name);

  /**
   * Provider dựng MỘT LẦN lúc khởi động, không phải mỗi request.
   *
   * Provider nào thiếu id/secret thì đơn giản là vắng mặt trong map — không có cờ bật/tắt riêng.
   * Nhờ vậy chỉ có một câu trả lời cho "Google có dùng được không": nó có trong map hay không.
   */
  private readonly providers: ReadonlyMap<AuthProvider, SocialProvider>;

  constructor(
    private readonly config: ConfigService,
    private readonly states: OauthStateService,
    private readonly auth: AuthService,
    private readonly realms: RequestRealmService,
  ) {
    this.providers = buildProviders(config);
  }

  /** Provider có cấu hình đủ để dùng không — dùng cho cả nhánh lỗi lẫn tài liệu. */
  isEnabled(provider: AuthProvider): boolean {
    return this.providers.has(provider);
  }

  /**
   * Bắt đầu: phát `state` + PKCE, trả URL màn đồng ý của provider.
   *
   * `next` được kiểm NGAY TẠI ĐÂY rồi mới ghi xuống DB. Kiểm ở chặng callback thì đã muộn: giá
   * trị chưa kiểm nằm sẵn trong bảng là một open redirect chờ ai đó tin nó.
   */
  async begin(params: {
    provider: AuthProvider;
    next: string | null;
    locale: string | null;
    /**
     * Realm của SITE đang mở luồng web (header proxy đã qua khoá). Bỏ qua với luồng native: realm
     * của app suy từ scheme `redirect_uri` đã qua allowlist — ADR 0053 điều 4.
     */
    webRealm: AccountRealm | null;
    /** Có ⇒ luồng của APP NATIVE. Đã kiểm allowlist ở `resolveNativeContext`. */
    native?: NativeCallbackTarget | undefined;
  }): Promise<string> {
    const provider = this.requireProvider(params.provider);
    const realm = params.native ? realmForClientApp(params.native.clientApp) : params.webRealm;
    if (!realm) {
      throw new SocialAuthFailure(
        API_ERROR_CODE.REALM_UNRESOLVED,
        'luồng web không xác định được site đang gọi',
      );
    }
    // Tài khoản quản trị chỉ có mật khẩu (ADR 0053 điều 3) — chặn TRƯỚC khi đẩy người dùng sang
    // màn đồng ý của Google, không để họ đồng ý xong mới biết là vô ích.
    if (!realmAllowsPasswordlessLogin(realm)) {
      throw new SocialAuthFailure(
        API_ERROR_CODE.REALM_LOGIN_METHOD_NOT_ALLOWED,
        'realm platform không đăng nhập bằng mạng xã hội',
      );
    }
    const { state, codeChallenge, nonce } = await this.states.issue({
      provider: params.provider,
      realm,
      redirectNext: isSafeNextPath(params.next) ? params.next : null,
      client: params.native ? SOCIAL_CLIENT.NATIVE : SOCIAL_CLIENT.WEB,
      ...(params.native
        ? {
            native: {
              codeChallenge: params.native.codeChallenge,
              redirectUri: params.native.redirectUri,
            },
          }
        : {}),
    });

    return provider.authorizeUrl({
      state,
      codeChallenge,
      nonce,
      redirectUri: this.redirectUri(params.provider, realm, Boolean(params.native)),
      locale: resolveAppLocale(params.locale ?? DEFAULT_LOCALE),
    });
  }

  /**
   * Kết thúc: tiêu thụ `state`, đổi `code` lấy danh tính, rồi tìm/tạo user.
   *
   * Thứ tự KHÔNG đổi được: `consume()` phải chạy trước lời gọi mạng đầu tiên. Nếu đổi token
   * trước rồi mới kiểm `state`, thì mỗi lần phát lại URL callback đều tốn một request thật sang
   * provider — tức endpoint công khai này thành một cái loa khuếch đại.
   */
  async complete(params: {
    provider: AuthProvider;
    code: string;
    state: string;
    /**
     * Giá trị cookie `OAUTH_BROWSER_COOKIE` mà trình duyệt gửi kèm callback (ADR 0076 điều 4) —
     * `null` khi không có. Luồng WEB bắt buộc nó trùng `state`; luồng native không dùng (PKCE của
     * app đã buộc kết quả vào đúng app đã mở luồng).
     */
    browserState: string | null;
  }): Promise<SocialCallbackResult> {
    const provider = this.requireProvider(params.provider);

    // Trước khi tiêu thụ `state` thì chưa biết `next` lẫn deep link, nên lỗi ở đây buộc phải về
    // web. App native gặp ca này sẽ thấy trình duyệt dừng ở một trang web — không đẹp, nhưng đó
    // là hệ quả không tránh được của việc `state` hỏng: ta không biết app nào đã mở nó.
    const stored = await this.states.consume(params.state);
    const { redirectNext, realm } = stored;
    const native: NativeCallbackTarget | null =
      stored.client === SOCIAL_CLIENT.NATIVE && stored.appRedirectUri && stored.appCodeChallenge
        ? {
            redirectUri: stored.appRedirectUri,
            codeChallenge: stored.appCodeChallenge,
            // Suy lại từ cùng redirect_uri đã lưu lúc begin — tất định, không cần cột mới
            // trong `oauth_states`.
            clientApp: clientAppForRedirectUri(stored.appRedirectUri),
          }
        : null;

    try {
      // `state` phát cho Google mà quay về ở callback của Facebook là dấu hiệu bị ghép URL bằng
      // tay. Không có luồng hợp lệ nào tạo ra tình huống này.
      if (stored.provider !== params.provider) {
        throw new SocialAuthFailure(
          API_ERROR_CODE.SOCIAL_STATE_INVALID,
          `state thuộc provider ${stored.provider}, callback lại là ${params.provider}`,
        );
      }

      /*
       * Luồng WEB: callback phải về CHÍNH trình duyệt đã bấm nút (ADR 0076 điều 4).
       *
       * Không có phép so này thì `state` chỉ chống giả mạo provider, không chống login CSRF: kẻ
       * xấu tự mở luồng bằng Google của họ, dừng ở URL callback rồi gửi link đó cho nạn nhân —
       * nạn nhân bấm là đăng nhập vào tài khoản của kẻ xấu, và bằng lái, chuyến đi họ nhập sau
       * đó rơi vào tay kẻ kia. Cookie httpOnly đặt lúc bắt đầu chỉ có ở trình duyệt đã bắt đầu.
       *
       * Kiểm SAU `consume()`: link bị đem đi đâu thì `state` cũng đã cháy, không thử lại được.
       */
      if (native === null && !sameSecret(params.browserState, params.state)) {
        throw new SocialAuthFailure(
          API_ERROR_CODE.SOCIAL_STATE_INVALID,
          'callback web không mang cookie trình duyệt khớp state (khác trình duyệt đã mở luồng)',
        );
      }

      const identity = await provider.exchange({
        code: params.code,
        codeVerifier: stored.codeVerifier,
        nonce: stored.nonce,
        redirectUri: this.redirectUri(params.provider, realm, native !== null),
      });

      const { userId } = await this.auth.upsertUserFromIdentity(identity, realm);
      return { ok: true, userId, realm, redirectNext, native };
    } catch (error) {
      // Bắt ở ĐÂY chứ không ở controller: đây là chỗ cuối cùng còn cầm `redirectNext` + deep link.
      this.logFailure(params.provider, error);
      return { ok: false, errorCode: socialErrorCode(error), realm, redirectNext, native };
    }
  }

  /**
   * Đối chiếu tham số native của app với allowlist — trả `null` nếu đây không phải luồng native.
   *
   * `redirect_uri` do CLIENT gửi, nên nó là dữ liệu của kẻ tấn công cho tới khi khớp một giá trị
   * trong `MOBILE_AUTH_REDIRECT_URIS`. Không có bước này thì một link
   * `…/auth/social/google?client=native&redirect_uri=evil://x` sẽ giao one-time code thẳng cho
   * app của kẻ tấn công — cùng loại lỗ hổng mà `isSafeNextPath` chặn ở phía web.
   *
   * Ném `SocialAuthFailure` chứ không im lặng rơi về web: app gọi sai tham số phải biết mình sai,
   * không phải chờ mãi một deep link không bao giờ tới.
   */
  resolveNativeContext(params: {
    client: string | undefined;
    codeChallenge: string | undefined;
    redirectUri: string | undefined;
  }): NativeCallbackTarget | null {
    if (params.client !== SOCIAL_CLIENT.NATIVE) return null;

    const allowed = this.config.getOrThrow<string[]>('MOBILE_AUTH_REDIRECT_URIS');
    if (!params.redirectUri || !allowed.includes(params.redirectUri)) {
      throw new SocialAuthFailure(
        API_ERROR_CODE.SOCIAL_STATE_INVALID,
        'redirect_uri không nằm trong MOBILE_AUTH_REDIRECT_URIS',
      );
    }

    // PKCE S256: challenge là base64url của 32 byte băm ⇒ đúng 43 ký tự. Kiểm độ dài để một app
    // gửi chuỗi rỗng không tạo ra một "PKCE" mà mọi verifier đều khớp.
    if (!params.codeChallenge || params.codeChallenge.length < 43) {
      throw new SocialAuthFailure(
        API_ERROR_CODE.SOCIAL_STATE_INVALID,
        'thiếu code_challenge hợp lệ (PKCE S256 bắt buộc với client native)',
      );
    }

    return {
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      clientApp: clientAppForRedirectUri(params.redirectUri),
    };
  }

  /**
   * URL deep link trả kết quả về app.
   *
   * Dùng `URL` để ghép tham số thay vì nối chuỗi: scheme tuỳ biến (`xeprime://`) vẫn parse được,
   * và tham số được encode đúng.
   */
  nativeRedirect(target: NativeCallbackTarget, params: { code?: string; error?: string }): string {
    const url = new URL(target.redirectUri);
    if (params.code) url.searchParams.set('code', params.code);
    if (params.error) url.searchParams.set('error', params.error);
    return url.toString();
  }

  /**
   * URL cuối cùng để đưa người dùng về web — về đúng SITE của realm (ADR 0053).
   *
   * Dựng từ cấu hình (`siteOrigin`/`webUrlFor`) chứ không từ header `Referer` hay `Origin` của
   * request: cả hai đều do client gửi, và một `Location` dựng từ dữ liệu client là định nghĩa của
   * open redirect.
   *
   * `next` là path HIỂN THỊ trên site đó (đã gồm tiền tố khu ở chế độ `path` của ADR 0051), nên
   * ghép với ORIGIN. Không có `next` an toàn ⇒ trang chủ của site.
   */
  webRedirect(realm: AccountRealm, next: string | null, errorCode?: string): string {
    const url = isSafeNextPath(next)
      ? new URL(`${this.realms.siteOrigin(realm)}${next}`)
      : new URL(`${this.realms.webUrlFor(realm)}/`);
    if (errorCode) {
      url.searchParams.set('authError', errorCode);
      // Mở lại hộp đăng nhập ở đúng chế độ để người dùng thử tiếp ngay, không phải tự đi tìm nút.
      url.searchParams.set('auth', 'login');
    }
    return url.toString();
  }

  /**
   * Gắn luồng WEB vừa mở với trình duyệt này: cookie httpOnly mang `state` (đọc từ URL màn đồng ý
   * vừa dựng), sống bằng `state` — ADR 0076 điều 4. Luồng native không gọi hàm này.
   *
   * `sameSite: lax` là đủ và là bắt buộc: callback là điều hướng GET cấp cao nhất từ Google/Facebook
   * về site, `lax` gửi cookie ở đúng loại request đó (`strict` thì không).
   */
  bindBrowser(res: Response, authorizeUrl: string): void {
    const state = new URL(authorizeUrl).searchParams.get('state');
    if (!state) return;
    res.cookie(OAUTH_BROWSER_COOKIE, state, {
      ...this.browserCookieOptions(),
      maxAge: STATE_TTL_MS,
    });
  }

  /** Giá trị cookie gắn trình duyệt trên request callback, hoặc `null`. */
  browserStateOf(req: Pick<Request, 'cookies'>): string | null {
    const value = (req.cookies as Record<string, string> | undefined)?.[OAUTH_BROWSER_COOKIE];
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  /** Cookie gắn trình duyệt dùng một lần — xoá ở mọi lối ra của callback. */
  clearBrowserBinding(res: Response): void {
    res.clearCookie(OAUTH_BROWSER_COOKIE, this.browserCookieOptions());
  }

  private browserCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.getOrThrow<boolean>('SESSION_COOKIE_SECURE'),
      sameSite: 'lax',
      path: '/',
    };
  }

  /** Ghi log lỗi ở phía server — chi tiết KHÔNG bao giờ ra tới client (ADR 0012). */
  logFailure(provider: string, error: unknown): void {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Đăng nhập ${provider} thất bại: ${detail}`);
  }

  /**
   * `redirect_uri` phải TRÙNG TỪNG KÝ TỰ với giá trị đã khai trong Google/Facebook console, và
   * phải giống nhau ở cả hai chặng (authorize và token) — provider đối chiếu chúng với nhau.
   * Vì thế nó được tính ở đúng một hàm, không ghép tay ở hai chỗ.
   *
   * ADR 0053: callback của WEB nằm dưới `/api` của chính site đó, để cookie phiên do site đó phát
   * (host-only). Luồng NATIVE giữ callback trên `API_PUBLIC_URL` — nó không phát cookie mà phát
   * one-time code về deep link. Mỗi site + native là một URI phải khai trong console provider.
   */
  private redirectUri(provider: AuthProvider, realm: AccountRealm, native: boolean): string {
    const base = native
      ? this.config.getOrThrow<string>('API_PUBLIC_URL').replace(/\/+$/, '')
      : `${this.realms.siteOrigin(realm)}/api`;
    return `${base}/auth/social/${provider}/callback`;
  }

  private requireProvider(key: AuthProvider): SocialProvider {
    const provider = this.providers.get(key);
    if (!provider) {
      throw new SocialAuthFailure(
        API_ERROR_CODE.SOCIAL_NOT_CONFIGURED,
        `${key} chưa có client id/secret trong env`,
      );
    }
    return provider;
  }
}

/** So hai bí mật trong thời gian hằng; thiếu một bên là không khớp. */
function sameSecret(a: string | null, b: string): boolean {
  if (!a) return false;
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

function buildProviders(config: ConfigService): ReadonlyMap<AuthProvider, SocialProvider> {
  const providers = new Map<AuthProvider, SocialProvider>();

  const googleId = config.get<string>('GOOGLE_OAUTH_CLIENT_ID');
  const googleSecret = config.get<string>('GOOGLE_OAUTH_CLIENT_SECRET');
  if (googleId && googleSecret) {
    providers.set(AUTH_PROVIDER.GOOGLE, new GoogleSocialProvider(googleId, googleSecret));
  }

  const facebookId = config.get<string>('FACEBOOK_APP_ID');
  const facebookSecret = config.get<string>('FACEBOOK_APP_SECRET');
  if (facebookId && facebookSecret) {
    providers.set(AUTH_PROVIDER.FACEBOOK, new FacebookSocialProvider(facebookId, facebookSecret));
  }

  return providers;
}
