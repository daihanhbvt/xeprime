import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MarketHeader } from './MarketHeader';

/**
 * Vỏ khu khách — nằm trên MỌI trang của tuyến thuê xe, nên một lỗi tương tác ở đây nhân lên
 * khắp sản phẩm.
 *
 * Wave 12 khoá đúng một điều: mỗi biểu tượng ở góc phải là MỘT phần tử tương tác có tên đọc
 * được. Trước đó nút tin nhắn là `<Button>` lồng trong `<Link>` — trình đọc màn hình nhận hai
 * đích cho cùng một hành động và bàn phím phải Tab hai lần để đi qua một cái icon.
 */
const state = vi.hoisted(() => ({
  user: { id: 'U1', displayName: 'Khách A' } as unknown,
  unread: 3,
}));

vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: state.user }) }));

vi.mock('@/features/chat/hooks/use-chat-unread-count', () => ({
  useChatUnreadCount: () => ({ data: { count: state.unread } }),
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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

beforeEach(() => {
  state.user = { id: 'U1', displayName: 'Khách A' };
  state.unread = 3;
});

afterEach(cleanup);

describe('MarketHeader', () => {
  it('nút tin nhắn là MỘT liên kết, không phải nút lồng trong liên kết', () => {
    render(<MarketHeader />);

    const chat = screen.getByRole('link', { name: 'Tin nhắn' });
    expect(chat.getAttribute('href')).toBe('/chat');
    expect(within(chat).queryByRole('button')).toBeNull();
    expect(chat.querySelector('button')).toBeNull();
  });

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
});
