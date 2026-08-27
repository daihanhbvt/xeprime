import { createHash } from 'node:crypto';
import { createPkcePair } from './pkce';

/**
 * `expo-crypto` là native module — trên Node nó không có gì để gọi. Bản thay thế dùng CHÍNH
 * `node:crypto`, nên test kiểm được giá trị thật (SHA-256 đúng, base64url đúng) chứ không chỉ
 * kiểm rằng ta có gọi hàm.
 */
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

describe('createPkcePair', () => {
  it('sinh verifier đúng khuôn RFC 7636', async () => {
    const { codeVerifier } = await createPkcePair();

    expect(codeVerifier).toHaveLength(43);
    // Ký tự ngoài tập unreserved sẽ bị provider từ chối ở bước đổi token, tức hỏng ở chặng
    // cuối cùng — nơi khó lần ngược nhất.
    expect(codeVerifier).toMatch(/^[A-Za-z0-9\-_]{43}$/);
  });

  it('challenge là base64url của SHA-256(verifier), không phải base64 thường', async () => {
    const { codeVerifier, codeChallenge } = await createPkcePair();

    const expected = createHash('sha256')
      .update(codeVerifier, 'utf8')
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(codeChallenge).toBe(expected);
    // `+`, `/`, `=` đi qua query string sẽ bị hiểu sai — đây là lỗi im lặng cho tới lúc
    // backend so challenge với verifier và thấy lệch.
    expect(codeChallenge).not.toMatch(/[+/=]/);
  });

  it('mỗi lần gọi là một cặp khác nhau', async () => {
    const [first, second] = await Promise.all([createPkcePair(), createPkcePair()]);

    expect(first.codeVerifier).not.toBe(second.codeVerifier);
    expect(first.codeChallenge).not.toBe(second.codeChallenge);
  });
});
