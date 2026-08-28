import Constants from 'expo-constants';
import { Platform } from 'react-native';

const DEFAULT_API_PORT = 4000;
/** Cổng mặc định của Metro — chỉ dùng khi `hostUri` không nói cổng (hiếm, nhưng có). */
const DEFAULT_DEV_SERVER_PORT = 8081;
/** Emulator Android không dùng chung loopback với máy dev — 10.0.2.2 mới trỏ về host. */
const ANDROID_EMULATOR_HOST = '10.0.2.2';

/**
 * Thiếu `EXPO_PUBLIC_API_URL` thì suy host từ Expo dev server: thiết bị thật không gọi được
 * `localhost` của máy dev, phải dùng đúng IP LAN mà Metro đang phục vụ.
 *
 * Giá trị bắt đầu bằng `/` là ĐƯỜNG DẪN TRÊN CHÍNH METRO — proxy dev sang staging
 * (`scripts/stg-proxy-middleware.js`). Một giá trị `"/api/stg"` chạy đúng ở cả ba nền tảng, và
 * đó là cách duy nhất bản WEB gọi được staging: trình duyệt chặn cross-origin, còn staging thì
 * không được phép mở CORS cho `http://localhost` (API sẽ không boot — `env.schema.ts`).
 *
 * Tên `resolve…` chứ không `get…`: `getApiBaseUrl()` nay là của `@xeprime/api-client` và trả về
 * baseUrl ĐÃ cấu hình. Hàm này là thứ TÍNH RA giá trị đem đi cấu hình, và chỉ app native có.
 */
export function resolveApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  if (configured) {
    return configured.startsWith('/') ? `${devServerOrigin()}${configured}` : configured;
  }

  return `http://${devServerHost()}:${DEFAULT_API_PORT}`;
}

/** Host của máy đang chạy Metro, nhìn từ thiết bị đang chạy app. */
function devServerHost(): string {
  const [devHost] = (Constants.expoConfig?.hostUri ?? '').split(':');
  const host = devHost || 'localhost';
  const isLoopback = host === 'localhost' || host === '127.0.0.1';

  return isLoopback && Platform.OS === 'android' ? ANDROID_EMULATOR_HOST : host;
}

/**
 * Origin đầy đủ của Metro dev server.
 *
 * Trên web KHÔNG suy từ `hostUri`: trang đang mở CHÍNH LÀ dev server, nên `location.origin` vừa
 * đúng vừa là thứ duy nhất bảo đảm same-origin — cùng một máy có thể vào bằng `localhost`,
 * `127.0.0.1` hay IP LAN, và ba cái đó là ba origin khác nhau với trình duyệt.
 */
function devServerOrigin(): string {
  if (Platform.OS === 'web') {
    const origin = globalThis.location?.origin;
    if (origin) return origin;
  }

  const [, port] = (Constants.expoConfig?.hostUri ?? '').split(':');

  return `http://${devServerHost()}:${port || DEFAULT_DEV_SERVER_PORT}`;
}
