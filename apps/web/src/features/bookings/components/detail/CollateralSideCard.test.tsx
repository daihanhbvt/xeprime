import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOKING_STATUS, DEPOSIT_STATUS } from '@xeprime/types';
import { IntlTestProvider } from '@/i18n/test-utils';
import type { BookingDetail } from '../../types';
import { CollateralSideCard } from './CollateralSideCard';

/**
 * Thẻ "Cọc & thế chấp" (ADR 0109): liệt kê cọc tiền + tài sản, đánh dấu đã trả / hoàn tác ở mọi
 * trạng thái, thêm / gỡ chỉ khi đơn chưa khép, ẩn hẳn khi không có gì để giữ và không còn sửa được.
 */

const state = vi.hoisted(() => ({
  booking: null as unknown,
  granted: true,
  moneyClosed: false,
  settlement: null as null | {
    depositRequired: string;
    depositReceived: string;
    depositStatus: string;
  },
}));
const calls = vi.hoisted(() => ({
  add: vi.fn(),
  remove: vi.fn(),
  returned: vi.fn(),
  update: vi.fn(),
}));

vi.mock('./BookingDetailActions', () => ({
  useBookingDetailActions: () => ({
    booking: state.booking,
    moneyClosed: state.moneyClosed,
    can: { edit: state.granted },
  }),
}));
vi.mock('./CollateralCashDialog', () => ({
  CollateralCashDialog: ({ open, current }: { open: boolean; current: string }) =>
    open ? <div data-testid="cash-dialog">{current}</div> : null,
}));
vi.mock('@/features/settlement/hooks', () => ({
  useSettlement: () => ({ data: state.settlement }),
}));
vi.mock('@/features/tenant-support/support-session', () => ({
  SUPPORT_HIDDEN_AREA: { SETTLEMENT: 'settlement' },
  useSupportHides: () => false,
}));
vi.mock('@/features/payments/components/RecordPaymentModal', () => ({
  RecordPaymentModal: ({ debtAmount }: { debtAmount: string }) => (
    <div data-testid="deposit-modal">{debtAmount}</div>
  ),
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ has: () => state.granted }),
}));
vi.mock('../../hooks/use-booking-collaterals', () => ({
  useAddBookingCollateral: () => ({ mutate: calls.add, isPending: false }),
  useRemoveBookingCollateral: () => ({ mutate: calls.remove, isPending: false }),
  useSetBookingCollateralReturned: () => ({ mutate: calls.returned, isPending: false }),
  useUpdateBookingCollateral: () => ({ mutate: calls.update, isPending: false }),
}));

function booking(overrides: Partial<BookingDetail> = {}): BookingDetail {
  return {
    id: 'bk-1',
    status: BOOKING_STATUS.ACTIVE,
    depositAmount: '3000000',
    collaterals: [
      {
        id: 'c1',
        collateralType: 'motorbike',
        description: '59A1-12345',
        returnedAt: null,
        returnedByName: null,
        createdAt: '2026-11-25T01:00:00.000Z',
      },
      {
        id: 'c2',
        collateralType: 'citizen_id',
        description: null,
        returnedAt: '2026-11-26T01:00:00.000Z',
        returnedByName: 'Chủ shop',
        createdAt: '2026-11-25T01:00:00.000Z',
      },
    ],
    ...overrides,
  } as unknown as BookingDetail;
}

function renderCard() {
  return render(
    <IntlTestProvider>
      <App>
        <CollateralSideCard />
      </App>
    </IntlTestProvider>,
  );
}

beforeEach(() => {
  state.booking = booking();
  state.granted = true;
  state.moneyClosed = false;
  state.settlement = null;
  calls.add.mockReset();
  calls.remove.mockReset();
  calls.returned.mockReset();
  calls.update.mockReset();
});
afterEach(cleanup);

describe('CollateralSideCard', () => {
  it('hiện cọc tiền, từng món, số đang giữ và món đã trả kèm người trả', () => {
    renderCard();
    expect(screen.getByText('Cọc & thế chấp')).toBeTruthy();
    expect(screen.getByText('Đang giữ 1/2')).toBeTruthy();
    expect(screen.getByText('3.000.000 ₫')).toBeTruthy();
    expect(screen.getByText('Xe máy')).toBeTruthy();
    expect(screen.getByText('59A1-12345')).toBeTruthy();
    expect(screen.getByText(/Chủ shop trả lúc/)).toBeTruthy();
  });

  it('đánh dấu đã trả và hoàn tác gọi đúng món', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /^check Trả lại$/ }));
    expect(calls.returned.mock.calls[0]![0]).toEqual({ id: 'c1', returned: true });
    fireEvent.click(screen.getByRole('button', { name: /Hoàn tác/ }));
    expect(calls.returned.mock.calls[1]![0]).toEqual({ id: 'c2', returned: false });
  });

  it('thêm món "khác" phải có mô tả; có mô tả thì gửi', async () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Thêm tài sản thế chấp/ }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Loại tài sản' }));
    fireEvent.click(await screen.findByText('Khác'));
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    expect(calls.add).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Mô tả tài sản'), { target: { value: 'Laptop Dell' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    await waitFor(() => expect(calls.add).toHaveBeenCalledTimes(1));
    expect(calls.add.mock.calls[0]![0]).toEqual({
      collateralType: 'other',
      description: 'Laptop Dell',
    });
  });

  it('sửa tiền cọc: bút cạnh "Tiền cọc" mở hộp sửa với số đang ghi', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Sửa tiền cọc' }));
    expect(screen.getByTestId('cash-dialog').textContent).toBe('3000000');
  });

  it('sửa một món đang giữ tại dòng: đổi mô tả rồi lưu gửi đúng món; món đã trả không có bút', async () => {
    renderCard();
    // Chỉ món chưa trả (xe máy) có bút sửa.
    expect(screen.getAllByRole('button', { name: 'Sửa tài sản' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Sửa tài sản' }));
    const input = screen.getByLabelText('Mô tả tài sản') as HTMLInputElement;
    expect(input.value).toBe('59A1-12345');
    fireEvent.change(input, { target: { value: '59A1-99999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(calls.update).toHaveBeenCalledTimes(1));
    expect(calls.update.mock.calls[0]![0]).toEqual({
      id: 'c1',
      body: { collateralType: 'motorbike', description: '59A1-99999' },
    });
  });

  it('không có quyền sửa đơn ⇒ không có bút sửa', () => {
    state.granted = false;
    renderCard();
    expect(screen.queryByRole('button', { name: 'Sửa tiền cọc' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sửa tài sản' })).toBeNull();
  });

  it('đơn đã hoàn thành: vẫn đánh dấu trả được nhưng không thêm/gỡ/sửa món', () => {
    state.booking = booking({ status: BOOKING_STATUS.COMPLETED });
    renderCard();
    expect(screen.getByRole('button', { name: /^check Trả lại$/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Thêm tài sản thế chấp/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Gỡ/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sửa tài sản' })).toBeNull();
  });

  it('đơn đã khép, không cọc, không tài sản ⇒ ẩn hẳn', () => {
    state.booking = booking({
      status: BOOKING_STATUS.COMPLETED,
      depositAmount: '0',
      collaterals: [],
    });
    const { container } = renderCard();
    expect(container.textContent).toBe('');
  });

  it('cọc chưa thu: nói thẳng "Chưa thu" + link thu, mở hộp thu cọc với đúng số còn thiếu', () => {
    state.settlement = {
      depositRequired: '3000000.00',
      depositReceived: '0.00',
      depositStatus: DEPOSIT_STATUS.NOT_RECEIVED,
    };
    renderCard();
    expect(screen.getByText('Chưa thu')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đã thu' }));
    expect(screen.getByTestId('deposit-modal').textContent).toBe('3000000');
  });

  it('thu thiếu: nêu đã nhận bao nhiêu, còn thiếu bao nhiêu', () => {
    state.settlement = {
      depositRequired: '3000000.00',
      depositReceived: '1000000.00',
      depositStatus: DEPOSIT_STATUS.RECEIVED,
    };
    renderCard();
    expect(screen.getByText(/Đã nhận 1.000.000.*còn thiếu 2.000.000/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xác nhận đã thu' })).toBeTruthy();
  });

  it('đã nhận đủ: không còn link thu', () => {
    state.settlement = {
      depositRequired: '3000000.00',
      depositReceived: '3000000.00',
      depositStatus: DEPOSIT_STATUS.RECEIVED,
    };
    renderCard();
    expect(screen.getByText('Đã nhận đủ')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xác nhận đã thu' })).toBeNull();
  });

  it('đơn huỷ / khách không đến (moneyClosed): không mời thu cọc mới', () => {
    state.moneyClosed = true;
    state.settlement = {
      depositRequired: '3000000.00',
      depositReceived: '0.00',
      depositStatus: DEPOSIT_STATUS.NOT_RECEIVED,
    };
    renderCard();
    expect(screen.queryByRole('button', { name: 'Xác nhận đã thu' })).toBeNull();
  });
});
