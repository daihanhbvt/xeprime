import { createHash, generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import {
  API_ERROR_CODE,
  MOBILE_APP_BUNDLE_ID,
  MOBILE_CLIENT_APP,
  NATIVE_IDENTITY_PROVIDER,
} from '@xeprime/types';
import { AppleIdentityVerifier } from '../src/modules/auth/social/apple-identity.verifier';
import { SocialAuthFailure } from '../src/modules/auth/social/social-auth.error';

/**
 * "Sign in with Apple" — kiểm `identityToken` KHÔNG cần mạng: tự sinh cặp khoá RSA, giả lập bộ
 * JWKS của Apple qua `fetch`, ký token như Apple ký.
 *
 * Khoá chặt bốn điều server phải đúng (xem docblock `AppleIdentityVerifier`), đặc biệt là ranh
 * giới HAI APP: token xin cho app XePrime (khách) không được đổi thành phiên app Partner — hai
 * realm, hai tài khoản độc lập (ADR 0053).
 */

const KID = 'test-kid';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };

const RAW_NONCE = 'raw-nonce-0123456789abcdef';
const hashed = (raw: string) => createHash('sha256').update(raw).digest('hex');

function sign(claims: Record<string, unknown>, options: jwt.SignOptions = {}): string {
  return jwt.sign(
    {
      sub: '001234.abcdef.5678',
      email: 'Khach@PrivateRelay.AppleID.com',
      email_verified: 'true',
      nonce: hashed(RAW_NONCE),
      ...claims,
    },
    privateKey,
    {
      algorithm: 'RS256',
      keyid: KID,
      issuer: 'https://appleid.apple.com',
      audience: MOBILE_APP_BUNDLE_ID[MOBILE_CLIENT_APP.CUSTOMER],
      expiresIn: '10m',
      ...options,
    },
  );
}

async function failureCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SocialAuthFailure) return error.code;
    throw error;
  }
  throw new Error('verify() lẽ ra phải thất bại');
}

describe('AppleIdentityVerifier', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn(async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('token hợp lệ ⇒ định danh Apple: sub, email chữ thường, email đã xác minh, họ tên kiểu Việt', async () => {
    const verifier = new AppleIdentityVerifier();
    const identity = await verifier.verify({
      identityToken: sign({}),
      rawNonce: RAW_NONCE,
      clientApp: MOBILE_CLIENT_APP.CUSTOMER,
      fullName: { givenName: 'An', familyName: 'Nguyễn' },
    });

    expect(identity).toEqual({
      provider: NATIVE_IDENTITY_PROVIDER.APPLE,
      providerUserId: '001234.abcdef.5678',
      email: 'khach@privaterelay.appleid.com',
      emailVerified: true,
      phone: null,
      displayName: 'Nguyễn An',
      avatarUrl: null,
    });
  });

  it('token của app KHÁCH không đổi được phiên app PARTNER (aud là bundle ID của đúng app)', async () => {
    const verifier = new AppleIdentityVerifier();
    const code = await failureCode(
      verifier.verify({
        identityToken: sign({}),
        rawNonce: RAW_NONCE,
        clientApp: MOBILE_CLIENT_APP.PARTNER,
      }),
    );
    expect(code).toBe(API_ERROR_CODE.SOCIAL_TOKEN_INVALID);
  });

  it('nonce thô không khớp bản băm trong token ⇒ từ chối (token nhặt lại không dùng được)', async () => {
    const verifier = new AppleIdentityVerifier();
    const code = await failureCode(
      verifier.verify({
        identityToken: sign({}),
        rawNonce: 'nonce-khac-hoan-toan-123',
        clientApp: MOBILE_CLIENT_APP.CUSTOMER,
      }),
    );
    expect(code).toBe(API_ERROR_CODE.SOCIAL_TOKEN_INVALID);
  });

  it('token hết hạn hoặc sai issuer ⇒ từ chối', async () => {
    const verifier = new AppleIdentityVerifier();
    // `expiresIn` âm = đã hết hạn 60 giây trước (jsonwebtoken không nhận `undefined`).
    const expired = sign({}, { expiresIn: -60 });
    expect(
      await failureCode(
        verifier.verify({ identityToken: expired, rawNonce: RAW_NONCE, clientApp: 'customer' }),
      ),
    ).toBe(API_ERROR_CODE.SOCIAL_TOKEN_INVALID);

    const wrongIssuer = sign({}, { issuer: 'https://evil.example.com' });
    expect(
      await failureCode(
        verifier.verify({ identityToken: wrongIssuer, rawNonce: RAW_NONCE, clientApp: 'customer' }),
      ),
    ).toBe(API_ERROR_CODE.SOCIAL_TOKEN_INVALID);
  });

  it('chữ ký bằng khoá KHÁC (cùng kid) ⇒ từ chối', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    const forged = jwt.sign({ sub: 'x', nonce: hashed(RAW_NONCE) }, other, {
      algorithm: 'RS256',
      keyid: KID,
      issuer: 'https://appleid.apple.com',
      audience: MOBILE_APP_BUNDLE_ID[MOBILE_CLIENT_APP.CUSTOMER],
      expiresIn: '10m',
    });
    const verifier = new AppleIdentityVerifier();
    expect(
      await failureCode(
        verifier.verify({ identityToken: forged, rawNonce: RAW_NONCE, clientApp: 'customer' }),
      ),
    ).toBe(API_ERROR_CODE.SOCIAL_TOKEN_INVALID);
  });

  it('email chưa xác minh ⇒ emailVerified=false (không được tự nối vào tài khoản sẵn có)', async () => {
    const verifier = new AppleIdentityVerifier();
    const identity = await verifier.verify({
      identityToken: sign({ email_verified: false }),
      rawNonce: RAW_NONCE,
      clientApp: MOBILE_CLIENT_APP.CUSTOMER,
    });
    expect(identity.emailVerified).toBe(false);
  });

  it('Apple sập khi đã có bộ khoá cũ ⇒ dùng tiếp bộ cũ, KHÔNG gọi lại Apple ở mọi lượt sau', async () => {
    jest.useFakeTimers({ now: Date.now(), doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const verifier = new AppleIdentityVerifier();
      const login = () =>
        verifier.verify({
          identityToken: sign({}),
          rawNonce: RAW_NONCE,
          clientApp: MOBILE_CLIENT_APP.CUSTOMER,
        });
      await login(); // nạp bộ khoá lần đầu

      // Quá hạn cache (6 giờ) và Apple đang lỗi.
      jest.setSystemTime(Date.now() + 7 * 60 * 60 * 1000);
      fetchMock.mockResolvedValue(new Response('down', { status: 503 }));

      await expect(login()).resolves.toMatchObject({ providerUserId: '001234.abcdef.5678' });
      await expect(login()).resolves.toMatchObject({ providerUserId: '001234.abcdef.5678' });
      // 1 lần nạp đầu + 1 lần thử lại hỏng — lượt thứ ba KHÔNG gọi Apple nữa.
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('bộ khoá được cache — hai lượt đăng nhập chỉ gọi Apple một lần', async () => {
    const verifier = new AppleIdentityVerifier();
    for (let i = 0; i < 2; i += 1) {
      await verifier.verify({
        identityToken: sign({}),
        rawNonce: RAW_NONCE,
        clientApp: MOBILE_CLIENT_APP.CUSTOMER,
      });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
