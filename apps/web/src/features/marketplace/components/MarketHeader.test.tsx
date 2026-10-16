import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BILLING_MODE, BILLING_PHASE, TENANT_ROLE } from '@xeprime/types';

import { MarketHeader } from './MarketHeader';

/**
 * Vỏ khu khách — nằm trên MỌI trang của tuyến thuê xe, nên một lỗi tương tác ở đây nhân lên
 * khắp sản phẩm.
 *
 * Ba điều được khoá ở đây: mỗi biểu tượng góc phải là MỘT phần tử tương tác có tên đọc được;
 * các đích quen thuộc của khu khách vẫn còn; và bộ đổi ngôn ngữ KHÔNG bao giờ biến mất — nó
 * nằm trong menu tài khoản khi đã đăng nhập, và là nút riêng khi chưa.
 *
 * Bản thân biểu tượng tin nhắn có test riêng (`ChatMenu.test.tsx`).
 */
const state = vi.hoisted(() => ({
  user: { id: 'U1', displayName: 'Khách A' } as unknown,
}));

vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: state.user }) }));

vi.mock('@/features/chat/components/ChatMenu', () => ({
  ChatMenu: () => (
    <a href="/chat" aria-label="Tin nhắn">
      chat
    </a>
  ),
}));

vi.mock('@/features/auth/components/AuthModalProvider', () => ({
  useAuthModal: () => ({ open: vi.fn() }),
  useNextFromCurrentPath: () => () => '/',
}));

vi.mock('@/features/auth/hooks/use-auth-actions', () => ({
  useAuthCache: () => ({ clearAfterLogout: vi.fn() }),
}));

/*
 * Huy hiệu chat chặn ở ĐÚNG ranh giới đã chặn `ChatMenu`: nó đọc `useBadges`, thứ đòi một
 * `BadgeRealtimeProvider` ở trên cây. Bộ này kiểm hình dạng của thanh và menu, không kiểm phép
 * đếm chưa đọc — cái đó có spec riêng ở `features/chat`.
 */
vi.mock('@/features/chat/hooks/use-chat-badge', () => ({
  useChatBadge: () => ({ count: 2, href: '/chat', inbox: 'customer' }),
}));

vi.mock('@/features/notifications/components/NotificationBell', () => ({
  NotificationBell: () => <button type="button" aria-label="Thông báo" />,
}));

vi.mock('@/i18n/actions', () => ({ setLocale: vi.fn().mockResolvedValue({ ok: true }) }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  // Thanh điều hướng và chân trang đánh dấu mục ĐANG XEM từ pathname (`isActivePath`).
  usePathname: () => '/',
}));

beforeEach(() => {
  state.user = { id: 'U1', displayName: 'Khách A' };
});

afterEach(cleanup);

describe('MarketHeader', () => {
  it('mỗi biểu tượng ở góc phải đều có tên đọc được — không có nút câm', () => {
    const { container } = render(<MarketHeader />);
    const unnamed = Array.from(container.querySelectorAll('button')).filter(
      (btn) => !btn.getAttribute('aria-label') && !btn.textContent?.trim(),
    );
    expect(unnamed).toHaveLength(0);
  });

  /** Bốn mục điều hướng của design v2, đúng thứ tự và đúng đích có thật. */
  it('menu chính: Trang chủ · Tìm xe · Về XePrime · Liên hệ', () => {
    render(<MarketHeader />);
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    const links = within(nav)
      .getAllByRole('link')
      .map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['Trang chủ', '/'],
      ['Tìm xe', '/search'],
      ['Về Xe Prime', '/about'],
      ['Liên hệ', '/support'],
    ]);
  });

  it('đổi ngôn ngữ nằm TRONG menu tài khoản khi đã đăng nhập', async () => {
    render(<MarketHeader />);

    fireEvent.click(screen.getByRole('button', { name: 'Tài khoản' }));

    await waitFor(() => expect(screen.getByText('Tiếng Việt')).toBeTruthy());
    expect(screen.getByText('English')).toBeTruthy();
  });

  it('nút đổi giao diện sáng/tối hiển thị trên thanh header cho cả khách vãng lai', () => {
    state.user = null;
    render(<MarketHeader />);
    expect(screen.getByRole('button', { name: 'Đổi giao diện sáng/tối' })).toBeTruthy();
  });

  it('đổi giao diện sáng/tối có trong menu tài khoản khi đã đăng nhập', async () => {
    render(<MarketHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'Tài khoản' }));
    await waitFor(() => expect(screen.getByText('Giao diện tối')).toBeTruthy());
  });

  /**
   * Khách chưa đăng nhập: cụm "Đăng nhập/Đăng ký" mở modal tại chỗ. Đổi ngôn ngữ của họ nằm ở
   * chân trang (VI | EN) theo design v2 — `MarketFooter.test` khoá phần đó.
   */
  it('khách CHƯA đăng nhập thấy nút "Đăng nhập/Đăng ký", không có menu tài khoản', () => {
    state.user = null;
    render(<MarketHeader />);

    expect(screen.getByRole('button', { name: /^Đăng nhập\/\s*Đăng ký$/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Tài khoản' })).toBeNull();
  });
});

/**
 * Thanh của SITE KHÁCH chỉ phục vụ TÀI KHOẢN KHÁCH (ADR 0053).
 *
 * Tài khoản khách không có gian hàng; chủ xe và gian hàng làm việc ở site partner bằng tài khoản
 * riêng. Nên thanh này không còn nhánh nào theo tuyến/vai — kể cả khi `/auth/me` lỡ trả về một
 * `tenant` (dữ liệu cũ), thanh vẫn là thanh của người đi thuê, và lối duy nhất sang phía cho thuê là
 * "Trở thành chủ xe" dẫn tới trang ĐĂNG KÝ của site partner.
 */
describe('MarketHeader — chỉ của tài khoản khách', () => {
  /** Hình dạng của một tenant tuyến gói — để chứng minh thanh KHÔNG rẽ nhánh theo nó. */
  const legacyShopUser = {
    id: 'U9',
    displayName: 'XePrime Sài Gòn',
    tenant: {
      id: 'T1',
      name: 'XePrime Sài Gòn',
      roleKey: TENANT_ROLE.SHOP_OWNER,
      billingMode: BILLING_MODE.PACKAGE,
      billingPhase: BILLING_PHASE.CURRENT,
    },
  };

  async function openMenu() {
    render(<MarketHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'Tài khoản' }));
    await waitFor(() => expect(screen.getByText('Đăng xuất')).toBeTruthy());
  }

  it('khách thấy tin nhắn và chuông thông báo trên thanh', () => {
    render(<MarketHeader />);

    expect(screen.getByRole('link', { name: 'Tin nhắn' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thông báo' })).toBeTruthy();
  });

  it('không có lối "Quản lý gian hàng" nào, kể cả khi dữ liệu cũ mang tenant', () => {
    state.user = legacyShopUser;
    render(<MarketHeader />);

    expect(screen.queryByRole('link', { name: 'Quản lý gian hàng' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Thông báo' })).toBeTruthy();
  });

  it('menu tài khoản: hồ sơ, chuyến, tin nhắn và lối "Trở thành chủ xe" tới trang giới thiệu đăng xe', async () => {
    await openMenu();

    expect(screen.getByRole('link', { name: /Tài khoản của tôi/ }).getAttribute('href')).toBe(
      '/account',
    );
    expect(screen.getByRole('link', { name: /Chuyến của tôi/ }).getAttribute('href')).toBe(
      '/trips',
    );
    // Hai lối "Trở thành chủ xe" — nút trên thanh và dòng trong menu — cùng một đích.
    const ownerLinks = screen.getAllByRole('link', { name: /Trở thành chủ xe/ });
    expect(ownerLinks).toHaveLength(2);
    for (const link of ownerLinks) expect(link.getAttribute('href')).toBe('/list-your-vehicle');
    expect(screen.queryByRole('link', { name: /Xe của tôi/ })).toBeNull();
    expect(screen.queryByText('Hồ sơ gian hàng')).toBeNull();
  });

  it('không còn dấu "chủ gian hàng đã xác thực" — đó là danh tính của site partner', async () => {
    state.user = legacyShopUser;
    await openMenu();

    expect(screen.queryByRole('img', { name: 'Chủ gian hàng đã xác thực' })).toBeNull();
  });
});

/**
 * THẺ DANH TÍNH mở đầu menu tài khoản (16/09/2026).
 *
 * Với người có nhiều tài khoản (rất thường gặp từ ADR 0053: một để thuê ở site khách, một để cho
 * thuê ở site partner) thì cái tên một mình không phân biệt được, và đó chính là lúc người ta mở
 * menu này ra để kiểm tra.
 */
describe('MarketHeader — thẻ danh tính', () => {
  /** Mở menu tài khoản và đợi nó dựng xong. */
  async function openMenu() {
    render(<MarketHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'Tài khoản' }));
    await waitFor(() => expect(screen.getByText('Đăng xuất')).toBeTruthy());
  }

  it('hiện tên VÀ email — hai thứ cùng lúc mới phân biệt được tài khoản', async () => {
    state.user = { id: 'U1', displayName: 'Huỳnh Văn Tài', email: 'taih@gmail.com' };
    await openMenu();

    expect(screen.getByText('Huỳnh Văn Tài')).toBeTruthy();
    expect(screen.getByText('taih@gmail.com')).toBeTruthy();
  });

  /* Tài khoản tạo bằng OTP không có email — SĐT làm việc phân biệt, ô không được để trống. */
  it('không có email thì lùi về SĐT', async () => {
    state.user = { id: 'U1', displayName: 'Khách OTP', email: null, phone: '0912345678' };
    await openMenu();

    expect(screen.getByText('0912345678')).toBeTruthy();
  });

  it('cả thẻ là một liên kết tới hồ sơ', async () => {
    state.user = { id: 'U1', displayName: 'Khách A', email: 'a@x.vn' };
    await openMenu();

    const card = screen.getByText('Khách A').closest('a');
    expect(card?.getAttribute('href')).toBe('/account');
  });
});

describe('MarketHeader — dòng điều hướng trong menu', () => {
  async function openMenu() {
    render(<MarketHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'Tài khoản' }));
    await waitFor(() => expect(screen.getByText('Đăng xuất')).toBeTruthy());
  }

  /* Đích + số chưa đọc đến từ `useChatBadge` — cùng con số với biểu tượng trên thanh. */
  it('dòng Tin nhắn mang số chưa đọc và đi tới đúng hộp thư', async () => {
    state.user = { id: 'U1', displayName: 'Khách A' };
    await openMenu();

    /*
     * Hai phần tử cùng mang tên "Tin nhắn": biểu tượng trên thanh (bản mock của `ChatMenu`) và
     * dòng trong menu. Phân biệt bằng NỘI DUNG — dòng menu mang nhãn chữ, biểu tượng thì không.
     */
    const chat = screen
      .getAllByRole('link', { name: /Tin nhắn/ })
      .find((el) => el.textContent?.includes('Tin nhắn'));
    expect(chat?.getAttribute('href')).toBe('/chat');
    expect(chat?.textContent).toContain('2');
  });
});
