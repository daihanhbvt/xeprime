import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CUSTOMER_CANCEL_PREVIEW_KIND, CUSTOMER_TRIP_STAGE } from '@xeprime/types';
import { renderWithIntl } from '@/i18n/test-utils';
import type { CustomerTripCancelPreview, CustomerTripDetail } from '../types';
import { CancelTripDialog } from './CancelTripDialog';

/**
 * Hộp xác nhận huỷ chuyến của KHÁCH — tiền đi đâu nếu huỷ ngay (ADR 0064 · ADR 0045).
 *
 * Mọi con số đến từ `GET /trips/:id/cancel-preview`; hộp này chỉ CHỌN câu. Khoá:
 *  - huỷ muộn: số đã chuyển / được hoàn / mất, có và không có tiền bảo hiểm hoàn lại;
 *  - chuyến KHÔNG có huỷ miễn phí (đặt gấp) đổi tiêu đề;
 *  - tranh chấp mở (`deferred`) ⇒ câu "XePrime chốt sau";
 *  - đang tải / lỗi xem trước — lỗi KHÔNG chặn huỷ;
 *  - server nói không huỷ được (`allowed = false`) ⇒ nút bị khoá và có lý do.
 */
const state = vi.hoisted(() => ({
  preview: {
    isLoading: false,
    isError: false,
    data: undefined as unknown,
  },
  cancel: {
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null as unknown,
  },
}));

vi.mock('../hooks', () => ({
  useTripCancelPreview: () => state.preview,
  useCancelTrip: () => state.cancel,
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

const TRIP = {
  id: 'RQ1',
  stage: CUSTOMER_TRIP_STAGE.READY,
  finance: null,
} as unknown as CustomerTripDetail;

function preview(overrides: Partial<CustomerTripCancelPreview>): CustomerTripCancelPreview {
  return {
    allowed: true,
    kind: CUSTOMER_CANCEL_PREVIEW_KIND.LATE_CANCEL,
    paidAmount: '300000',
    refundAmount: '70000',
    insuranceRefundAmount: '70000',
    forfeitAmount: '230000',
    ownerCompensationAmount: '115000',
    freeCancelUntil: '2026-08-09T05:00:00.000Z',
    freeCancelAvailable: true,
    deferred: false,
    ...overrides,
  };
}

function renderDialog() {
  return renderWithIntl(<CancelTripDialog trip={TRIP} open onClose={vi.fn()} />);
}

const confirmButton = () => screen.getByRole('button', { name: 'Xác nhận hủy' });

/** Lý do huỷ là BẮT BUỘC — mở ô chọn và chọn "Thay đổi lịch trình". */
function pickReason() {
  fireEvent.mouseDown(screen.getByRole('combobox'));
  fireEvent.click(screen.getByText('Thay đổi lịch trình'));
}

beforeEach(() => {
  state.preview.isLoading = false;
  state.preview.isError = false;
  state.preview.data = undefined;
  state.cancel.mutate.mockReset();
  state.cancel.isPending = false;
  state.cancel.isError = false;
  state.cancel.error = null;
});

afterEach(cleanup);

describe('CancelTripDialog — huỷ muộn', () => {
  it('có bảo hiểm hoàn lại: kể đủ ba con số và câu bảo hiểm', () => {
    state.preview.data = preview({});
    renderDialog();
    expect(screen.getByText('Đã qua thời gian huỷ miễn phí')).toBeTruthy();
    expect(screen.getByText('300.000 ₫')).toBeTruthy();
    // Tiền hoàn ở đây đúng bằng tiền bảo hiểm — cùng một số ở hai chỗ là đúng.
    expect(screen.getAllByText('70.000 ₫').length).toBeGreaterThan(0);
    expect(screen.getByText('230.000 ₫')).toBeTruthy();
    expect(screen.getByText(/Tiền bảo hiểm 70\.000 ₫ được hoàn đủ/)).toBeTruthy();
  });

  it('không có bảo hiểm: câu phân bổ tiền không nhắc tới bảo hiểm', () => {
    state.preview.data = preview({
      refundAmount: '0',
      insuranceRefundAmount: '0',
      forfeitAmount: '300000',
    });
    renderDialog();
    expect(
      screen.getByText(
        'Tiền giữ chỗ (phí đặt xe và phần tiền thuê trả trước) không được hoàn: chủ xe được đền vì đã giữ xe cho bạn, phần còn lại thuộc XePrime.',
      ),
    ).toBeTruthy();
    // Phía khách không bao giờ thấy phí dịch vụ của chủ xe (ADR 0064 điều 11).
    expect(screen.queryByText(/hoa hồng/i)).toBeNull();
    expect(screen.queryByText(/Tiền bảo hiểm/)).toBeNull();
  });

  it('chuyến đặt gấp không có huỷ miễn phí ⇒ tiêu đề nói thẳng điều đó', () => {
    state.preview.data = preview({ freeCancelAvailable: false });
    renderDialog();
    expect(screen.getByText('Chuyến này không có thời gian huỷ miễn phí')).toBeTruthy();
    expect(screen.queryByText('Đã qua thời gian huỷ miễn phí')).toBeNull();
  });

  it('đang có tranh chấp ⇒ báo XePrime sẽ chốt khoản này sau', () => {
    state.preview.data = preview({ deferred: true });
    renderDialog();
    expect(screen.getByText(/XePrime sẽ chốt khoản này sau khi có kết luận/)).toBeTruthy();
  });
});

describe('CancelTripDialog — trạng thái xem trước', () => {
  it('đang tải: chưa hiện số tiền nào', () => {
    state.preview.isLoading = true;
    const { container } = renderDialog();
    expect(container.ownerDocument.querySelector('.ant-skeleton')).toBeTruthy();
    expect(screen.queryByText('Tiền giữ chỗ đã chuyển')).toBeNull();
  });

  it('lỗi xem trước: báo lỗi nhưng VẪN cho huỷ', () => {
    state.preview.isError = true;
    renderDialog();
    expect(screen.getByText(/Chưa xem trước được số tiền được hoàn/)).toBeTruthy();
    pickReason();
    fireEvent.click(confirmButton());
    expect(state.cancel.mutate).toHaveBeenCalledTimes(1);
  });

  it('server nói không huỷ được ⇒ khoá nút, hiện lý do, không gọi huỷ', () => {
    state.preview.data = preview({
      allowed: false,
      kind: CUSTOMER_CANCEL_PREVIEW_KIND.NOT_ALLOWED,
    });
    renderDialog();
    expect(screen.getByText('Chuyến này không huỷ được nữa')).toBeTruthy();
    const button = confirmButton() as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(state.cancel.mutate).not.toHaveBeenCalled();
  });

  it('huỷ được ⇒ bấm xác nhận gọi huỷ đúng một lần', () => {
    state.preview.data = preview({
      kind: CUSTOMER_CANCEL_PREVIEW_KIND.FULL_REFUND,
      refundAmount: '300000',
      forfeitAmount: '0',
    });
    renderDialog();
    pickReason();
    fireEvent.click(confirmButton());
    expect(state.cancel.mutate).toHaveBeenCalledTimes(1);
    expect(state.cancel.mutate.mock.calls[0]![0]).toBe('schedule_conflict');
  });

  it('chưa chọn lý do ⇒ báo thiếu lý do, KHÔNG gọi huỷ', () => {
    state.preview.data = preview({
      kind: CUSTOMER_CANCEL_PREVIEW_KIND.FULL_REFUND,
      refundAmount: '300000',
      forfeitAmount: '0',
    });
    renderDialog();
    fireEvent.click(confirmButton());
    expect(screen.getByText('Vui lòng chọn lý do hủy')).toBeTruthy();
    expect(state.cancel.mutate).not.toHaveBeenCalled();
  });
});
