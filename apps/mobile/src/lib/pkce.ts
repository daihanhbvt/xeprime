import * as Crypto from 'expo-crypto';

/**
 * PKCE cho chặng APP ↔ BACKEND của đăng nhập mạng xã hội — ADR 0019 §"Chỗ cắm cho app native".
 *
 * Đây là vòng PKCE THỨ HAI, lồng bên trong vòng backend ↔ Google/Facebook, và nó bảo vệ một thứ
 * khác hẳn: one-time code mà backend trả về qua **deep link**. Trên Android một custom scheme
 * không độc quyền — app bất kỳ khai cùng `xeprime://` cũng nhận được deep link đó — nên mã ấy
 * phải vô dụng nếu thiếu `code_verifier`, thứ chỉ sống trong bộ nhớ của app thật.
 *
 * `code_verifier` KHÔNG được ghi ra đâu cả (Keychain, AsyncStorage, log): nó sống đúng vài giây
 * giữa lúc mở trình duyệt và lúc đổi mã. Ghi nó xuống đĩa là tự tạo ra thứ để đánh cắp.
 */

/**
 * 64 ký tự unreserved của RFC 7636 (`[A-Za-z0-9-._~]` lấy 64 cái đầu).
 *
 * Đúng 64 nên `byte % 64` chia hết 256 — không có modulo bias. Bảng 62 hay 66 ký tự thì vài ký
 * tự sẽ xuất hiện nhiều hơn phần còn lại, và entropy thật thấp hơn con số ta tưởng.
 */
const UNRESERVED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** 43 ký tự — độ dài tối thiểu RFC 7636 cho phép, tương đương 256 bit entropy. */
const VERIFIER_LENGTH = 43;

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

/**
 * Sinh cặp verifier/challenge (S256).
 *
 * Dựng verifier bằng cách ánh xạ byte ngẫu nhiên sang bảng unreserved, KHÔNG phải base64url hoá
 * chúng: React Native không có `btoa`/`Buffer` sẵn ở mọi runtime, nên bản base64 tự viết là một
 * chỗ để sai lặng lẽ (padding, ký tự `+/`) mà chỉ lộ ra khi provider từ chối.
 */
export async function createPkcePair(): Promise<PkcePair> {
  const bytes = Crypto.getRandomValues(new Uint8Array(VERIFIER_LENGTH));
  let codeVerifier = '';
  for (const byte of bytes) codeVerifier += UNRESERVED[byte % UNRESERVED.length];

  const base64 = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    codeVerifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );

  return { codeVerifier, codeChallenge: toBase64Url(base64) };
}

/** base64 tiêu chuẩn → base64url. Chuỗi đi trong query string nên `+`, `/`, `=` phải biến mất. */
function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
