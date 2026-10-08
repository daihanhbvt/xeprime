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
 *   /manage/shop/seller-profile → /manage/shop?section=legal   (danh tính pháp lý là phần của gian hàng)
 *
 * Hai route từng ở đây thôi là redirect từ ADR 0051/0053 (khẳng định ở cuối file):
 *   /manage/subscription — MỘT URL hai tuyến: tuyến gói được `PartnerTrackView` chuyển vào section
 *                          "Gói & hạn mức", tuyến hoa hồng thấy phễu nâng cấp;
 *   /manage/account      — hồ sơ cá nhân của tài khoản đối tác (tài khoản RIÊNG của site partner).
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
  /*
   * Đích đổi ngày 07/10/2026: "Hồ sơ người bán" về section "Thông tin khai thuế", không còn về
   * "Địa chỉ & pháp lý". Section cũ chỉ có ô MST của `tenant_profiles` — một bản sao mà không
   * phép tính thuế nào đọc, và nó đã được gỡ.
   */
  it('/manage/shop/seller-profile → section "Thông tin khai thuế"', async () => {
    expect(await targetOf(() => import('./shop/seller-profile/page'))).toBe(
      '/manage/shop?section=tax',
    );
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

  /*
   * 05/10/2026: "Bảo mật tài khoản" gộp vào trang Tài khoản & bảo mật. Bookmark cũ rơi thẳng vào
   * section "Thông tin đăng nhập" — phần gần nhất với điều người bấm "Bảo mật" đi tìm.
   */
  it('/manage/security → section "Thông tin đăng nhập" của trang Tài khoản & bảo mật', async () => {
    expect(await targetOf(() => import('./security/page'))).toBe('/manage/account?section=login');
  });
});

/**
 * NỬA CÒN LẠI: hai route KHÔNG còn là redirect — chúng là trang thật của site partner. Gọi chúng mà
 * ra một lệnh `redirect()` server là dựng lại đúng IA cũ (hồ sơ nằm ở site khác, gói chỉ của một tuyến).
 */
describe('Route của site partner là trang thật, không phải redirect', () => {
  it('/manage/account là trang Tài khoản & bảo mật của tài khoản đối tác', async () => {
    const mod = await import('./account/page');
    expect(typeof mod.default).toBe('function');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('/manage/subscription là trang theo tuyến', async () => {
    const mod = await import('./subscription/page');
    expect(typeof mod.default).toBe('function');
    expect(redirect).not.toHaveBeenCalled();
  });
});
