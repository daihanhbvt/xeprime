import { ApiClientError, anonymousAuthTransport, createApiClient, getErrorCode, mobileAuthApi, type CurrentUser, type MobileLoginInput, type MobileTokenPair } from '@xeprime/api-client';
import { API_ERROR_CODE, type AuthProvider } from '@xeprime/types';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { resolveApiBaseUrl } from './api-base-url';
import { createPkcePair } from './pkce';
import { fetchWithTimeout } from './fetch-with-timeout';
import { withHttpLogging } from './fetch-with-logging';
import { logger } from './logger';
import { deleteSecureItem, getSecureItem, setSecureItem, SECURE_KEY } from './secure-storage';

/**
 * Kho token của phiên native — ADR 0017.
 *
 * Toàn bộ tri thức về "đang đăng nhập bằng gì" nằm ở file này. Phần còn lại của app không bao
 * giờ thấy một token nào: `@/lib/api-client` chỉ đưa `getFreshAccessToken` cho transport, và
 * feature chỉ gọi `signInWithPassword` / `signOut`.
 */

/** Làm mới sớm 30 giây: đồng hồ máy và server lệch nhau vài giây là chuyện thường. */
const REFRESH_SKEW_MS = 30_000;
/**
 * Đường về app sau vòng OAuth. Phải khớp deep link mà backend cấu hình, nếu không trình duyệt
 * mở ra rồi không bao giờ đóng lại — và đó là toàn bộ triệu chứng người dùng thấy được.
 */
const SOCIAL_CALLBACK_PATH = 'auth/callback';
/** Backend chặn ở 120/30/30 (`MobileDeviceDto`). Cắt ở client để tên máy dài không làm hỏng đăng nhập. */
const DEVICE_NAME_MAX = 120;
const APP_VERSION_MAX = 30;

/**
 * Client KHÔNG kèm danh tính, chỉ cho `/auth/mobile/*`.
 *
 * Ba trong bốn lời gọi đó xảy ra lúc chưa có access token (đăng nhập) hoặc access token đã hết
 * hạn (refresh). Đi qua client mặc định — cái đang cắm `bearerAuthTransport` — là tự gọi lại
 * `getFreshAccessToken` từ bên trong chính nó: một vòng lặp refresh gọi refresh.
 */
const authClient = createApiClient({
  baseUrl: resolveApiBaseUrl(),
  transport: anonymousAuthTransport(),
  // Cùng lớp log với client mặc định. Nó ghi METADATA (method, URL, status, thời gian) — cố ý
  // không ghi body hay response: body ở đây mang mật khẩu, response mang refresh token
  // (ADR 0017). Muốn xem nội dung thì dùng Flipper/Postman, đừng nới lớp log.
  fetch: withHttpLogging(fetchWithTimeout),
});

let accessToken: string | null = null;
let accessExpiresAt = 0;
let inFlightRefresh: Promise<string | null> | null = null;

const sessionEndedListeners = new Set<() => void>();

/**
 * Báo "phiên đã kết thúc" — đăng xuất, hoặc refresh token bị từ chối.
 *
 * CỐ Ý không phát theo từng lỗi 401: access token sống 15 phút nên 401 là chuyện thường ngày và
 * client tự làm mới rồi đi tiếp. Chỉ sự kiện này mới đáng để dọn cache và đá về màn đăng nhập.
 */
export function subscribeSessionEnded(listener: () => void): () => void {
  sessionEndedListeners.add(listener);
  return () => sessionEndedListeners.delete(listener);
}

/**
 * Access token còn dùng được, làm mới nếu cần. `null` = chưa đăng nhập (endpoint `@Public()`
 * vẫn phục vụ được).
 *
 * SINGLE-FLIGHT không phải tối ưu, nó là điều kiện đúng đắn: refresh token dùng MỘT lần, nên ba
 * request cùng thấy token hết hạn mà cùng gọi `/auth/mobile/refresh` thì server cho một cái
 * thắng và coi hai cái sau là replay — thu hồi cả phiên, người dùng bị đá ra dù không làm gì sai.
 */
export function getFreshAccessToken(): Promise<string | null> {
  if (accessToken && Date.now() < accessExpiresAt - REFRESH_SKEW_MS) {
    return Promise.resolve(accessToken);
  }

  inFlightRefresh ??= refreshOnce().finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}

/**
 * Server trả 401 dù token còn hạn theo đồng hồ máy → thử xoay một vòng.
 *
 * `getFreshAccessToken` chỉ biết `exp`; phiên có thể chết sớm hơn (đồng hồ máy chạy nhanh, đổi
 * mật khẩu, đăng xuất từ thiết bị khác, admin khoá). Trả `true` thì client gửi lại đúng một lần.
 */
export async function recoverFromUnauthorized(): Promise<boolean> {
  // Đang có lần xoay chạy dở thì chỉ cần đợi kết quả của nó: vô hiệu token lúc này sẽ xoá đúng
  // cái vừa được làm mới cho request khác, và ta xoay thừa một vòng.
  if (!inFlightRefresh) {
    accessToken = null;
    accessExpiresAt = 0;
  }

  // Lỗi mạng lúc refresh không phải "hết phiên" — để request gốc hỏng như một lỗi mạng.
  const token = await getFreshAccessToken().catch(() => null);
  return token !== null;
}

export async function signInWithPassword(
  identifier: string,
  password: string,
): Promise<CurrentUser> {
  const session = await mobileAuthApi.login(authClient, {
    identifier,
    password,
    device: describeDevice(),
  });
  await storeTokens(session.tokens);
  // `user` là CÙNG `MeDto` với `GET /auth/me`, kèm sẵn quyền + tenant scope đọc từ DB — app
  // không phải gọi thêm một vòng ngay sau khi đăng nhập.
  return session.user;
}

/**
 * Đăng nhập passwordless bằng SĐT + OTP.
 *
 * Mã đã được gửi trước đó qua `/auth/phone/send-otp` — endpoint DÙNG CHUNG với web, vì bước gửi
 * mã không phát phiên. Chỉ bước cuối này là của riêng native: web đổi mã lấy cookie ở
 * `/auth/phone/login`, app đổi lấy cặp Bearer (ADR 0017).
 */
export async function signInWithOtp(phone: string, code: string): Promise<CurrentUser> {
  const session = await mobileAuthApi.phoneLogin(authClient, {
    phone,
    code,
    device: describeDevice(),
  });
  await storeTokens(session.tokens);
  return session.user;
}

/**
 * Đăng nhập Google/Facebook — vòng OAuth chạy ở SERVER, app chỉ mở trình duyệt (ADR 0019).
 *
 * Trả `null` khi người dùng đóng trình duyệt giữa chừng. Huỷ KHÔNG phải lỗi: ném ra ở đây thì
 * mọi nơi gọi đều phải nhớ lọc riêng một mã lỗi để không hiện dải đỏ cho một người chỉ đổi ý.
 *
 * Bốn bước, và không bước nào chạm tới client secret hay token của provider:
 *  1. sinh PKCE — bảo vệ one-time code trên deep link, xem `lib/pkce.ts`;
 *  2. mở `/auth/social/:provider?client=native` trong `ASWebAuthenticationSession` (iOS) /
 *     Custom Tabs (Android). KHÔNG dùng `WebView`: provider chặn đăng nhập trong webview nhúng,
 *     và một webview do app điều khiển thì đọc được mật khẩu người dùng gõ;
 *  3. hệ điều hành trả lại deep link kèm `?code=` (hoặc `?error=`);
 *  4. đổi mã lấy cặp token, kèm `code_verifier` chứng minh app này chính là app đã bắt đầu.
 */
export async function signInWithSocial(
  provider: AuthProvider,
  locale: string,
): Promise<CurrentUser | null> {
  const { codeVerifier, codeChallenge } = await createPkcePair();
  const returnUrl = Linking.createURL(SOCIAL_CALLBACK_PATH);

  const authUrl = new URL(`${resolveApiBaseUrl()}/auth/social/${provider}`);
  authUrl.searchParams.set('client', 'native');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  /*
   * Backend đối chiếu giá trị này với allowlist `MOBILE_AUTH_REDIRECT_URIS` và từ chối nếu
   * không khớp — nó KHÔNG tin `redirect_uri` của client (một URI tự khai là cách one-time code
   * được giao thẳng cho kẻ tấn công).
   *
   * Hệ quả khi chạy dev: `Linking.createURL` trả `exp://<ip>:8081/--/auth/callback` trong Expo
   * dev build, khác hẳn `xeprime://auth/callback` của bản đã cài. URI dev phải được THÊM vào
   * env đó; đây là lý do đăng nhập social hỏng ngay lần chạy đầu trên máy mới.
   */
  authUrl.searchParams.set('redirect_uri', returnUrl);
  // Màn đồng ý do Google/Facebook render. Không nói ngôn ngữ ra thì người đang đọc tiếng Anh
  // nhảy sang một trang tiếng Việt ngay giữa luồng đăng nhập (ADR 0012).
  authUrl.searchParams.set('locale', locale);

  const result = await WebBrowser.openAuthSessionAsync(authUrl.toString(), returnUrl);
  if (result.type !== 'success') return null;

  const params = new URL(result.url).searchParams;
  const errorCode = params.get('error');
  if (errorCode) {
    if (errorCode === API_ERROR_CODE.SOCIAL_CANCELLED) return null;
    throw new ApiClientError({
      code: errorCode,
      message: `Social login failed: ${errorCode}`,
      status: 0,
    });
  }

  const code = params.get('code');
  if (!code) {
    throw new ApiClientError({
      code: API_ERROR_CODE.SOCIAL_STATE_INVALID,
      message: 'Social callback returned no code',
      status: 0,
    });
  }

  const session = await mobileAuthApi.exchangeSocialCode(authClient, {
    code,
    codeVerifier,
    device: describeDevice(),
  });
  await storeTokens(session.tokens);
  return session.user;
}

export async function signOut(): Promise<void> {
  const refreshToken = await getSecureItem(SECURE_KEY.REFRESH_TOKEN);

  try {
    // Chỉ xoá ở máy là để phiên sống tiếp trên server tới 60 ngày.
    if (refreshToken) await mobileAuthApi.logout(authClient, { refreshToken });
  } catch (error) {
    // Đăng xuất KHÔNG được fail: người dùng đã bấm, và giữ họ lại trong app vì mạng chập chờn
    // là tệ hơn. Nhưng đây là lỗi bảo mật thật (phiên còn sống ở server) nên nó phải vào log.
    logger.error('Không thu hồi được phiên ở server', { code: getErrorCode(error) });
  } finally {
    await endSession();
  }
}

/** Xoá sạch dấu vết phiên ở máy và báo cho `SessionBoundary`. */
async function endSession(): Promise<void> {
  accessToken = null;
  accessExpiresAt = 0;
  await deleteSecureItem(SECURE_KEY.REFRESH_TOKEN);
  for (const listener of sessionEndedListeners) listener();
}

async function storeTokens(tokens: MobileTokenPair): Promise<void> {
  accessToken = tokens.accessToken;
  accessExpiresAt = Date.now() + tokens.accessTokenExpiresIn * 1000;
  await setSecureItem(SECURE_KEY.REFRESH_TOKEN, tokens.refreshToken);
}

async function refreshOnce(): Promise<string | null> {
  const refreshToken = await getSecureItem(SECURE_KEY.REFRESH_TOKEN);
  if (!refreshToken) {
    accessToken = null;
    accessExpiresAt = 0;
    return null;
  }

  try {
    const next = await mobileAuthApi.refresh(authClient, { refreshToken });
    // Refresh XOAY vòng: không ghi đè token mới thì lần sau gửi token cũ, server coi là replay
    // và thu hồi cả phiên.
    await storeTokens(next);
    return next.accessToken;
  } catch (error) {
    // Server trả cùng một mã cho mọi lý do refresh hỏng (hết hạn / đã dùng / phiên bị thu hồi).
    // Đừng thử lại: phiên đã chết. Lỗi mạng thì giữ nguyên phiên — mạng có lúc lại lên.
    if (getErrorCode(error) === API_ERROR_CODE.SESSION_EXPIRED) await endSession();
    throw error;
  }
}

/**
 * Thông tin thiết bị CHỈ để người dùng nhận ra máy nào trong màn "thiết bị đang đăng nhập" —
 * backend không dùng nó cho bất kỳ quyết định bảo mật nào (`MobileDeviceDto`).
 */
function describeDevice(): NonNullable<MobileLoginInput['device']> {
  const deviceName = Constants.deviceName?.trim();
  const appVersion = Constants.expoConfig?.version?.trim();

  return {
    ...(deviceName ? { deviceName: deviceName.slice(0, DEVICE_NAME_MAX) } : {}),
    devicePlatform: Platform.OS,
    ...(appVersion ? { appVersion: appVersion.slice(0, APP_VERSION_MAX) } : {}),
  };
}

/** Chỉ dùng trong test: trạng thái ở đây là state của module, rò sang test khác là hỏng. */
export function resetAuthSessionForTest(): void {
  accessToken = null;
  accessExpiresAt = 0;
  inFlightRefresh = null;
  sessionEndedListeners.clear();
}
