import { apiDelete, apiGet, apiPost, type ApiClient } from '@xeprime/api-client';
import { APP_PROFILE } from '@/app-profile';
import type {
  ChangePasswordInput,
  CurrentUser,
  ForgotPasswordInput,
  LoginInput,
  MobileLoginInput,
  MobileLogoutInput,
  MobileRefreshInput,
  MobileRegisterInput,
  MobileAppleLoginInput,
  MobileSession,
  MobileSocialExchangeInput,
  MobileTokenPair,
  RegisterCheckInput,
  RegisterInput,
  ResetPasswordInput,
  ResetPasswordWithOtpInput,
  SetPasswordInput,
} from './types';

/**
 * Endpoint xác thực.
 *
 * Hai họ endpoint, một nguồn sự thật về quyền:
 *
 *  - `/auth/*` — WEB. Trả `MeDto`, đặt/xoá session cookie httpOnly (ADR 0002). Không bao giờ trả
 *    token trong body; cố ý.
 *  - `/auth/mobile/*` — NATIVE. Trả cặp `{ accessToken, refreshToken }` (ADR 0017). Chỉ dùng từ
 *    app native, và `refreshToken` đi thẳng vào Keychain/Keystore, không qua bất kỳ chỗ nào khác.
 *
 * Cả hai họ đều KHÔNG mang quyền/tenant trong token — `GET /auth/me` là chỗ duy nhất trả về
 * chúng, và nó đọc DB mỗi lần gọi.
 */
export const authApi = {
  /** Web: xoá session cookie. 204, không body. */
  destroySession: (): Promise<void> => apiDelete<void>('/auth/session'),
  register: (body: RegisterInput): Promise<CurrentUser> =>
    apiPost<CurrentUser>('/auth/register', body),
  login: (body: LoginInput): Promise<CurrentUser> => apiPost<CurrentUser>('/auth/login', body),
  me: (): Promise<CurrentUser> => apiGet<CurrentUser>('/auth/me'),
  setPassword: (body: SetPasswordInput): Promise<void> => apiPost<void>('/auth/password/set', body),
  /**
   * Đổi mật khẩu khi ĐÃ có mật khẩu — khác `setPassword` (đặt lần đầu cho tài khoản OTP/social).
   * Sai mật khẩu hiện tại là 400 `CURRENT_PASSWORD_INCORRECT`, không phải 401: phiên vẫn còn.
   */
  changePassword: (body: ChangePasswordInput): Promise<void> =>
    apiPost<void>('/auth/password/change', body),
  /*
   * KHÔNG gửi `clientApp` ở hai lời gọi này (06/10/2026, theo yêu cầu không đụng `apps/api`).
   *
   * DTO của develop chưa khai trường đó, và `ValidationPipe` bật `forbidNonWhitelisted`, nên gửi
   * thêm là ăn 400 `VALIDATION_FAILED` — hỏng nặng hơn chính lỗi đang có.
   *
   * ⚠️ Hai endpoint này vì vậy VẪN trả 400 `REALM_UNRESOLVED` khi gọi từ app native: không có
   * phiên, và app không đi qua site web nên không có header realm do Caddy gắn. Sửa thật nằm ở
   * `apps/api` (nhận `clientApp` rồi suy realm) — để sang một nhánh riêng.
   */
  forgotPassword: (body: ForgotPasswordInput): Promise<void> =>
    apiPost<void>('/auth/password/forgot', body),
  resetPassword: (body: ResetPasswordInput): Promise<void> =>
    apiPost<void>('/auth/password/reset', body),
  /**
   * Kiểm thông tin đăng ký TRƯỚC bước nhập mã: luật ô, app có tự đăng ký, SĐT chưa có tài khoản ở
   * app này. 204 = hợp lệ; không gửi mã, không tạo gì. `clientApp` để server suy realm.
   */
  checkRegistration: (body: Omit<RegisterCheckInput, 'clientApp'>): Promise<void> =>
    apiPost<void>('/auth/register/check', { ...body, clientApp: APP_PROFILE.clientApp }),
  /**
   * Quên mật khẩu bằng SĐT (ADR 0060): mã `password_reset` + mật khẩu mới → 204. KHÔNG cấp phiên —
   * người dùng đăng nhập lại bằng mật khẩu mới. `clientApp` để server suy realm khi request không
   * đi qua site web (khác hai hàm qua email ở trên, DTO này khai trường đó).
   */
  resetPasswordWithOtp: (body: Omit<ResetPasswordWithOtpInput, 'clientApp'>): Promise<void> =>
    apiPost<void>('/auth/password/reset-otp', { ...body, clientApp: APP_PROFILE.clientApp }),
};

/**
 * Endpoint native — tách hẳn thành object riêng, và mỗi hàm nhận `client` TƯỜNG MINH.
 *
 * Lý do không dùng client mặc định như `authApi`: ba trong bốn lời gọi này xảy ra ở lúc app CHƯA
 * có access token (đăng nhập) hoặc access token đã hết hạn (refresh). Nếu chúng đi qua client
 * mặc định — cái đang cắm `bearerAuthTransport` — thì mỗi lần refresh sẽ kéo theo một lần đọc
 * Keychain vô nghĩa, và tệ hơn: một vòng lặp refresh-gọi-refresh nếu app cài interceptor tự động.
 * Truyền client vào làm chỗ gọi phải nghĩ, đúng một lần, mình đang gọi bằng danh tính nào.
 */
export const mobileAuthApi = {
  /*
   * `clientApp` gắn Ở ĐÂY, một lần cho mọi màn đăng nhập: nó là danh tính CỦA APP
   * (`@/app-profile` — customer/partner), không phải một lựa chọn của màn hình. Server dùng nó
   * để gác phạm vi app (403 `PARTNER_ACCESS_REQUIRED`) và buộc phiên vào app (ADR 0017 mở rộng
   * 25/09/2026).
   */
  /** Đăng nhập bằng SĐT + mật khẩu — email bị server từ chối (`PHONE_LOGIN_REQUIRED`, ADR 0060). */
  login: (client: ApiClient, body: MobileLoginInput): Promise<MobileSession> =>
    client.post<MobileSession>('/auth/mobile/login', { ...body, clientApp: APP_PROFILE.clientApp }),
  /**
   * Đăng ký bằng SĐT + mật khẩu + mã OTP `register` (ADR 0060): server đối chiếu mã rồi mới tạo
   * tài khoản, nên tài khoản ra đời với SĐT ĐÃ xác minh.
   */
  register: (client: ApiClient, body: MobileRegisterInput): Promise<MobileSession> =>
    client.post<MobileSession>('/auth/mobile/register', {
      ...body,
      clientApp: APP_PROFILE.clientApp,
    }),
  /**
   * Đổi one-time code của đăng nhập mạng xã hội lấy cặp token — ADR 0019.
   *
   * Luồng đầy đủ ở phía app:
   *  1. sinh PKCE (`codeVerifier` + `codeChallenge`), GIỮ verifier trong bộ nhớ;
   *  2. mở `GET {API}/auth/social/{provider}?client=native&code_challenge=…&redirect_uri=…`
   *     bằng `expo-web-browser` (ASWebAuthenticationSession / Custom Tabs);
   *  3. nhận `?code=` ở deep link rồi gọi hàm này kèm `codeVerifier`.
   *
   * Mã sống **60 giây** và dùng **một lần** — hỏng thì bắt đầu lại từ bước 1, đừng retry cùng mã.
   */
  exchangeSocialCode: (
    client: ApiClient,
    body: MobileSocialExchangeInput,
  ): Promise<MobileSession> =>
    client.post<MobileSession>('/auth/mobile/social/exchange', {
      ...body,
      clientApp: APP_PROFILE.clientApp,
    }),
  /**
   * "Sign in with Apple" (chỉ iOS) — gửi `identityToken` iOS trả về kèm nonce THÔ; server kiểm
   * chữ ký Apple, `aud` = bundle ID của app này, và băm lại nonce để đối chiếu.
   */
  appleLogin: (client: ApiClient, body: MobileAppleLoginInput): Promise<MobileSession> =>
    client.post<MobileSession>('/auth/mobile/apple', {
      ...body,
      clientApp: APP_PROFILE.clientApp,
    }),
  /**
   * Xoay refresh token. Trả cặp MỚI; token cũ chết ngay lập tức.
   *
   * Gọi bằng client KHÔNG kèm Bearer (`anonymousAuthTransport`): access token lúc này đã hết hạn,
   * và bản thân refresh token trong body mới là bằng chứng.
   */
  refresh: (client: ApiClient, body: MobileRefreshInput): Promise<MobileTokenPair> =>
    client.post<MobileTokenPair>('/auth/mobile/refresh', body),
  /** Thu hồi phiên của thiết bị này. 204, không body. */
  logout: (client: ApiClient, body: MobileLogoutInput): Promise<void> =>
    client.post<void>('/auth/mobile/logout', body),
};
