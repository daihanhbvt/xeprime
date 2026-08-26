import { createHmac } from 'node:crypto';
import { API_ERROR_CODE, AUTH_PROVIDER, type AuthProvider } from '@xeprime/types';
import type { VerifiedIdentity } from './identity';
import { SocialAuthFailure } from './social-auth.error';
import {
  fetchProviderJson,
  optionalString,
  requireString,
  SocialProvider,
  type AuthorizeParams,
  type ExchangeParams,
} from './social-provider';

const GRAPH_VERSION = 'v21.0';
const AUTHORIZE_ENDPOINT = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;
const TOKEN_ENDPOINT = `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`;
const DEBUG_TOKEN_ENDPOINT = `https://graph.facebook.com/${GRAPH_VERSION}/debug_token`;
const ME_ENDPOINT = `https://graph.facebook.com/${GRAPH_VERSION}/me`;

const SCOPE = 'email,public_profile';

/** Facebook nhận locale dạng `xx_YY`, không phải mã hai chữ. */
const FACEBOOK_LOCALE: Readonly<Record<string, string>> = {
  vi: 'vi_VN',
  en: 'en_US',
};

/**
 * Đăng nhập Facebook — OAuth 2.0 authorization code (ADR 0019).
 *
 * **Facebook KHÔNG phải OpenID Connect.** Không có `id_token`, không có chữ ký để verify — thứ
 * nhận về chỉ là một access token đục. Nên chặng xác minh ở đây khác hẳn Google: phải HỎI LẠI
 * Facebook xem token này thuộc về app nào (`debug_token`), rồi mới dám dùng nó.
 */
export class FacebookSocialProvider extends SocialProvider {
  readonly key: AuthProvider = AUTH_PROVIDER.FACEBOOK;

  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
  ) {
    super();
  }

  authorizeUrl({ state, codeChallenge, redirectUri, locale }: AuthorizeParams): string {
    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPE,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      locale: FACEBOOK_LOCALE[locale] ?? FACEBOOK_LOCALE.en!,
    });
    return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
  }

  async exchange({ code, codeVerifier, redirectUri }: ExchangeParams): Promise<VerifiedIdentity> {
    const tokenParams = new URLSearchParams({
      client_id: this.appId,
      client_secret: this.appSecret,
      redirect_uri: redirectUri,
      code,
      code_verifier: codeVerifier,
    });
    const token = await fetchProviderJson(
      `${TOKEN_ENDPOINT}?${tokenParams.toString()}`,
      { method: 'GET' },
      'facebook/token',
    );
    const accessToken = requireString(token, 'access_token', 'facebook/token');

    await this.assertTokenBelongsToThisApp(accessToken);
    return this.readProfile(accessToken);
  }

  /**
   * Hỏi Facebook: access token này được phát cho app NÀO, và còn hợp lệ không.
   *
   * **Bỏ bước này là một lỗ hổng, không phải một tối ưu bị thiếu.** Access token của Facebook
   * trông giống nhau ở mọi app. Không kiểm `app_id` nghĩa là một token do app KHÁC phát ra —
   * app của chính kẻ tấn công, nơi họ tự nhận là bất kỳ ai — vẫn qua được cửa này và đổi lấy
   * phiên XePrime của nạn nhân. Đây là token substitution, lỗi kinh điển của việc tự làm
   * Facebook Login.
   *
   * Google không cần bước tương ứng vì `aud` của `id_token` đã nói điều đó và có chữ ký bảo vệ.
   */
  private async assertTokenBelongsToThisApp(accessToken: string): Promise<void> {
    const params = new URLSearchParams({
      input_token: accessToken,
      // App token = `{app_id}|{app_secret}`. Không phải access token của người dùng.
      access_token: `${this.appId}|${this.appSecret}`,
    });
    const body = await fetchProviderJson(
      `${DEBUG_TOKEN_ENDPOINT}?${params.toString()}`,
      { method: 'GET' },
      'facebook/debug_token',
    );

    const data = (body as { data?: unknown }).data;
    if (typeof data !== 'object' || data === null) {
      throw new SocialAuthFailure(
        API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED,
        'facebook/debug_token: thiếu "data"',
      );
    }

    const { app_id: appId, is_valid: isValid } = data as { app_id?: unknown; is_valid?: unknown };
    if (isValid !== true) {
      throw new SocialAuthFailure(
        API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED,
        'facebook/debug_token: token không còn hợp lệ',
      );
    }
    if (appId !== this.appId) {
      throw new SocialAuthFailure(
        API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED,
        'facebook/debug_token: token thuộc app khác',
      );
    }
  }

  private async readProfile(accessToken: string): Promise<VerifiedIdentity> {
    const params = new URLSearchParams({
      fields: 'id,name,email,picture.type(large)',
      access_token: accessToken,
      // Ký request bằng app secret: nếu access token rò rỉ, kẻ cầm nó vẫn không gọi được Graph
      // API thay mặt app này. Facebook khuyến nghị, và ta có sẵn secret ở server nên không có
      // lý do gì để bỏ.
      appsecret_proof: createHmac('sha256', this.appSecret).update(accessToken).digest('hex'),
    });
    const profile = await fetchProviderJson(
      `${ME_ENDPOINT}?${params.toString()}`,
      { method: 'GET' },
      'facebook/me',
    );

    const email = optionalString(profile, 'email')?.toLowerCase() ?? null;

    return {
      // ID này là **app-scoped**: cùng một người ở một app Facebook khác sẽ có ID khác. Đổi app
      // Facebook = mọi tài khoản đã nối phải nối lại.
      providerUserId: requireString(profile, 'id', 'facebook/me'),
      provider: AUTH_PROVIDER.FACEBOOK,
      email,
      /*
       * LUÔN false, kể cả khi Facebook có trả email.
       *
       * Graph API không cam kết email đó đã được xác minh. Đánh dấu true ở đây là mở đường cho
       * việc tự nối vào một tài khoản XePrime sẵn có chỉ vì trùng email — tức là một cách chiếm
       * tài khoản. `AuthService` sẽ trả CONFLICT và bảo người dùng đăng nhập bằng cách cũ, và
       * đó là hành vi đúng.
       */
      emailVerified: false,
      phone: null,
      displayName: optionalString(profile, 'name'),
      avatarUrl: readPictureUrl(profile),
    };
  }
}

/** `picture` của Graph API là object lồng: `{ data: { url } }`. */
function readPictureUrl(profile: unknown): string | null {
  const picture = (profile as { picture?: unknown }).picture;
  if (typeof picture !== 'object' || picture === null) return null;
  const data = (picture as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return null;
  const url = (data as { url?: unknown }).url;
  return typeof url === 'string' && url.length > 0 ? url : null;
}
