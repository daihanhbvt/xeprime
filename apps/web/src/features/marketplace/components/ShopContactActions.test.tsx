import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ShopContactActions } from './ShopContactActions';

const eligibility = vi.hoisted(() => vi.fn());

vi.mock('@/features/chat/api', () => ({
  chatApi: { eligibility },
}));

vi.mock('@/features/chat/components/ChatWithShopButton', () => ({
  ChatWithShopButton: ({ label }: { label?: string }) => (
    <button type="button">{label ?? 'Nhắn shop'}</button>
  ),
}));

/** Query client riêng mỗi bài: cache dùng chung làm bài sau đọc đáp án của bài trước. */
function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  eligibility.mockReset();
});

describe('ShopContactActions', () => {
  it('gian hàng mở hộp thư công khai ⇒ nút hiện ngay, KHÔNG hỏi server', () => {
    wrap(<ShopContactActions slug="xeprime-sai-gon" chatOpen />);

    expect(screen.getByRole('button', { name: 'Nhắn tin' })).toBeTruthy();
    // Câu trả lời đã biết trước từ dữ liệu trang — một round-trip cho mọi lượt xem là chi phí
    // không đổi lấy gì.
    expect(eligibility).not.toHaveBeenCalled();
  });

  /*
   * Chủ xe cá nhân + khách CHƯA đặt: không nút, và cũng KHÔNG một dòng giải thích nào. Thẻ danh
   * tính là chỗ giới thiệu người cho thuê, không phải chỗ kể cho khách nghe luật nội bộ của sàn.
   */
  it('chủ xe cá nhân + khách chưa đặt ⇒ không render gì', async () => {
    eligibility.mockResolvedValue({ canChat: false });

    const { container } = wrap(<ShopContactActions slug="xe-nha-can-tho" chatOpen={false} />);

    await waitFor(() => expect(eligibility).toHaveBeenCalledWith('xe-nha-can-tho'));
    expect(container.querySelector('button')).toBeNull();
    expect(container.textContent).toBe('');
  });

  /* Đã có đơn ⇒ kênh mở, và nút phải hiện ra ngay trên trang gian hàng của chính chủ xe đó. */
  it('chủ xe cá nhân + khách ĐÃ gửi yêu cầu ⇒ nút hiện', async () => {
    eligibility.mockResolvedValue({ canChat: true });

    wrap(<ShopContactActions slug="xe-nha-can-tho" chatOpen={false} />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Nhắn tin' })).toBeTruthy());
  });

  /* Khách chưa đăng nhập: 401 ⇒ coi như chưa được nhắn, không vỡ trang, không báo lỗi. */
  it('khách chưa đăng nhập ⇒ không render gì và không ném', async () => {
    eligibility.mockRejectedValue(new Error('unauthenticated'));

    const { container } = wrap(<ShopContactActions slug="xe-nha-can-tho" chatOpen={false} />);

    await waitFor(() => expect(eligibility).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('không bao giờ hiện số điện thoại', () => {
    wrap(<ShopContactActions slug="xeprime-sai-gon" chatOpen />);

    expect(screen.queryByText(/09\d{8}/)).toBeNull();
    expect(screen.queryByRole('link', { name: /Gọi/ })).toBeNull();
  });
});
