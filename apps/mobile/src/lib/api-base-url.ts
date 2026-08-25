import Constants from 'expo-constants';
import { Platform } from 'react-native';

const DEFAULT_API_PORT = 4000;
/** Emulator Android không dùng chung loopback với máy dev — 10.0.2.2 mới trỏ về host. */
const ANDROID_EMULATOR_HOST = '10.0.2.2';

/**
 * Thiếu `EXPO_PUBLIC_API_URL` thì suy host từ Expo dev server: thiết bị thật không gọi được
 * `localhost` của máy dev, phải dùng đúng IP LAN mà Metro đang phục vụ.
 *
 * Tên `resolve…` chứ không `get…`: `getApiBaseUrl()` nay là của `@xeprime/api-client` và trả về
 * baseUrl ĐÃ cấu hình. Hàm này là thứ TÍNH RA giá trị đem đi cấu hình, và chỉ app native có.
 */
export function resolveApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  const [devHost] = (Constants.expoConfig?.hostUri ?? '').split(':');
  const host = devHost || 'localhost';
  const isLoopback = host === 'localhost' || host === '127.0.0.1';
  const target = isLoopback && Platform.OS === 'android' ? ANDROID_EMULATOR_HOST : host;

  return `http://${target}:${DEFAULT_API_PORT}`;
}
