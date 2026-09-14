import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CHAT_SIDE } from '@xeprime/types';
import { ChatMenu } from './ChatMenu';

/**
 * Biểu tượng tin nhắn ở thanh trên cùng.
 *
 * Ba điều được khoá:
 *  1. **Desktop xem nhanh được** — popup liệt kê hội thoại gần nhất, không bắt rời trang.
 *  2. **Mỗi dòng trỏ ĐÚNG hội thoại** (`?c=<id>`), không phải chỉ mở hộp thư rồi để người dùng
 *     tự tìm lại cuộc trò chuyện họ vừa bấm.
 *  3. **Mobile đi thẳng** — popup 340px trên màn 390px là bản sao tệ hơn của chính trang chat.
 */
const state = vi.hoisted(() => ({
  mobile: false,
  badge: { count: 3, href: '/chat', side: 'customer' },
  items: [
    {
      id: 'C1',
      partyName: 'Toyota Camry 2022',
      partyAvatarUrl: null,
      vehicleName: 'Toyota Camry 2022',
      lastMessageText: 'Chào bạn, xe vẫn còn trống ngày…',
      lastMessageAt: '2026-09-14T02:15:00.000Z',
      unread: 2,
    },
  ] as unknown[],
  isPending: false,
  isError: false,
}));

vi.mock('@/hooks/use-media-query', () => ({ useIsMobile: () => state.mobile }));

vi.mock('../hooks/use-chat-badge', () => ({ useChatBadge: () => state.badge }));

vi.mock('../hooks/use-recent-conversations', () => ({
  RECENT_CONVERSATIONS_LIMIT: 6,
  useRecentConversations: () => ({
    data: { items: state.items, meta: { page: 1, limit: 20, total: 1, hasNext: false } },
    isPending: state.isPending,
    isError: state.isError,
    refetch: vi.fn(),
  }),
}));

beforeEach(() => {
  state.mobile = false;
  state.badge = { count: 3, href: '/chat', side: 'customer' };
  state.isPending = false;
  state.isError = false;
});

afterEach(cleanup);

describe('ChatMenu — desktop', () => {
  it('là một nút mở popup, kèm số tin chưa đọc', () => {
    render(<ChatMenu side={CHAT_SIDE.CUSTOMER} />);

    expect(screen.getByRole('button', { name: 'Tin nhắn' })).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('mở popup thì mỗi dòng trỏ thẳng tới hội thoại đó', async () => {
    render(<ChatMenu side={CHAT_SIDE.CUSTOMER} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tin nhắn' }));

    const row = await screen.findByRole('link', { name: /Toyota Camry 2022/ });
    expect(row.getAttribute('href')).toBe('/chat?c=C1');
  });

  it('luôn có lối ra sang hộp thư đầy đủ', async () => {
    render(<ChatMenu side={CHAT_SIDE.CUSTOMER} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tin nhắn' }));

    const all = await screen.findByRole('link', { name: /Xem tất cả tin nhắn/ });
    expect(all.getAttribute('href')).toBe('/chat');
  });

  /**
   * Huy hiệu đếm CẢ HAI vai, nên khi vai đang đứng không còn gì mà vai kia có tin thì cả biểu
   * tượng lẫn popup phải nói về vai kia — nếu không, badge báo 3 còn popup trống trơn.
   */
  it('theo đúng hộp thư mà huy hiệu trỏ tới', async () => {
    state.badge = { count: 3, href: '/manage/chat', side: 'shop' };
    render(<ChatMenu side={CHAT_SIDE.CUSTOMER} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tin nhắn' }));

    const all = await screen.findByRole('link', { name: /Xem tất cả tin nhắn/ });
    expect(all.getAttribute('href')).toBe('/manage/chat');
  });
});

describe('ChatMenu — mobile', () => {
  it('là một LIÊN KẾT đi thẳng tới trang tin nhắn, không popup', async () => {
    state.mobile = true;
    render(<ChatMenu side={CHAT_SIDE.CUSTOMER} />);

    const link = screen.getByRole('link', { name: 'Tin nhắn' });
    expect(link.getAttribute('href')).toBe('/chat');

    fireEvent.click(link);
    await waitFor(() => expect(screen.queryByText('Xem tất cả tin nhắn')).toBeNull());
  });
});
