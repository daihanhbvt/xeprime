/**
 * Mật khẩu ngẫu nhiên cho tài khoản nhân viên (ADR 0087) — chủ bấm "Tạo ngẫu nhiên" thay vì nghĩ ra
 * "123456a". Đủ luật của server (≥ 8 ký tự, có chữ và số) và dễ đọc qua điện thoại: bỏ các ký tự
 * hay nhầm (`0 O o 1 l I`). Dùng chung web + app.
 *
 * Nguồn ngẫu nhiên mặc định là `crypto.getRandomValues` TOÀN CỤC — trình duyệt có sẵn, Hermes do
 * polyfill của app (expo-crypto) cấp. Package không kéo lib DOM nên đọc qua `globalThis`.
 */
const LETTERS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const LENGTH = 10;

type RandomValues = (buffer: Uint32Array) => Uint32Array;

function globalRandomValues(buffer: Uint32Array): Uint32Array {
  const cryptoApi = (globalThis as { crypto?: { getRandomValues: RandomValues } }).crypto;
  if (!cryptoApi) throw new Error('crypto.getRandomValues is not available');
  return cryptoApi.getRandomValues(buffer);
}

function pick(alphabet: string, random: number): string {
  return alphabet[random % alphabet.length]!;
}

export function generateStaffPassword(randomValues: RandomValues = globalRandomValues): string {
  const buffer = randomValues(new Uint32Array(LENGTH + 1));
  const chars: string[] = [];
  for (let i = 0; i < LENGTH; i += 1) {
    // Hai vị trí cố định chắc chắn có chữ và số; phần còn lại trộn cả hai bảng.
    const alphabet = i === 0 ? LETTERS : i === 1 ? DIGITS : LETTERS + DIGITS;
    chars.push(pick(alphabet, buffer[i]!));
  }
  // Đảo vị trí chữ số bắt buộc để mật khẩu không luôn có dạng "chữ-số-…".
  const swap = 1 + (buffer[LENGTH]! % (LENGTH - 1));
  [chars[1], chars[swap]] = [chars[swap]!, chars[1]!];
  return chars.join('');
}
