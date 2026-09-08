import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CHAT_SIDE } from '@xeprime/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationList } from './ConversationList';
import type { ConversationSummary } from '../types';

/**
 * Cột trái của màn chat. Điều được khoá ở đây là những thứ dễ trôi khi ai đó "tiện tay tối ưu":
 * badge chưa đọc, dòng đang chọn, và — quan trọng nhất — việc tìm kiếm/lọc là tín hiệu gửi LÊN
 * (server lọc), chứ không phải một phép `filter()` trên trang đầu.
 */
const conversation = (over: Partial<ConversationSummary> & { id: string }): ConversationSummary => ({
  vehicleId: 'v1',
  vehicleName: 'Kia Morning 2021',
  vehicleImageUrl: null,
  partyName: 'Hạnh Nguyễn',
  partyAvatarUrl: null,
  side: CHAT_SIDE.CUSTOMER,
  lastMessageText: 'Anh có bớt lộc là thêm không ạ?',
  lastMessageAt: '2026-09-07T03:24:00.000Z',
  lastSenderType: 'customer',
  unread: 0,
  status: 'open',
  ...over,
});

const noop = () => undefined;

const baseProps = {
  items: [] as ConversationSummary[],
  selectedId: null as string | null,
  onSelect: noop,
  search: '',
  onSearchChange: noop,
  filter: 'all' as const,
  onFilterChange: noop,
  loading: false,
  loadingMore: false,
  hasMore: false,
  onLoadMore: noop,
  error: false,
  onRetry: noop,
};

afterEach(cleanup);

describe('ConversationList', () => {
  it('hiện tên đối phương, ngữ cảnh xe và badge chưa đọc', () => {
    render(
      <ConversationList
        {...baseProps}
        items={[conversation({ id: 'c1', unread: 2 })]}
      />,
    );

    expect(screen.getByText('Hạnh Nguyễn')).toBeTruthy();
    expect(screen.getByText('Kia Morning 2021')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('không vẽ badge khi đã đọc hết', () => {
    render(<ConversationList {...baseProps} items={[conversation({ id: 'c1', unread: 0 })]} />);
    expect(screen.queryByText('0')).toBeNull();
  });

  it('đánh dấu đúng dòng đang mở cho trình đọc màn hình', () => {
    render(
      <ConversationList
        {...baseProps}
        items={[conversation({ id: 'c1' }), conversation({ id: 'c2', partyName: 'Quốc Anh' })]}
        selectedId="c2"
      />,
    );

    const options = screen.getAllByRole('option');
    expect(options[0]?.getAttribute('aria-selected')).toBe('false');
    expect(options[1]?.getAttribute('aria-selected')).toBe('true');
  });

  it('bấm một dòng báo lên trên, không tự đổi state bên trong', () => {
    const onSelect = vi.fn();
    render(
      <ConversationList {...baseProps} items={[conversation({ id: 'c1' })]} onSelect={onSelect} />,
    );

    // Bấm vào chữ trong dòng — sự kiện nổi lên đúng nút bọc ngoài, y như người dùng chạm.
    fireEvent.click(screen.getByText('Hạnh Nguyễn'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
  });

  /** Lọc phải đi lên server; lọc tại chỗ chỉ lọc trong trang đã tải và làm mất hội thoại. */
  it('gõ tìm kiếm và đổi bộ lọc đều báo LÊN TRÊN', () => {
    const onSearchChange = vi.fn();
    const onFilterChange = vi.fn();
    render(
      <ConversationList
        {...baseProps}
        items={[conversation({ id: 'c1' })]}
        onSearchChange={onSearchChange}
        onFilterChange={onFilterChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Tìm tin nhắn, tên xe…'), {
      target: { value: 'kia' },
    });
    expect(onSearchChange).toHaveBeenCalledWith('kia');

    fireEvent.click(screen.getByRole('button', { name: 'Chưa đọc' }));
    expect(onFilterChange).toHaveBeenCalledWith('unread');
  });

  it('lỗi tải: hiện thông báo kèm nút thử lại', () => {
    const onRetry = vi.fn();
    render(<ConversationList {...baseProps} error onRetry={onRetry} />);

    expect(screen.getByText('Không tải được hội thoại')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('rỗng vì bộ lọc nói khác rỗng vì chưa có hội thoại nào', () => {
    const { rerender } = render(<ConversationList {...baseProps} />);
    expect(screen.getByText('Chưa có hội thoại')).toBeTruthy();

    rerender(<ConversationList {...baseProps} search="kia" />);
    expect(screen.getByText('Không có hội thoại nào khớp')).toBeTruthy();
  });

  it('đang tải trang đầu thì không hiện trạng thái rỗng', () => {
    render(<ConversationList {...baseProps} loading />);
    expect(screen.queryByText('Chưa có hội thoại')).toBeNull();
  });
});
