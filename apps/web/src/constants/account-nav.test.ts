import { describe, expect, it } from 'vitest';

import { ACCOUNT_NAV, matchAccountNavKey } from './account-nav';
import { ROUTES } from './routes';

/**
 * Menu khu tài khoản.
 *
 * Hai nhóm bất biến: **mục nào ĐƯỢC có mặt** (ADR 0014 đã loại ba mục khỏi mockup — quên lý do
 * thì chúng sẽ lặng lẽ quay lại) và **mục nào đang sáng** (một menu chỉ ra sai chỗ đứng còn tệ
 * hơn menu không đánh dấu gì).
 */

describe('ACCOUNT_NAV — thành phần', () => {
  it('mở đầu bằng hồ sơ, và hồ sơ là mục duy nhất trỏ về gốc khu tài khoản', () => {
    expect(ACCOUNT_NAV[0]?.key).toBe('profile');
    expect(ACCOUNT_NAV.filter((i) => i.href === ROUTES.ACCOUNT.ROOT)).toHaveLength(1);
  });

  it('KHÔNG có ví/ưu đãi — ADR 0013: ví giữ số dư tiền cần giấy phép trung gian thanh toán', () => {
    expect(ACCOUNT_NAV.some((i) => /wallet|vi|voucher|promo/i.test(i.key))).toBe(false);
  });

  it('KHÔNG có mục nào dẫn vào cổng quản lý — đó là việc của ShopEntryCard', () => {
    expect(ACCOUNT_NAV.some((i) => i.href.startsWith('/manage'))).toBe(false);
  });

  it('Chuyến của tôi trỏ sang route /trips có sẵn, đánh dấu external', () => {
    const trips = ACCOUNT_NAV.find((i) => i.key === 'trips');
    expect(trips?.href).toBe(ROUTES.TRIPS);
    expect(trips?.external).toBe(true);
  });

  /**
   * Bảy mục "Sắp có" đã bị gỡ ngày 03/09/2026 (R1 — ẩn menu placeholder chưa có luồng), và
   * mục Hỗ trợ được trỏ sang trang `/support` vừa dựng thật.
   *
   * Test khoá lại điều kiện chung thay vì đếm số mục: mọi mục còn lại phải dẫn tới một nơi
   * CÓ THẬT. Thêm mục mới vào menu mà quên dựng trang thì đỏ ở đây.
   */
  it('mọi mục đều dẫn tới một route đã dựng — không còn mục "Sắp có"', () => {
    const built = new Set<string>([ROUTES.ACCOUNT.ROOT, ROUTES.TRIPS, ROUTES.CHAT, ROUTES.SUPPORT]);
    for (const item of ACCOUNT_NAV) {
      expect(built.has(item.href)).toBe(true);
    }
  });

  it('Hỗ trợ trỏ ra kênh CÔNG KHAI, không phải hàng đợi ticket chưa dựng', () => {
    const support = ACCOUNT_NAV.find((i) => i.key === 'support');
    expect(support?.href).toBe(ROUTES.SUPPORT);
    expect(support?.href).not.toBe(ROUTES.ACCOUNT.SUPPORT);
    expect(support?.external).toBe(true);
  });

  it('mọi mục nằm trong /account đều là route đã khai báo ở ROUTES', () => {
    const declared = new Set<string>(Object.values(ROUTES.ACCOUNT));
    for (const item of ACCOUNT_NAV) {
      if (item.external) continue;
      expect(declared.has(item.href)).toBe(true);
    }
  });

  it('khoá của các mục là duy nhất', () => {
    expect(new Set(ACCOUNT_NAV.map((i) => i.key)).size).toBe(ACCOUNT_NAV.length);
  });
});

describe('matchAccountNavKey', () => {
  it('khớp tuyệt đối', () => {
    expect(matchAccountNavKey(ROUTES.SUPPORT)).toBe('support');
  });

  it('trang con vẫn sáng mục cha', () => {
    expect(matchAccountNavKey(`${ROUTES.TRIPS}/abc`)).toBe('trips');
  });

  it('gốc /account KHÔNG nuốt các trang con', () => {
    // Nếu khớp theo tiền tố thì mọi trang trong khu đều sáng "Tài khoản của tôi".
    expect(matchAccountNavKey(ROUTES.ACCOUNT.ROOT)).toBe('profile');
    // `/account/payments` còn route nhưng KHÔNG còn trong menu ⇒ không mục nào sáng. Đó là
    // đúng: làm sáng một mục người dùng không nhìn thấy còn khó hiểu hơn là không sáng gì.
    expect(matchAccountNavKey(ROUTES.ACCOUNT.PAYMENTS)).toBeUndefined();
  });

  it('đường dẫn ngoài khu thì không mục nào sáng', () => {
    expect(matchAccountNavKey('/search')).toBeUndefined();
  });

  it('/trips sáng mục Chuyến của tôi dù nó nằm ngoài /account', () => {
    expect(matchAccountNavKey('/trips')).toBe('trips');
    expect(matchAccountNavKey('/trips/abc')).toBe('trips');
  });
});
