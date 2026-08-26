import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isSafeNextPath } from '@xeprime/domain';
import {
  API_ERROR_CODE,
  AUTH_PROVIDER,
  DEFAULT_LOCALE,
  resolveAppLocale,
  type AuthProvider,
} from '@xeprime/types';
import { AuthService } from '../auth.service';
import { FacebookSocialProvider } from './facebook.provider';
import { GoogleSocialProvider } from './google.provider';
import { OauthStateService } from './oauth-state.service';
import { SocialAuthFailure, socialErrorCode } from './social-auth.error';
import type { SocialProvider } from './social-provider';

/** Client nào đang đăng nhập. Đợt ADR 0019 chỉ có `web`; `native` là chỗ cắm của ADR 0017. */
export const SOCIAL_CLIENT = {
  WEB: 'web',
} as const;

/**
 * Kết quả của chặng callback — union tường minh thay vì "trả về hoặc ném".
 *
 * Lý do: `redirectNext` phải sống sót CẢ KHI HỎNG. Nó chỉ được biết sau khi `state` đã tiêu thụ,
 * nên nếu để lỗi bay ra bằng exception thì controller không còn cách nào biết người dùng xuất
 * phát từ đâu — và một chủ shop đăng nhập hỏng ở `/manage/login` sẽ hạ cánh giữa marketplace,
 * không hiểu vì sao mình ở đó.
 */
export type SocialCallbackResult =
  | { ok: true; userId: string; redirectNext: string | null }
  | { ok: false; errorCode: string; redirectNext: string | null };

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
  }): Promise<string> {
    const provider = this.requireProvider(params.provider);
    const { state, codeChallenge, nonce } = await this.states.issue({
      provider: params.provider,
      redirectNext: isSafeNextPath(params.next) ? params.next : null,
      client: SOCIAL_CLIENT.WEB,
    });

    return provider.authorizeUrl({
      state,
      codeChallenge,
      nonce,
      redirectUri: this.redirectUri(params.provider),
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
  }): Promise<SocialCallbackResult> {
    const provider = this.requireProvider(params.provider);

    // Trước khi tiêu thụ `state` thì chưa biết `next`, nên lỗi ở đây buộc phải về trang chủ.
    const stored = await this.states.consume(params.state);
    const { redirectNext } = stored;

    try {
      // `state` phát cho Google mà quay về ở callback của Facebook là dấu hiệu bị ghép URL bằng
      // tay. Không có luồng hợp lệ nào tạo ra tình huống này.
      if (stored.provider !== params.provider) {
        throw new SocialAuthFailure(
          API_ERROR_CODE.SOCIAL_STATE_INVALID,
          `state thuộc provider ${stored.provider}, callback lại là ${params.provider}`,
        );
      }

      const identity = await provider.exchange({
        code: params.code,
        codeVerifier: stored.codeVerifier,
        nonce: stored.nonce,
        redirectUri: this.redirectUri(params.provider),
      });

      const { userId } = await this.auth.upsertUserFromIdentity(identity);
      return { ok: true, userId, redirectNext };
    } catch (error) {
      // Bắt ở ĐÂY chứ không ở controller: đây là chỗ cuối cùng còn cầm `redirectNext`.
      this.logFailure(params.provider, error);
      return { ok: false, errorCode: socialErrorCode(error), redirectNext };
    }
  }

  /**
   * URL cuối cùng để đưa người dùng về web.
   *
   * Dựng từ `APP_WEB_URL` chứ không từ header `Referer` hay `Origin` của request: cả hai đều do
   * client gửi, và một `Location` dựng từ dữ liệu client là định nghĩa của open redirect.
   */
  webRedirect(next: string | null, errorCode?: string): string {
    const base = this.config.getOrThrow<string>('APP_WEB_URL').replace(/\/+$/, '');
    const path = isSafeNextPath(next) ? next : '/';
    const url = new URL(`${base}${path}`);
    if (errorCode) {
      url.searchParams.set('authError', errorCode);
      // Mở lại hộp đăng nhập ở đúng chế độ để người dùng thử tiếp ngay, không phải tự đi tìm nút.
      url.searchParams.set('auth', 'login');
    }
    return url.toString();
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
   */
  private redirectUri(provider: AuthProvider): string {
    const base = this.config.getOrThrow<string>('API_PUBLIC_URL').replace(/\/+$/, '');
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
