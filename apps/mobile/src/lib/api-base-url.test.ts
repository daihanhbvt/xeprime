import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { resolveApiBaseUrl } from './api-base-url';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: null } }));

const constantsMock = Constants as { expoConfig: { hostUri?: string } | null };

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
