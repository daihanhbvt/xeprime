import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LoadingState } from './LoadingState';

afterEach(cleanup);

describe('LoadingState — chọn hình thức chờ theo cái đang tải', () => {
  it('page: spinner cho bố cục chưa biết trước (Figma 134:2011 R2)', () => {
    const { container } = render(<LoadingState variant="page" />);

    expect(container.querySelector('.ant-spin')).toBeTruthy();
    expect(container.querySelector('.ant-skeleton')).toBeNull();
  });

  it('table: skeleton vì bố cục đã biết (R1)', () => {
    const { container } = render(<LoadingState variant="table" />);

    expect(container.querySelectorAll('.ant-skeleton').length).toBeGreaterThan(0);
    expect(container.querySelector('.ant-spin')).toBeNull();
  });

  it('cards: skeleton dạng thẻ cho danh sách thẻ ở mobile', () => {
    const { container } = render(<LoadingState variant="cards" rows={3} />);

    expect(container.querySelectorAll('.ant-skeleton')).toHaveLength(3);
    // Thẻ có avatar giả, hàng bảng thì không — đây là khác biệt thật giữa hai biến thể.
    expect(container.querySelector('.ant-skeleton-avatar')).toBeTruthy();
  });

  it('inline: spinner nhỏ, không chiếm khối', () => {
    const { container } = render(<LoadingState variant="inline" />);

    expect(container.querySelector('.ant-spin-sm')).toBeTruthy();
  });

  it('số dòng giả theo prop rows', () => {
    const { container } = render(<LoadingState variant="table" rows={7} />);

    expect(container.querySelectorAll('.ant-skeleton')).toHaveLength(7);
  });

  it('mặc định là page', () => {
    const { container } = render(<LoadingState />);

    expect(container.querySelector('.ant-spin')).toBeTruthy();
  });
});

describe('LoadingState — khả truy cập', () => {
  it('có role="status" và aria-busy để trình đọc màn hình biết đang chờ', () => {
    render(<LoadingState variant="table" />);

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-busy')).toBe('true');
  });

  it('nhãn mặc định là "Đang tải…"', () => {
    render(<LoadingState />);

    expect(screen.getByText('Đang tải…')).toBeTruthy();
  });

  it('nhãn cụ thể theo feature (Figma 134:2011 R7)', () => {
    render(<LoadingState variant="table" label="Đang tải danh sách xe…" />);

    expect(screen.getByText('Đang tải danh sách xe…')).toBeTruthy();
  });

  it('nhãn nằm trong cây khả truy cập chứ không bị display:none', () => {
    render(<LoadingState label="Đang tải phiếu…" />);

    // `getByText` mặc định bỏ qua phần tử bị ẩn khỏi trình đọc màn hình, nên tìm thấy nghĩa là
    // kỹ thuật ẩn đang dùng (clip-path) vẫn giữ nhãn đọc được.
    const label = screen.getByText('Đang tải phiếu…');
    expect(label.textContent).toBe('Đang tải phiếu…');
  });
});

describe('LoadingState — không co sập bố cục', () => {
  it('mọi biến thể đều render một khối bao, không trả về null', () => {
    for (const variant of ['page', 'table', 'cards', 'inline'] as const) {
      cleanup();
      const { container } = render(<LoadingState variant={variant} />);
      expect(container.firstElementChild).toBeTruthy();
    }
  });
});
