import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicShopSummary } from '../types';
import { KeywordSearch } from './KeywordSearch';

/**
 * Ô từ khoá của `/search`. Điều phải đúng:
 *   1. gõ là lọc — nhưng theo NHỊP, không mỗi phím một lần ghi URL; Enter / xoá trắng áp ngay;
 *   2. URL đổi từ nơi khác thì ô nhập theo, trừ lúc khách đang gõ;
 *   3. gợi ý chủ xe chỉ hiện khi có người khớp, chọn là sang trang của họ — không bao giờ biến
 *      giá trị nội bộ của option thành từ khoá.
 */

const nav = vi.hoisted(() => ({ push: vi.fn() }));
const suggestions = vi.hoisted(() => ({ data: [] as PublicShopSummary[] }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
}));

vi.mock('../hooks/use-shop-suggestions', () => ({
  useShopSuggestions: () => ({ data: suggestions.data }),
}));

const HOST: PublicShopSummary = {
  name: 'Nguyễn Văn Tuấn',
  slug: 'tuan-xe',
  logoUrl: null,
  provinceName: 'Hà Nội',
  vehicleCount: 3,
  ratingAvg: '4.80',
  ratingCount: 12,
  completedTripCount: 0,
  verified: false,
};

beforeEach(() => {
  vi.useFakeTimers();
  nav.push.mockClear();
  suggestions.data = [];
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const input = () =>
  screen.getByRole('combobox', { name: 'Tìm xe theo tên xe, chủ xe hoặc gian hàng' });

function type(value: string) {
  fireEvent.focus(input());
  fireEvent.change(input(), { target: { value } });
}

describe('KeywordSearch', () => {
  it('gõ là lọc theo nhịp — một lần ghi cho cả chuỗi phím', () => {
    const onApply = vi.fn();
    render(<KeywordSearch value={undefined} onApply={onApply} />);

    type('vin');
    type('vinfast');
    expect(onApply).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(400));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith('vinfast');
  });

  it('Enter áp ngay, không chờ nhịp gõ — và không ghi lần hai khi nhịp gõ tới hạn', () => {
    const onApply = vi.fn();
    render(<KeywordSearch value={undefined} onApply={onApply} />);

    type('  vf8  ');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onApply).toHaveBeenCalledWith('vf8');

    act(() => vi.advanceTimersByTime(1000));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('xoá trắng ô = bỏ từ khoá ngay', () => {
    const onApply = vi.fn();
    render(<KeywordSearch value="mazda" onApply={onApply} />);

    type('');
    expect(onApply).toHaveBeenCalledWith(undefined);
  });

  it('URL đổi từ nơi khác (back/forward, nút xoá từ khoá) thì ô nhập theo', () => {
    const { rerender } = render(<KeywordSearch value="mazda" onApply={vi.fn()} />);
    expect((input() as HTMLInputElement).value).toBe('mazda');

    rerender(<KeywordSearch value={undefined} onApply={vi.fn()} />);
    expect((input() as HTMLInputElement).value).toBe('');
  });

  it('không có chủ xe nào khớp thì không mở danh sách thả xuống', () => {
    render(<KeywordSearch value={undefined} onApply={vi.fn()} />);
    type('tuan');
    expect(screen.queryByText('Chủ xe & gian hàng')).toBeNull();
  });

  it('gợi ý chủ xe: tô phần khớp, chọn là sang trang của họ, không thành từ khoá', () => {
    suggestions.data = [HOST];
    const onApply = vi.fn();
    render(<KeywordSearch value={undefined} onApply={onApply} />);

    type('tuan');
    expect(screen.getByText('Chủ xe & gian hàng')).toBeTruthy();
    expect(screen.getByText('Tuấn', { selector: 'mark' })).toBeTruthy();
    expect(screen.getByText(/Chủ xe · 3 xe · Hà Nội/)).toBeTruthy();

    const option = screen
      .getByText('Tuấn', { selector: 'mark' })
      .closest('.ant-select-item-option');
    expect(option).not.toBeNull();
    fireEvent.click(option as Element);

    expect(nav.push).toHaveBeenCalledWith('/shops/tuan-xe');
    // Nhịp gõ còn treo tới hạn SAU khi đã chọn — không được ghi từ khoá kéo khách về /search.
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.blur(input());
    expect(onApply).not.toHaveBeenCalled();
  });

  it('dòng "Xem mọi xe khớp" áp từ khoá cho cả lưới', () => {
    suggestions.data = [HOST];
    const onApply = vi.fn();
    render(<KeywordSearch value={undefined} onApply={onApply} />);

    type('tuan');
    fireEvent.mouseDown(screen.getByRole('button', { name: /Xem mọi xe khớp “tuan”/ }));
    expect(onApply).toHaveBeenCalledWith('tuan');
  });
});
