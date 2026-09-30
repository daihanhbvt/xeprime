import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { resolveWebBaseUrl } from './web-base-url';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: null } }));

const constantsMock = Constants as { expoConfig: { hostUri?: string } | null };

afterEach(() => {
  delete process.env.EXPO_PUBLIC_WEB_URL;
});

describe('resolveWebBaseUrl', () => {
  it('dùng tên miền đã khai khi có', () => {
    constantsMock.expoConfig = { hostUri: '192.168.1.7:8081' };
    process.env.EXPO_PUBLIC_WEB_URL = 'https://xeprime.vn/';

    expect(resolveWebBaseUrl()).toBe('https://xeprime.vn');
  });

  it('suy host từ Expo dev server khi chưa khai — thiết bị thật không mở được localhost máy dev', () => {
    constantsMock.expoConfig = { hostUri: '192.168.1.7:8081' };

    expect(resolveWebBaseUrl()).toBe('http://192.168.1.7:3000');
  });

  it('đổi loopback thành 10.0.2.2 trên emulator Android', () => {
    constantsMock.expoConfig = { hostUri: 'localhost:8081' };
    jest.replaceProperty(Platform, 'OS', 'android');

    expect(resolveWebBaseUrl()).toBe('http://10.0.2.2:3000');
  });

  /**
   * Không có proxy Metro cho web (khác `EXPO_PUBLIC_API_URL`), nên một giá trị tương đối là cấu
   * hình sai chứ không phải một chế độ khác — bỏ qua nó còn mở được trang, dùng nó thì không.
   */
  it('bỏ qua giá trị tương đối và lùi về dev server', () => {
    constantsMock.expoConfig = { hostUri: '192.168.1.7:8081' };
    process.env.EXPO_PUBLIC_WEB_URL = '/web';

    expect(resolveWebBaseUrl()).toBe('http://192.168.1.7:3000');
  });
});
