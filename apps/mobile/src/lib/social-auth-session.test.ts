import { API_ERROR_CODE } from '@xeprime/types';
import * as WebBrowser from 'expo-web-browser';
import { resetAuthSessionForTest, signInWithSocial } from './auth-session';
import { getSecureItem, SECURE_KEY } from './secure-storage';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { hostUri: 'localhost:8081', version: '1.2.3' }, deviceName: 'Pixel 8' },
}));

jest.mock('expo-linking', () => ({
  createURL: (path: string) => `xeprime://${path}`,
}));

jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));

jest.mock('expo-crypto', () => {
  const nodeCrypto = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { BASE64: 'base64' },
    getRandomValues: (array: Uint8Array) => {
      nodeCrypto.randomFillSync(array);
      return array;
    },
    digestStringAsync: async (_algorithm: string, data: string) =>
      nodeCrypto.createHash('sha256').update(data, 'utf8').digest('base64'),
  };
});

const openAuthSession = WebBrowser.openAuthSessionAsync as jest.Mock;

function mockExchange(): jest.Mock {
  const fetchMock = jest.fn(async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        data: {
          tokens: {
            accessToken: 'access-social',
            accessTokenExpiresIn: 900,
            refreshToken: 'refresh-social',
            refreshTokenExpiresAt: '2026-10-25T00:00:00.000Z',
          },
          user: { id: 'u-social' },
        },
      }),
  }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => resetAuthSessionForTest());

describe('signInWithSocial', () => {
  it('mở đúng URL bắt đầu, rồi đổi one-time code lấy cặp token', async () => {
    openAuthSession.mockResolvedValue({
      type: 'success',
      url: 'xeprime://auth/callback?code=one-time-code',
    });
    const fetchMock = mockExchange();

    const user = await signInWithSocial('google', 'en');

    const [authUrl, returnUrl] = openAuthSession.mock.calls[0] as [string, string];
    const params = new URL(authUrl).searchParams;
    expect(new URL(authUrl).pathname).toBe('/auth/social/google');
    expect(params.get('client')).toBe('native');
    expect(params.get('locale')).toBe('en');
    // Backend đối chiếu `redirect_uri` với allowlist; gửi thiếu là 302 kèm mã lỗi ngay bước đầu.
    expect(params.get('redirect_uri')).toBe('xeprime://auth/callback');
    expect(returnUrl).toBe('xeprime://auth/callback');
    expect(params.get('code_challenge')).toMatch(/^[A-Za-z0-9\-_]{43}$/);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(String(url)).toContain('/auth/mobile/social/exchange');
    const body = JSON.parse(init.body) as { code: string; codeVerifier: string };
    expect(body.code).toBe('one-time-code');
    // Verifier phải là bản GỐC của challenge vừa gửi — backend băm lại và so, lệch là 401.
    expect(body.codeVerifier).toHaveLength(43);

    expect(user?.id).toBe('u-social');
    // Refresh token vào Keychain/Keystore, không đâu khác (ADR 0017).
    expect(await getSecureItem(SECURE_KEY.REFRESH_TOKEN)).toBe('refresh-social');
  });

  it('người dùng đóng trình duyệt ⇒ null, KHÔNG phải lỗi', async () => {
    openAuthSession.mockResolvedValue({ type: 'dismiss' });
    const fetchMock = mockExchange();

    await expect(signInWithSocial('facebook', 'vi')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('provider trả về huỷ ⇒ null, không dựng dải đỏ cho người chỉ đổi ý', async () => {
    openAuthSession.mockResolvedValue({
      type: 'success',
      url: `xeprime://auth/callback?error=${API_ERROR_CODE.SOCIAL_CANCELLED}`,
    });

    await expect(signInWithSocial('google', 'vi')).resolves.toBeNull();
  });

  it('deep link mang mã lỗi ⇒ ném đúng MÃ để giao diện tự dịch (ADR 0012)', async () => {
    openAuthSession.mockResolvedValue({
      type: 'success',
      url: `xeprime://auth/callback?error=${API_ERROR_CODE.SOCIAL_NOT_CONFIGURED}`,
    });

    await expect(signInWithSocial('google', 'vi')).rejects.toMatchObject({
      code: API_ERROR_CODE.SOCIAL_NOT_CONFIGURED,
    });
  });

  it('deep link không có code và không có error ⇒ coi là state hỏng', async () => {
    openAuthSession.mockResolvedValue({ type: 'success', url: 'xeprime://auth/callback' });

    await expect(signInWithSocial('google', 'vi')).rejects.toMatchObject({
      code: API_ERROR_CODE.SOCIAL_STATE_INVALID,
    });
  });
});
