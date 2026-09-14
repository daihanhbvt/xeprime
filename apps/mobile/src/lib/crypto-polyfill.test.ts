import * as Crypto from 'expo-crypto';
import { newClientMessageId } from '@xeprime/domain';

jest.mock('expo-crypto', () => ({
  // Bản thật gọi xuống native; ở đây chỉ cần một nguồn byte để ULID chạy được.
  getRandomValues: jest.fn((array: Uint8Array) => {
    for (let i = 0; i < array.length; i += 1) array[i] = Math.floor(Math.random() * 256);
    return array;
  }),
}));

/**
 * Hermes KHÔNG có `crypto.getRandomValues`, còn Node của Jest thì CÓ — nên bug này không bao giờ
 * tự lộ ra trong test. Ở đây ta dựng lại đúng môi trường đó: gỡ `crypto` khỏi global rồi mới nạp
 * bản vá, và kiểm rằng sinh id vẫn chạy.
 *
 * Bất biến được khoá: `newClientMessageId()` KHÔNG ĐƯỢC ném. Nó là dòng đầu tiên của `send()` ở
 * `use-thread.ts` — ném ở đó nghĩa là không một tin nhắn nào rời khỏi máy, và log không có lấy
 * một `POST /messages` để mà lần ra.
 */
describe('crypto-polyfill', () => {
  const real = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

  afterEach(() => {
    jest.resetModules();
    if (real) Object.defineProperty(globalThis, 'crypto', real);
  });

  /** Nạp LẠI module mỗi lần: bản vá chạy đúng một lần lúc nạp, và ta cần nó chạy sau khi đã gỡ crypto. */
  function requirePolyfill(): void {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- nạp lại có chủ đích.
      require('./crypto-polyfill');
    });
  }

  it('runtime KHÔNG có crypto: bản vá dựng lại và ULID vẫn sinh được', () => {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    expect(() => newClientMessageId()).toThrow();

    requirePolyfill();

    const id = newClientMessageId();
    expect(id).toHaveLength(26);
    // Crockford base32 — bảng chữ của ULID, cố ý bỏ I/L/O/U.
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    // Phần ngẫu nhiên đến TỪ expo-crypto, không phải Math.random.
    expect(Crypto.getRandomValues).toHaveBeenCalled();
  });

  /** Runtime tự có bản của nó thì bản vá đứng yên — bản gốc luôn đúng hơn. */
  it('runtime ĐÃ có crypto thì KHÔNG ghi đè', () => {
    const mine = jest.fn((array: Uint8Array) => array);
    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues: mine },
      configurable: true,
    });

    requirePolyfill();

    expect(globalThis.crypto.getRandomValues).toBe(mine);
  });
});
