import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('vẫn dẫn tới các đích quen thuộc của khu khách', () => {
    render(<MarketHeader />);
    expect(screen.getByRole('link', { name: 'Chuyến của tôi' }).getAttribute('href')).toBe(
      '/trips',
    );
  });

  it('đổi ngôn ngữ nằm TRONG menu tài khoản khi đã đăng nhập', async () => {
    render(<MarketHeader />);

    fireEvent.click(screen.getByRole('button', { name: 'Tài khoản' }));

    await waitFor(() => expect(screen.getByText('Tiếng Việt')).toBeTruthy());
    expect(screen.getByText('English')).toBeTruthy();
  });

  /**
   * Chọn ngôn ngữ là việc người ta làm TRƯỚC khi làm bất cứ việc gì khác. Dọn nó vào menu tài
   * khoản mà quên nhánh chưa đăng nhập thì khách vãng lai bị nhốt trong tiếng Việt.
   */
  it('khách CHƯA đăng nhập vẫn có nút đổi ngôn ngữ riêng trên thanh', () => {
    state.user = null;
    render(<MarketHeader />);

    expect(screen.getByRole('button', { name: /Đổi ngôn ngữ giao diện/ })).toBeTruthy();
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

  it('khách thấy chuyến, tin nhắn và chuông thông báo', () => {
    render(<MarketHeader />);

    expect(screen.getByRole('link', { name: 'Chuyến của tôi' }).getAttribute('href')).toBe(
      '/trips',
    );
    expect(screen.getByRole('link', { name: 'Tin nhắn' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thông báo' })).toBeTruthy();
  });

  it('không có lối "Quản lý gian hàng" nào, kể cả khi dữ liệu cũ mang tenant', () => {
    state.user = legacyShopUser;
    render(<MarketHeader />);

    expect(screen.queryByRole('link', { name: 'Quản lý gian hàng' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Chuyến của tôi' })).toBeTruthy();
  });

  it('menu tài khoản: hồ sơ, chuyến, tin nhắn và lối "Trở thành chủ xe" tới trang giới thiệu đăng xe', async () => {
    await openMenu();

    expect(screen.getByRole('link', { name: /Tài khoản của tôi/ }).getAttribute('href')).toBe(
      '/account',
    );
    expect(screen.getByRole('link', { name: /Trở thành chủ xe/ }).getAttribute('href')).toBe(
      '/list-your-vehicle',
    );
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
