import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BILLING_MODE, BILLING_PHASE, TENANT_ROLE } from '@xeprime/types';

import { MarketFooter } from './MarketFooter';

/**
 * Chân trang khu khách — nằm trên MỌI trang công khai, nên một mục sai ở đây nhân lên khắp sản
 * phẩm. Hai điều được khoá ở đây, và cả hai đều là thứ mắt không bắt được khi xem trang:
 *
 *  1. **Lời mời "Đăng xe cho thuê" biến mất với người ĐÃ cho thuê xe.** Nhánh này chỉ chạy ở
 *     client sau khi `/auth/me` trả lời, nên mở trình duyệt bằng tài khoản khách sẽ không bao
 *     giờ thấy nó — chỉ có test mới đi qua được cả hai nhánh.
 *  2. **Không mục nào trỏ vào hư không.** `constants/legal.test.ts` khoá phần dữ liệu; ở đây
 *     khoá phần đã RENDER, tức là cả những liên kết dựng thẳng trong JSX.
 */
const state = vi.hoisted(() => ({ user: undefined as unknown, pathname: '/' }));

/** Gian hàng tuyến gói — `/auth/me` trả về hình dạng này cho một tài khoản đã có gian hàng. */
function shopUser() {
  return {
    id: 'U9',
    displayName: 'XePrime Sài Gòn',
    tenant: {
      id: 'T1',
      roleKey: TENANT_ROLE.SHOP_OWNER,
      billingMode: BILLING_MODE.PACKAGE,
      billingPhase: BILLING_PHASE.CURRENT,
    },
  };
}

/** Chủ xe TUYẾN HOA HỒNG — cũng là chủ xe, dù không vào được cổng quản lý (ADR 0027/0028). */
function commissionOwner() {
  return {
    id: 'U8',
    displayName: 'Anh Ba',
    tenant: {
      id: 'T2',
      roleKey: TENANT_ROLE.SHOP_OWNER,
      billingMode: BILLING_MODE.COMMISSION,
      publicVehicleCount: 2,
    },
  };
}

vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: state.user }) }));

vi.mock('@/i18n/actions', () => ({ setLocale: vi.fn().mockResolvedValue({ ok: true }) }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  // Thanh điều hướng và chân trang đánh dấu mục ĐANG XEM từ pathname (`isActivePath`).
  usePathname: () => state.pathname,
}));

beforeEach(() => {
  state.user = undefined;
  state.pathname = '/';
});

afterEach(cleanup);

describe('MarketFooter — lời mời đăng xe', () => {
  it('khách CHƯA đăng nhập thấy lời mời đăng xe cho thuê', () => {
    render(<MarketFooter />);
    expect(screen.getByRole('link', { name: /Đăng xe cho thuê/ }).getAttribute('href')).toBe(
      '/list-your-vehicle',
    );
  });

  /**
   * Người đã có gian hàng không cần được mời làm một việc họ làm xong rồi — và nút đó dẫn tới
   * landing giới thiệu, không phải chỗ họ cần.
   */
  it('gian hàng tuyến gói KHÔNG thấy lời mời', () => {
    state.user = shopUser();
    render(<MarketFooter />);
    expect(screen.queryByRole('link', { name: /Đăng xe cho thuê/ })).toBeNull();
  });

  /**
   * Tuyến hoa hồng cũng là chủ xe. Nhánh này dễ sót vì họ KHÔNG vào cổng quản lý, nên một phép
   * kiểm kiểu `canUseManagePortal` sẽ trả `false` và mời họ đăng xe lần nữa.
   */
  it('chủ xe tuyến hoa hồng cũng KHÔNG thấy lời mời', () => {
    state.user = commissionOwner();
    render(<MarketFooter />);
    expect(screen.queryByRole('link', { name: /Đăng xe cho thuê/ })).toBeNull();
  });
});

describe('MarketFooter — điều hướng', () => {
  /**
   * Khẳng định trên TIÊU ĐỀ CỘT, không phải trên chữ bất kỳ trong chân trang.
   *
   * "Dành cho chủ xe" vẫn còn một lần nữa trong chân trang — là nhãn dẫn của dải CTA
   * (`cta.eyebrow`), và nó đúng ở đó. Một phép `queryByText` trần sẽ bắt nhầm nó và đòi gỡ một
   * dòng chữ hoàn toàn hợp lệ.
   */
  function columnTitles(container: HTMLElement) {
    return Array.from(container.querySelectorAll('summary')).map((s) => s.textContent?.trim());
  }

  it('đúng ba cột: Khám phá · XePrime · Pháp lý', () => {
    const { container } = render(<MarketFooter />);
    expect(columnTitles(container)).toEqual(['Khám phá', 'XePrime', 'Pháp lý']);
  });

  /** Cột "Dành cho chủ xe" đã gỡ (23/09/2026) — mục đầu của nó lặp đúng cái nút CTA. */
  it('không còn cột "Dành cho chủ xe" và mục "Quản lý xe"', () => {
    const { container } = render(<MarketFooter />);
    expect(columnTitles(container)).not.toContain('Dành cho chủ xe');
    expect(screen.queryByRole('link', { name: 'Quản lý xe' })).toBeNull();
  });

  it('mọi liên kết đã render đều có đích nội bộ, không có "#" hay trang chủ trống', () => {
    const { container } = render(<MarketFooter />);
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));

    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).toBeTruthy();
      expect(href).not.toBe('#');
      expect(href?.startsWith('/')).toBe(true);
    }
  });

  it('dẫn tới trang giới thiệu, trang ứng dụng và trung tâm trợ giúp', () => {
    const { container } = render(<MarketFooter />);
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));

    for (const href of ['/about', '/app', '/support']) {
      expect(hrefs).toContain(href);
    }
  });
});

describe('MarketFooter — mạng xã hội chưa có kênh thật', () => {
  /**
   * Ba biểu tượng là NHÃN, không phải liên kết. Nếu một ngày chúng thành `<a href="#">` thì đây
   * là chỗ bắt được: một vòng tròn bấm được mà không đi đâu là lời hứa hão.
   */
  it('không phải liên kết, và có tên đọc được', () => {
    render(<MarketFooter />);
    for (const name of ['Facebook', 'Instagram', 'TikTok']) {
      const el = screen.getByRole('img', { name });
      expect(el.tagName).toBe('SPAN');
      expect(el.closest('a')).toBeNull();
    }
  });
});

describe('MarketFooter — mục đang xem', () => {
  /** Đọc mục mang `aria-current="page"` — đúng thứ trình đọc màn hình dùng. */
  function currentLinks(container: HTMLElement) {
    return Array.from(container.querySelectorAll('a[aria-current="page"]')).map((a) =>
      a.textContent?.trim(),
    );
  }

  it('ở trang chủ, không mục nào trong chân trang là "đang xem"', () => {
    const { container } = render(<MarketFooter />);
    expect(currentLinks(container)).toEqual([]);
  });

  it('ở /legal/terms, đúng mục "Điều khoản sử dụng" được đánh dấu', () => {
    state.pathname = '/legal/terms';
    const { container } = render(<MarketFooter />);
    expect(currentLinks(container)).toEqual(['Điều khoản sử dụng']);
  });

  it('ở /about, đúng mục "Giới thiệu XePrime" được đánh dấu', () => {
    state.pathname = '/about';
    const { container } = render(<MarketFooter />);
    expect(currentLinks(container)).toEqual(['Giới thiệu XePrime']);
  });

  /**
   * `/app` xuất hiện HAI lần trong chân trang: một mục trong cột XePrime và tiêu đề vùng ứng
   * dụng. Cả hai phải cùng nói "đang xem" — đánh dấu một cái và bỏ cái kia là mâu thuẫn ngay
   * trên cùng một màn hình.
   */
  it('ở /app, cả mục điều hướng lẫn tiêu đề vùng ứng dụng đều được đánh dấu', () => {
    state.pathname = '/app';
    const { container } = render(<MarketFooter />);
    expect(currentLinks(container)).toEqual(['Tải ứng dụng', 'Ứng dụng XePrime']);
  });

  /**
   * Ba mục dịch vụ là `/search?serviceType=…` — cùng một pathname. Đánh dấu theo pathname sẽ
   * bật sáng CẢ BA cùng lúc; lý do không đọc query nằm ở docblock `isActivePath`.
   */
  it('ở /search, không mục dịch vụ nào bị bật sáng nhầm', () => {
    state.pathname = '/search';
    const { container } = render(<MarketFooter />);
    expect(currentLinks(container)).toEqual([]);
  });
});
