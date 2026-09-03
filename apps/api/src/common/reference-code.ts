import { randomInt } from 'node:crypto';
import {
  REFERENCE_CODE_ALPHABET,
  REFERENCE_CODE_BODY_LENGTH,
  REFERENCE_CODE_PREFIX,
  type BankMatchTargetType,
} from '@xeprime/types';

/**
 * Sinh mã đối soát chuyển khoản: tiền tố theo LOẠI ĐÍCH (`XPG` gói / `XPH` giữ chỗ — ADR 0022
 * điều 3) + 8 ký tự từ bảng chữ đã bỏ `0/O/1/I` (ADR 0016 điều 5 — người đọc lại mã từ màn
 * hình ngân hàng sẽ nhầm, và một ký tự sai là một khoản tiền không khớp được).
 *
 * Mã phải UNIQUE TOÀN SÀN — unique index ở DB là người gác thật; caller bắt P2002 và gọi lại
 * (32^8 ≈ 1.1 nghìn tỷ tổ hợp nên đụng nhau gần như không xảy ra, retry chỉ là dây an toàn).
 *
 * `randomInt` của node:crypto, không phải `Math.random()`: mã in lên lệnh chuyển tiền thật.
 */
export function newReferenceCode(target: BankMatchTargetType): string {
  let body = '';
  for (let i = 0; i < REFERENCE_CODE_BODY_LENGTH; i += 1) {
    body += REFERENCE_CODE_ALPHABET[randomInt(REFERENCE_CODE_ALPHABET.length)];
  }
  return `${REFERENCE_CODE_PREFIX[target]}${body}`;
}
