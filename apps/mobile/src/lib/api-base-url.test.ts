import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { resolveApiBaseUrl } from './api-base-url';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: null, expoGoConfig: null, experienceUrl: '', linkingUri: '' },
}));

interface ConstantsShape {
  expoConfig: { hostUri?: string } | null;
  expoGoConfig: { debuggerHost?: string } | null;
  experienceUrl: string;
  linkingUri: string;
}

const constantsMock = Constants as unknown as ConstantsShape;

beforeEach(() => {
  constantsMock.expoConfig = null;
  constantsMock.expoGoConfig = null;
  constantsMock.experienceUrl = '';
  constantsMock.linkingUri = '';
});

describe('resolveApiBaseUrl', () => {
  it('suy host từ Expo dev server để thiết bị thật gọi được máy dev', () => {
    constantsMock.expoConfig = { hostUri: '192.168.1.7:8081' };
    expect(resolveApiBaseUrl()).toBe('http://192.168.1.7:4000');
  });

  it('giữ nguyên IP LAN trên Android — máy thật KHÔNG được đổi sang 10.0.2.2', () => {
    constantsMock.expoConfig = { hostUri: '192.168.1.183:8081' };
    jest.replaceProperty(Platform, 'OS', 'android');

    expect(resolveApiBaseUrl()).toBe('http://192.168.1.183:4000');
  });

  /**
   * Bản Expo Go cũ hơn SDK của dự án không điền `hostUri`. Chỉ đọc một nguồn thì tất cả rơi về
   * loopback → `10.0.2.2` → mọi request treo trên máy thật, trông y hệt server chết.
   */
  describe('khi hostUri không có, dò tiếp các nguồn khác', () => {
    it('đọc từ expoGoConfig.debuggerHost', () => {
      constantsMock.expoGoConfig = { debuggerHost: '192.168.1.50:8081' };
      expect(resolveApiBaseUrl()).toBe('http://192.168.1.50:4000');
    });

    it('đọc từ experienceUrl dạng exp://', () => {
      constantsMock.experienceUrl = 'exp://192.168.1.99:8081';
      expect(resolveApiBaseUrl()).toBe('http://192.168.1.99:4000');
    });

    it('đọc từ linkingUri', () => {
      constantsMock.linkingUri = 'exp://192.168.1.7:8081/--/';
      expect(resolveApiBaseUrl()).toBe('http://192.168.1.7:4000');
    });

    it('bỏ qua nguồn loopback để lấy nguồn có IP thật', () => {
      constantsMock.expoConfig = { hostUri: 'localhost:8081' };
      constantsMock.experienceUrl = 'exp://192.168.1.183:8081';

      expect(resolveApiBaseUrl()).toBe('http://192.168.1.183:4000');
    });
  });

  describe('không đọc được nguồn nào', () => {
    it('Android lùi về 10.0.2.2 — đúng cho emulator', () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      expect(resolveApiBaseUrl()).toBe('http://10.0.2.2:4000');
    });

    it('iOS lùi về localhost', () => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      expect(resolveApiBaseUrl()).toBe('http://localhost:4000');
    });
  });

  it('EXPO_PUBLIC_API_URL thắng mọi thứ và bị cắt dấu / cuối', () => {
    constantsMock.expoConfig = { hostUri: '192.168.1.7:8081' };
    process.env.EXPO_PUBLIC_API_URL = 'http://10.0.0.5:4000/';

    expect(resolveApiBaseUrl()).toBe('http://10.0.0.5:4000');

    delete process.env.EXPO_PUBLIC_API_URL;
  });
});
