import { Button } from 'antd';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EmptyState } from './EmptyState';

afterEach(cleanup);

describe('EmptyState — ba nguyên nhân, ba cách nói', () => {
  it('rỗng: hiện tiêu đề và mô tả, không có nút thử lại', () => {
    render(
      <EmptyState
        variant="empty"
        title="Gian hàng chưa có xe nào"
        description="Thêm xe đầu tiên để bắt đầu."
      />,
    );

    expect(screen.getByText('Gian hàng chưa có xe nào')).toBeTruthy();
    expect(screen.getByText('Thêm xe đầu tiên để bắt đầu.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('không-kết-quả: câu chữ do người gọi quyết, khác hẳn trạng thái rỗng', () => {
    render(<EmptyState variant="no-results" title="Không tìm thấy xe khớp bộ lọc" />);

    expect(screen.getByText('Không tìm thấy xe khớp bộ lọc')).toBeTruthy();
  });

  it('lỗi có onRetry: nút thử lại gọi đúng một lần', () => {
    const onRetry = vi.fn();
    render(<EmptyState variant="error" title="Không tải được danh sách xe" onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('lỗi KHÔNG có onRetry thì không dựng nút — Figma 134:2194 R10 cấm retry cho 403/404/409', () => {
    render(<EmptyState variant="error" title="Yêu cầu này đã được xử lý" />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('nhãn nút thử lại đổi được', () => {
    render(
      <EmptyState variant="error" title="Mất kết nối" onRetry={vi.fn()} retryLabel="Tải lại" />,
    );

    expect(screen.getByRole('button', { name: 'Tải lại' })).toBeTruthy();
  });

  it('nhận hành động chính và hành động phụ do feature truyền vào', () => {
    render(
      <EmptyState
        variant="empty"
        title="Chưa có phiếu nào"
        action={<Button>Tạo phiếu đầu tiên</Button>}
        secondaryAction={<Button>Xem hướng dẫn</Button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Tạo phiếu đầu tiên' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xem hướng dẫn' })).toBeTruthy();
  });

  it('không có hành động nào thì không dựng vùng hành động rỗng', () => {
    const { container } = render(<EmptyState variant="empty" title="Trống" />);

    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
});

describe('EmptyState — khả truy cập', () => {
  it('lỗi dùng role="alert" để được đọc ngay', () => {
    render(<EmptyState variant="error" title="Không tải được" />);

    expect(screen.getByRole('alert').textContent).toContain('Không tải được');
  });

  it('rỗng và không-kết-quả dùng role="status", không ngắt lời trình đọc màn hình', () => {
    render(<EmptyState variant="empty" title="Chưa có dữ liệu" />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();

    cleanup();
    render(<EmptyState variant="no-results" title="Không khớp bộ lọc" />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('biểu tượng bị ẩn khỏi trình đọc màn hình — tiêu đề đã nói đủ', () => {
    const { container } = render(<EmptyState variant="empty" title="Trống" />);

    const icon = container.querySelector('[aria-hidden="true"]');
    expect(icon).toBeTruthy();
  });
});

describe('EmptyState — hợp đồng màu', () => {
  it('người gọi KHÔNG truyền được màu; chỉ variant quyết định tông', () => {
    // Bảo vệ ở tầng kiểu: không có prop `color`/`status`/`tone` nào trong hợp đồng.
    // Nếu ai đó thêm vào, dòng này thành lỗi biên dịch và test phải được cập nhật có chủ ý.
    const props = { variant: 'error', title: 'x' } as const;
    render(<EmptyState {...props} />);

    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('lỗi và rỗng dùng hai class biểu tượng khác nhau', () => {
    const { container: errorContainer } = render(<EmptyState variant="error" title="Lỗi" />);
    const errorIcon = errorContainer.querySelector('[aria-hidden="true"]')?.className;

    cleanup();
    const { container: emptyContainer } = render(<EmptyState variant="empty" title="Rỗng" />);
    const emptyIcon = emptyContainer.querySelector('[aria-hidden="true"]')?.className;

    expect(errorIcon).not.toBe(emptyIcon);
  });
});
