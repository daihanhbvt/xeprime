import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PARTNER_PAYMENT_RETURN_PATH, PAYMENT_RETURN_TRIP_PATH } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';

/**
 * Trang quay về từ MoMo/VNPAY do SERVER dựng (`returnUrl` = site + đường dẫn ở `@xeprime/types`),
 * còn trang thật nằm ở router của web. Hai nơi lệch nhau là khách trả xong rơi vào trang 404 — test
 * này giữ đường dẫn của server trỏ vào một trang CÓ THẬT trong `app/`.
 */
const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../app');

describe('đường quay về từ cổng thanh toán', () => {
  it('tiền giữ chỗ quay về trang chi tiết chuyến của khách', () => {
    expect(ROUTES.TRIPS).toBe(PAYMENT_RETURN_TRIP_PATH);
    expect(existsSync(join(APP_DIR, `(public)${PAYMENT_RETURN_TRIP_PATH}/[id]/page.tsx`))).toBe(true);
  });

  it('hoá đơn gói quay về trang kết quả của site đối tác', () => {
    expect(
      existsSync(join(APP_DIR, `(manage)/manage${PARTNER_PAYMENT_RETURN_PATH}/page.tsx`)),
    ).toBe(true);
  });
});
