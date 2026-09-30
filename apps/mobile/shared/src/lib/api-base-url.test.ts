import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { resolveApiBaseUrl } from './api-base-url';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: null } }));

const constantsMock = Constants as { expoConfig: { hostUri?: string } | null };

afterEach(() => {
  delete process.env.EXPO_PUBLIC_API_URL;
  delete (globalThis as { location?: Location }).location;
});

describe('resolveApiBaseUrl', () => {
  it('suy host từ Expo dev server để thiết bị thật gọi được máy dev', () => {
    constantsMock.expoConfig = { hostUri: '192.168.1.7:8081' };
    expect(resolveApiBaseUrl()).toBe('http://192.168.1.7:4000');
  });

  it('lùi về localhost khi không chạy qua dev server', () => {
    constantsMock.expoConfig = null;
    expect(resolveApiBaseUrl()).toBe('http://localhost:4000');
  });

  it('đổi loopback thành 10.0.2.2 trên emulator Android — localhost ở đó là chính máy ảo', () => {
    constantsMock.expoConfig = { hostUri: 'localhost:8081' };
    jest.replaceProperty(Platform, 'OS', 'android');

    expect(resolveApiBaseUrl()).toBe('http://10.0.2.2:4000');
  });

  it('giữ nguyên IP LAN trên Android (thiết bị thật, không phải emulator)', () => {
    constantsMock.expoConfig = { hostUri: '192.168.1.183:8081' };
    jest.replaceProperty(Platform, 'OS', 'android');

    expect(resolveApiBaseUrl()).toBe('http://192.168.1.183:4000');
  });
});

/**
 * Giá trị dạng đường dẫn = proxy dev của Metro sang staging
 * (`scripts/stg-proxy-middleware.js`). MỘT giá trị phải chạy đúng ở cả ba nền tảng, nếu không
 * mỗi lần đổi máy lại phải sửa `.env`.
 */
describe('resolveApiBaseUrl — EXPO_PUBLIC_API_URL dạng đường dẫn', () => {
  it('web ghép vào origin của trang: trang đang mở CHÍNH LÀ Metro, và chỉ nó bảo đảm same-origin', () => {
    process.env.EXPO_PUBLIC_API_URL = '/api/stg';
    constantsMock.expoConfig = { hostUri: '192.168.1.183:8081' };
    jest.replaceProperty(Platform, 'OS', 'web');
    // Môi trường jest của app native KHÔNG có sẵn `location` (đó là môi trường RN, không phải
    // trình duyệt), nên gán thẳng rồi dọn ở `afterEach` — `jest.replaceProperty` chỉ thay được
    // thuộc tính đã tồn tại.
    (globalThis as { location?: Location }).location = {
      origin: 'http://localhost:8081',
    } as Location;

    expect(resolveApiBaseUrl()).toBe('http://localhost:8081/api/stg');
  });

  it('native ghép vào host:port của Metro — thiết bị thật đi qua đúng dev server đang phục vụ nó', () => {
    process.env.EXPO_PUBLIC_API_URL = '/api/stg';
    constantsMock.expoConfig = { hostUri: '192.168.1.183:8081' };
    jest.replaceProperty(Platform, 'OS', 'ios');

    expect(resolveApiBaseUrl()).toBe('http://192.168.1.183:8081/api/stg');
  });

  it('emulator Android vẫn đổi loopback thành 10.0.2.2 ở chế độ proxy', () => {
    process.env.EXPO_PUBLIC_API_URL = '/api/stg/';
    constantsMock.expoConfig = { hostUri: 'localhost:8081' };
    jest.replaceProperty(Platform, 'OS', 'android');

    expect(resolveApiBaseUrl()).toBe('http://10.0.2.2:8081/api/stg');
  });

  it('URL tuyệt đối vẫn được dùng nguyên vẹn — native gọi thẳng staging không vướng CORS', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api-stg.xeprime.vn/';
    constantsMock.expoConfig = { hostUri: 'localhost:8081' };

    expect(resolveApiBaseUrl()).toBe('https://api-stg.xeprime.vn');
  });
});
