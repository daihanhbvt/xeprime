import { API_ERROR_CODE, AUTH_PROVIDER, type AuthProvider } from '@xeprime/types';
import type { VerifiedIdentity } from './identity';
import { SocialAuthFailure } from './social-auth.error';
import {
  fetchProviderJson,
  requireString,
  SocialProvider,
  type AuthorizeParams,
  type ExchangeParams,
} from './social-provider';

const AUTHORIZE_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** Google phát `iss` theo hai dạng, cả hai đều hợp lệ. */
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

/**
 * Chỉ ba scope cơ bản. Cố ý KHÔNG xin gì hơn: Google phân loại `openid email profile` là scope
 * không nhạy cảm, nên app không phải qua vòng thẩm định bảo mật của họ. Xin thêm một scope
 * ngoài nhóm này là đổi luôn thủ tục phát hành.
 */
const SCOPE = 'openid email profile';

/** Claim của `id_token` mà luồng này đọc tới. */
interface GoogleIdTokenClaims {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  sub?: unknown;
  nonce?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  picture?: unknown;
}

/**
 * Đăng nhập Google — OpenID Connect Authorization Code + PKCE (ADR 0019).
 *
 * Client bí mật (`client_secret`) nằm ở SERVER và chỉ được dùng ở chặng đổi token; trình duyệt
 * không bao giờ thấy nó. Đây là khác biệt gốc so với bản chạy trên Firebase trước đây, nơi toàn
 * bộ vòng OAuth diễn ra trong tab của người dùng.
 */
export class GoogleSocialProvider extends SocialProvider {
  readonly key: AuthProvider = AUTH_PROVIDER.GOOGLE;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {
    super();
  }

  authorizeUrl({ state, codeChallenge, nonce, redirectUri, locale }: AuthorizeParams): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPE,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      // Không xin refresh token: XePrime chỉ cần biết người này là ai ĐÚNG MỘT LẦN, rồi tự phát
      // phiên của mình. Giữ refresh token của Google là giữ một thứ không dùng đến mà vẫn phải bảo vệ.
      access_type: 'online',
      // Luôn hiện màn chọn tài khoản — máy dùng chung là chuyện thường ở gian hàng cho thuê xe.
      prompt: 'select_account',
      hl: locale,
    });
    return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
  }

  async exchange({
    code,
    codeVerifier,
    nonce,
    redirectUri,
  }: ExchangeParams): Promise<VerifiedIdentity> {
    const token = await fetchProviderJson(
      TOKEN_ENDPOINT,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        }).toString(),
      },
      'google/token',
    );

    return this.identityFromIdToken(requireString(token, 'id_token', 'google/token'), nonce);
  }

  /**
   * Đọc `id_token` và kiểm 5 claim, KHÔNG kiểm chữ ký. Vì sao điều đó là đủ ở đây:
   *
   *  1. Token này vừa đến thẳng từ `https://oauth2.googleapis.com/token` trong một lời gọi
   *     server↔server do CHÍNH hàm trên vừa thực hiện. Không có đường nào để một token từ nguồn
   *     khác đi vào đây — `exchange()` là chỗ gọi duy nhất, và tham số của nó là kết quả của
   *     chính lời gọi đó. OIDC Core §3.1.3.7 nói thẳng điều này: ở luồng authorization code,
   *     TLS của endpoint token THAY THẾ được việc kiểm chữ ký.
   *  2. `nonce` là chốt chặn mạnh hơn cả chữ ký cho kịch bản đáng lo nhất (token injection): nó
   *     là 16 byte ngẫu nhiên do XePrime sinh, nằm trong `oauth_states`, và không token nào lấy
   *     từ nơi khác có thể chứa nó.
   *  3. `aud` chặn token phát cho app Google khác.
   *
   * Nếu MAI SAU có ai đó cần verify một `id_token` KHÔNG do hàm này tự lấy về (ví dụ app native
   * gửi token lên), thì lập luận (1) sập và chỗ đó PHẢI kiểm chữ ký bằng JWKS của Google — đừng
   * gọi lại hàm này.
   */
  private identityFromIdToken(idToken: string, nonce: string): VerifiedIdentity {
    const claims = decodeJwtPayload(idToken);

    if (typeof claims.iss !== 'string' || !ISSUERS.has(claims.iss)) {
      throw new SocialAuthFailure(API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED, 'google/id_token: iss lạ');
    }
    if (claims.aud !== this.clientId) {
      throw new SocialAuthFailure(
        API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED,
        'google/id_token: aud không phải client của XePrime',
      );
    }
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) {
      throw new SocialAuthFailure(
        API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED,
        'google/id_token: đã hết hạn',
      );
    }
    // Buộc token này thuộc về ĐÚNG lần bấm nút đã phát ra nó (chống replay).
    if (claims.nonce !== nonce) {
      throw new SocialAuthFailure(
        API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED,
        'google/id_token: nonce lệch',
      );
    }
    if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
      throw new SocialAuthFailure(
        API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED,
        'google/id_token: thiếu sub',
      );
    }

    const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';

    return {
      providerUserId: claims.sub,
      provider: AUTH_PROVIDER.GOOGLE,
      email: email.length > 0 ? email : null,
      // Google nói thẳng email đã xác minh hay chưa. Đây là thứ quyết định có được tự nối vào
      // tài khoản XePrime sẵn có cùng email hay không, nên đọc đúng claim chứ không mặc định true.
      emailVerified: claims.email_verified === true,
      // Scope `profile` không bao gồm số điện thoại, và XePrime cũng không xin nó: SĐT ở đây đi
      // qua OTP (`/auth/phone/*`), là đường DUY NHẤT chứng minh được quyền sở hữu số.
      phone: null,
      displayName: typeof claims.name === 'string' ? claims.name : null,
      avatarUrl: typeof claims.picture === 'string' ? claims.picture : null,
    };
  }
}

/** Tách payload của JWS compact. Không giải mã, không kiểm chữ ký — xem docblock ở trên. */
function decodeJwtPayload(idToken: string): GoogleIdTokenClaims {
  const parts = idToken.split('.');
  if (parts.length !== 3 || !parts[1]) {
    throw new SocialAuthFailure(
      API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED,
      'google/id_token: không phải JWT ba phần',
    );
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) throw new Error('payload không phải object');
    return parsed as GoogleIdTokenClaims;
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'không rõ';
    throw new SocialAuthFailure(
      API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED,
      `google/id_token: payload hỏng (${reason})`,
    );
  }
}
