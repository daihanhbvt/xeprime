import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { logger } from './logger';

const DEFAULT_API_PORT = 4000;
/** CHỈ emulator Android mới tới được máy dev qua địa chỉ này. Máy thật thì nó không tồn tại. */
const ANDROID_EMULATOR_HOST = '10.0.2.2';

function isLoopback(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/** `192.168.1.183:8081` hoặc `exp://192.168.1.183:8081` → `192.168.1.183`. */
function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const withoutScheme = value.includes('://') ? value.slice(value.indexOf('://') + 3) : value;
  const host = withoutScheme.split('/')[0]?.split(':')[0]?.trim();
  return host ? host : null;
}

/**
 * Host của Expo dev server, dò qua nhiều nguồn.
 *
 * `expoConfig.hostUri` là nguồn chuẩn nhưng KHÔNG phải lúc nào cũng có: bản Expo Go cũ hơn SDK
 * của dự án không điền nó, và khi đó tất cả rơi về `localhost`. Ba nguồn còn lại mang cùng thông
 * tin dưới dạng khác (`exp://192.168.1.183:8081`), nên dò lần lượt thay vì tin vào một chỗ.
 */
function devServerHost(): string | null {
  const expoGo = Constants.expoGoConfig as { debuggerHost?: string } | null | undefined;

  for (const candidate of [
    Constants.expoConfig?.hostUri,
    expoGo?.debuggerHost,
    Constants.experienceUrl,
    Constants.linkingUri,
  ]) {
    const host = hostOf(candidate);
    if (host && !isLoopback(host)) return host;
  }

  return null;
}

/**
 * Gốc URL của API.
 *
 * Thiết bị THẬT không gọi được `localhost` của máy dev — `localhost` ở đó là chính điện thoại.
 * Phải dùng đúng IP LAN mà Metro đang phục vụ.
 *
 * Tên `resolve…` chứ không `get…`: `getApiBaseUrl()` nay là của `@xeprime/api-client` và trả về
 * baseUrl ĐÃ cấu hình. Hàm này là thứ TÍNH RA giá trị đem đi cấu hình, và chỉ app native có.
 */
export function resolveApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  const host = devServerHost();
  if (host) return `http://${host}:${DEFAULT_API_PORT}`;

  /*
   * Không đọc được host của dev server. Trên emulator Android thì `10.0.2.2` vẫn đúng, nhưng trên
   * MÁY THẬT nó là địa chỉ không tồn tại: gói đi vào hư không và request treo tới hết trần thời
   * gian — trông y hệt "server chết", nên phải kêu to ở đây thay vì lặng lẽ trả về một giá trị sai.
   */
  const fallback = Platform.OS === 'android' ? ANDROID_EMULATOR_HOST : 'localhost';
  logger.warn(
    `Không đọc được host của Expo dev server — tạm dùng ${fallback}. ` +
      'Đúng trên emulator, SAI trên máy thật (mọi request sẽ treo rồi timeout). ' +
      'Máy thật: đặt EXPO_PUBLIC_API_URL=http://<IP máy dev>:4000 trong apps/mobile/.env',
  );

  return `http://${fallback}:${DEFAULT_API_PORT}`;
}
