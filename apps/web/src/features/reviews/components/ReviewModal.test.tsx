import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReviewModal, type ReviewTargetTrip } from './ReviewModal';

/**
 * Test đặc tả viết TRƯỚC khi đổi vỏ overlay.
 *
 * Điểm dễ vỡ nhất ở đây là **reset form**: `reset(DEFAULTS)` chỉ chạy khi gửi THÀNH CÔNG.
 * Đóng bằng Huỷ thì nhận xét đã gõ vẫn còn khi mở lại. Đó là hành vi đang có và phải giữ.
 */
const create = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('../hooks/use-create-review', () => ({ useCreateReview: () => create }));
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

/**
 * `TextAreaField` dùng `Form.Item label` mà KHÔNG nối `htmlFor` (khác `TextField`), nên
 * `getByLabelText` không tìm ra ô nhập. Đây là khiếm khuyết a11y CÓ SẴN — ghi ở backlog
 * (D14.4), không sửa trong batch này; test lấy thẳng phần tử để không che mất vấn đề.
 */
function commentBox(): HTMLTextAreaElement {
  return document.querySelector('textarea')!;
}

const TRIP: ReviewTargetTrip = { bookingId: 'B1', vehicleName: 'Toyota Vios' };

function renderModal(trip: ReviewTargetTrip | null = TRIP, onClose = vi.fn()) {
  const utils = render(
    <App>
      <ReviewModal trip={trip} open={trip !== null} onClose={onClose} />
    </App>,
  );
  return { ...utils, onClose };
}

beforeEach(() => {
  create.mutate.mockReset();
  create.isPending = false;
});

afterEach(cleanup);

describe('ReviewModal — hành vi hiện tại', () => {
  it('tiêu đề kèm tên xe của chuyến', () => {
    renderModal();
    expect(screen.getByText('Đánh giá · Toyota Vios')).toBeTruthy();
  });

  it('gửi mặc định 5 sao và bỏ nhận xét rỗng', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

    await waitFor(() => expect(create.mutate).toHaveBeenCalledTimes(1));
    expect(create.mutate.mock.calls[0]![0]).toEqual({
      bookingId: 'B1',
      rating: 5,
      // Nhận xét rỗng gửi `undefined`, không phải chuỗi rỗng.
      comment: undefined,
    });
  });

  it('gửi kèm nhận xét khi có nhập', async () => {
    renderModal();
    fireEvent.change(commentBox(), {
      target: { value: 'Xe sạch, chủ thân thiện' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

    await waitFor(() => expect(create.mutate).toHaveBeenCalled());
    expect(create.mutate.mock.calls[0]![0].comment).toBe('Xe sạch, chủ thân thiện');
  });

  it('thành công: báo "Cảm ơn bạn đã đánh giá!" rồi đóng', async () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

    await waitFor(() => expect(create.mutate).toHaveBeenCalled());
    create.mutate.mock.calls[0]![1].onSuccess();

    expect(await screen.findByText('Cảm ơn bạn đã đánh giá!')).toBeTruthy();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lỗi: hiện thông báo và KHÔNG đóng', async () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

    await waitFor(() => expect(create.mutate).toHaveBeenCalled());
    create.mutate.mock.calls[0]![1].onError(new Error('Chuyến này đã được đánh giá'));

    expect(await screen.findByText('Chuyến này đã được đánh giá')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('không có trip thì không gửi', async () => {
    render(
      <App>
        <ReviewModal trip={null} open onClose={vi.fn()} />
      </App>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));
    await waitFor(() => expect(create.mutate).not.toHaveBeenCalled());
  });

  it('đang gửi thì nút loading', () => {
    create.isPending = true;
    renderModal();
    expect(screen.getByRole('button', { name: /Gửi đánh giá/ }).className).toContain(
      'ant-btn-loading',
    );
  });

  it('nút Huỷ gọi onClose', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /** Hành vi đang có: chỉ reset sau khi gửi thành công, không reset khi đóng. */
  it('đóng rồi mở lại vẫn giữ nhận xét đã gõ (chưa gửi)', () => {
    const { rerender } = renderModal();
    fireEvent.change(commentBox(), {
      target: { value: 'Bản nháp' },
    });

    rerender(
      <App>
        <ReviewModal trip={TRIP} open={false} onClose={vi.fn()} />
      </App>,
    );
    rerender(
      <App>
        <ReviewModal trip={TRIP} open onClose={vi.fn()} />
      </App>,
    );

    expect(commentBox().value).toBe('Bản nháp');
  });
});
