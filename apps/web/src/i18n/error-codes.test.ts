import { API_ERROR_CODE } from '@xeprime/types';
import { describe, expect, it } from 'vitest';

import enMessages from '../../messages/en';
import viMessages from '../../messages/vi';

/**
 * Mỗi mã lỗi của API phải có MỘT CÂU ở cả hai ngôn ngữ.
 *
 * `useErrorMessage()` tra theo MÃ và rơi về câu chung khi không thấy khoá. Nên một mã thiếu bản
 * dịch không làm đỏ build, không làm đỏ `i18n:check` (hai ngôn ngữ cùng thiếu thì parity vẫn
 * khớp) — nó chỉ lặng lẽ biến "Mã khuyến mãi vừa hết lượt sử dụng" thành "Đã có lỗi xảy ra",
 * đúng lúc người dùng cần biết chuyện gì vừa xảy ra. Đợt 23/09/2026 tìm thấy 23 mã như vậy.
 */

/**
 * Mã KHÔNG cần câu: `packages/types` giữ khoá để log/audit cũ đọc được, nhưng không endpoint nào
 * còn ném nó. Thêm bản dịch ở đây là thêm chuỗi chết vào bundle của cả hai ngôn ngữ.
 */
const RETIRED_CODES: Readonly<Record<string, string>> = {
  DELIVERY_QUOTE_REQUIRED: 'Nghỉ hưu ở Wave 9 — vòng báo giá giao nhận đã bị bỏ',
};

/** Mã do CHÍNH web sinh ra (không đến từ backend), nên không có mặt trong `API_ERROR_CODE`. */
const CLIENT_ONLY_CODES = ['CLIENT_NETWORK_ERROR', 'CLIENT_TIMEOUT', 'UPLOAD_FAILED'];

const SERVER_CODES = Object.values(API_ERROR_CODE).filter((code) => !(code in RETIRED_CODES));

describe('bảng câu lỗi ↔ API_ERROR_CODE', () => {
  it.each(['vi', 'en'] as const)('%s có câu cho mọi mã backend còn dùng', (locale) => {
    const bundle = locale === 'vi' ? viMessages : enMessages;
    const have = Object.keys(bundle.Errors.code);
    expect(SERVER_CODES.filter((code) => !have.includes(code))).toEqual([]);
  });

  it('không có câu thừa — mỗi khoá ứng với một mã thật hoặc một mã của chính web', () => {
    const known = new Set([...Object.values(API_ERROR_CODE), ...CLIENT_ONLY_CODES]);
    expect(Object.keys(viMessages.Errors.code).filter((code) => !known.has(code))).toEqual([]);
  });

  it('không câu nào bỏ trống', () => {
    for (const bundle of [viMessages, enMessages]) {
      const empty = Object.entries(bundle.Errors.code)
        .filter(([, value]) => String(value).trim() === '')
        .map(([code]) => code);
      expect(empty).toEqual([]);
    }
  });
});
