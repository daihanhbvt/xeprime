import { randomInt } from 'node:crypto';
import {
  REFERENCE_CODE_ALPHABET,
  REFERENCE_CODE_BODY_LENGTH,
  REFERENCE_CODE_PREFIX,
  type BankMatchTargetType,
} from '@xeprime/types';

/**
 * Sinh mã đối soát chuyển khoản từ WORKER — bản sao 6 dòng của
 * `apps/api/src/common/reference-code.ts`, cùng lý do `lib/notify.ts` không kéo service của api
 * vào worker. Mọi thứ có thể trôi (tiền tố, bảng chữ, độ dài) đều lấy từ `@xeprime/types`;
 * unique index của DB vẫn là người gác thật.
 */
export function newReferenceCode(target: BankMatchTargetType): string {
  let body = '';
  for (let i = 0; i < REFERENCE_CODE_BODY_LENGTH; i += 1) {
    body += REFERENCE_CODE_ALPHABET[randomInt(REFERENCE_CODE_ALPHABET.length)];
  }
  return `${REFERENCE_CODE_PREFIX[target]}${body}`;
}
