import { apiDelete, apiGet, apiPost, type ApiClient } from '../../client';
import type {
  CurrentUser,
  ForgotPasswordInput,
  LoginInput,
  MobileLoginInput,
  MobileLogoutInput,
  MobileRefreshInput,
  MobileSession,
  MobileTokenPair,
  RegisterInput,
  ResetPasswordInput,
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
  forgotPassword: (body: ForgotPasswordInput): Promise<void> =>
    apiPost<void>('/auth/password/forgot', body),
  resetPassword: (body: ResetPasswordInput): Promise<void> =>
    apiPost<void>('/auth/password/reset', body),
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
  /** Đăng nhập bằng email/SĐT + mật khẩu. */
  login: (client: ApiClient, body: MobileLoginInput): Promise<MobileSession> =>
    client.post<MobileSession>('/auth/mobile/login', body),
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
