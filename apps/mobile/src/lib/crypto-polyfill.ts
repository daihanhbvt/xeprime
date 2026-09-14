import * as Crypto from 'expo-crypto';

/**
 * `crypto.getRandomValues` cho Hermes — cùng loại vá với `src/i18n/intl-polyfill.ts`.
 *
 * Hermes KHÔNG có `globalThis.crypto`, và Expo cũng không dựng nó: runtime "winter" của SDK 54
 * chỉ vá `fetch`, `FormData`, `TextDecoder` và `URL`. Thư viện nào hỏi chuẩn WebCrypto thì ở đây
 * nhận `undefined`.
 *
 * `ulid` là thư viện dính đòn này. `detectPRNG()` của nó tìm `crypto.getRandomValues`, không thấy
 * thì NÉM `ULIDError(PRNG_DETECT)` chứ không âm thầm rơi về `Math.random` — cố ý, vì một id "ngẫu
 * nhiên" yếu ở đây là hai người gửi cùng mili-giây nuốt mất tin của nhau (khoá idempotency
 * `(conversation_id, client_message_id)` sẽ coi tin thứ hai là bản gửi lại của tin thứ nhất).
 *
 * Hệ quả trước khi có file này: `newClientMessageId()` ném NGAY ở dòng đầu của `send()`, trước cả
 * lời gọi mạng — người dùng thấy "Đã có lỗi xảy ra" mà log không hề có `POST /messages` nào.
 *
 * Vá ở tầng APP chứ không ở `@xeprime/domain`: package đó phải framework-free (Metro đọc được,
 * dùng chung với web và API), nên nó không được biết `expo-crypto` tồn tại. Web và Node đã có sẵn
 * WebCrypto; chỉ native là thiếu, nên chỗ vá đúng là native.
 *
 * KHÔNG ghi đè nếu runtime đã có sẵn — một bản Hermes tương lai, hay môi trường test, có thể cung
 * cấp bản của riêng nó và bản đó luôn đúng hơn bản vá này.
 */
const existing = (globalThis as { crypto?: Partial<Crypto> }).crypto;

if (typeof existing?.getRandomValues !== 'function') {
  const patched = { ...(existing ?? {}), getRandomValues: Crypto.getRandomValues };
  Object.defineProperty(globalThis, 'crypto', {
    value: patched,
    configurable: true,
    writable: true,
  });
}
