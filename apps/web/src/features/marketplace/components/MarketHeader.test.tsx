import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('@/features/notifications/components/NotificationBell', () => ({
  NotificationBell: () => <button type="button" aria-label="Thông báo" />,
}));

vi.mock('@/i18n/actions', () => ({ setLocale: vi.fn().mockResolvedValue({ ok: true }) }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
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
