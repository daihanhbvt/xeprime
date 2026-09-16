import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * BA ROUTE CŨ VẪN SỐNG — dưới dạng redirect (16/09/2026).
 *
 * Đợt gộp màn Cửa hàng xoá ba mục sidebar, nhưng KHÔNG được xoá ba đường dẫn: bookmark của chủ
 * shop, link trong email thông báo và lịch sử trình duyệt đều mang chúng. Một menu sạch hơn
 * không đáng để đánh đổi bằng ba trang 404.
 *
 * Mỗi đích ở đây là một khẳng định về IA, không phải một chuỗi ngẫu nhiên:
 *
 *   /manage/subscription        → /manage/shop?section=plan   (gói là một phần của gian hàng)
 *   /manage/shop/seller-profile → /manage/shop?section=legal   (danh tính pháp lý cũng vậy)
 *   /manage/account             → /manage/security             (bảo mật là việc của CON NGƯỜI)
 *
 * Và chúng trỏ THẲNG tới đích, không qua một alias trung gian: mỗi lần chuyển hướng là một lần
 * mất tham số mà người gọi vừa gắn vào.
 */
const redirect = vi.hoisted(() =>
  vi.fn((href: string) => {
    // `redirect()` thật của Next ném một lỗi điều hướng và không bao giờ trả về. Mô phỏng đúng
    // điều đó, nếu không thì một trang quên `return` vẫn khiến test xanh.
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
);
vi.mock('next/navigation', () => ({ redirect }));

/** Chạy một trang redirect và trả về đích nó yêu cầu. */
async function targetOf(load: () => Promise<{ default: () => never }>): Promise<string> {
  const { default: Page } = await load();
  expect(() => Page()).toThrow(/^NEXT_REDIRECT:/);
  const call = redirect.mock.calls.at(-1);
  return String(call?.[0]);
}

beforeEach(() => {
  redirect.mockClear();
});

describe('Route cũ của cổng quản lý vẫn tới nơi', () => {
  it('/manage/subscription → section "Gói & hạn mức" của trang Cửa hàng', async () => {
    expect(await targetOf(() => import('./subscription/page'))).toBe('/manage/shop?section=plan');
  });

  it('/manage/shop/seller-profile → section "Địa chỉ & pháp lý"', async () => {
    expect(await targetOf(() => import('./shop/seller-profile/page'))).toBe(
      '/manage/shop?section=legal',
    );
  });

  it('/manage/account → trang Bảo mật tài khoản', async () => {
    expect(await targetOf(() => import('./account/page'))).toBe('/manage/security');
  });

  /*
   * Route này KHÔNG bị đợt gộp đụng tới, và bộ test nhắc lại điều đó: nó là redirect từ đợt
   * trước (công tắc thu cọc về làm một section của Chính sách thuê), và nó vẫn mang theo hash
   * để người đã bookmark rơi đúng phần chứ không phải đầu trang.
   */
  it('/manage/shop/payment-settings vẫn về đúng phần trong Chính sách thuê', async () => {
    expect(await targetOf(() => import('./shop/payment-settings/page'))).toBe(
      '/manage/shop/policies#deposit-collection',
    );
  });
});

/**
 * NỬA CÒN LẠI của mọi lần thu hẹp: những gì KHÔNG được đụng tới.
 *
 * `/manage/account` thành redirect, nhưng route CON của nó thì không — Next khớp route con
 * trước, và `/manage/account/trips` là lối duy nhất tới chuyến ĐI THUÊ cũ của người vừa nâng
 * tuyến. Biến nó thành redirect là giấu mất tiền hoàn và nghĩa vụ của chính họ (ADR 0038 điều 7).
 */
describe('Route con của /manage/account KHÔNG bị nuốt theo', () => {
  it('/manage/account/trips vẫn là trang thật, không phải redirect', async () => {
    const mod = await import('./account/trips/page');

    expect(typeof mod.default).toBe('function');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('/manage/account/trips/[id] vẫn là trang thật — deep link trong email không được chết', async () => {
    const mod = await import('./account/trips/[id]/page');

    expect(typeof mod.default).toBe('function');
    expect(redirect).not.toHaveBeenCalled();
  });
});
