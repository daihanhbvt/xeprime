import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Cổng mặc định của Metro — chỉ dùng khi `hostUri` không nói cổng (hiếm, nhưng có). */
const DEFAULT_DEV_SERVER_PORT = 8081;
/** Emulator Android không dùng chung loopback với máy dev — 10.0.2.2 mới trỏ về host. */
const ANDROID_EMULATOR_HOST = '10.0.2.2';

/**
 * Máy dev đang chạy Metro, NHÌN TỪ thiết bị đang chạy app.
 *
 * Tách khỏi `api-base-url.ts` khi màn văn bản pháp lý cần suy ra địa chỉ của bản WEB theo đúng
 * cách: cả hai dịch vụ (API 4000, web 3000) đều chạy trên chính máy đó, và chỉ có MỘT câu trả
 * lời đúng cho "host nào" — thiết bị thật không gọi được `localhost` của máy dev, còn emulator
 * Android thì `localhost` lại là chính máy ảo. Chép phép suy này lần thứ hai là mở đường cho
 * hai lib lệch nhau đúng ở chỗ khó thấy nhất.
 */
export function devServerHost(): string {
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
export function devServerOrigin(): string {
  if (Platform.OS === 'web') {
    const origin = globalThis.location?.origin;
    if (origin) return origin;
  }

  const [, port] = (Constants.expoConfig?.hostUri ?? '').split(':');

  return `http://${devServerHost()}:${port || DEFAULT_DEV_SERVER_PORT}`;
}
