import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BILLING_MODE, BOOKING_EXTENSION_STATUS } from '@xeprime/types';
import { renderWithIntl } from '@/i18n/test-utils';
import type { BookingExtension, BookingExtensionQuote, ExtendableBooking } from '../types';

/**
 * Hộp "Gia hạn thuê xe" (ADR 0077). Khoá những điều một bản "giống ảnh" sẽ trượt:
 *  1. Chỉ có mốc THÁNG — không +7/+15 ngày.
 *  2. Xe bận trong khoảng gia hạn ⇒ không cho bấm Thanh toán.
 *  3. Đơn đang có phụ lục chờ tiền ⇒ mở thẳng màn thanh toán của CHÍNH phụ lục đó (cùng mã).
 *  4. Màn thanh toán không có nút "khách đã chuyển khoản" — chỉ "Huỷ gia hạn" và "Xong".
 */

const state = vi.hoisted(() => ({
  extensions: [] as unknown[],
  quote: null as unknown,
  create: vi.fn(),
  quoteMonths: [] as number[],
}));

vi.mock('../hooks/use-booking-extensions', () => ({
  useBookingExtensions: () => ({ data: state.extensions, isPending: false }),
  pendingExtensionOf: (list: BookingExtension[] | undefined) =>
    list?.find((e) => e.status === 'awaiting_payment') ?? null,
  useBookingExtensionQuote: (_id: string, months: number) => {
    state.quoteMonths.push(months);
    const q = state.quote as BookingExtensionQuote | null;
    return {
      data: q ? { ...q, months } : undefined,
      isError: false,
      isPlaceholderData: false,
    };
  },
  useCreateBookingExtension: () => ({ mutate: state.create, isPending: false }),
  useCancelBookingExtension: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const { ExtendBookingDialog } = await import('./ExtendBookingDialog');

const BOOKING: ExtendableBooking = {
  id: 'B1',
  code: 'XP-1',
  vehicleName: 'Honda City 2020',
  vehiclePlate: '51K-836.79',
  vehicleImageUrl: null,
  pickupAt: '2026-10-29T06:00:00.000Z',
  returnAt: '2026-11-29T06:00:00.000Z',
  actualPickupAt: '2026-10-29T06:00:00.000Z',
  totalAmount: '15000000',
  debtAmount: '0',
};

function quote(over: Partial<BookingExtensionQuote> = {}): BookingExtensionQuote {
  return {
    months: 1,
    fromAt: BOOKING.returnAt,
    toAt: '2026-12-29T06:00:00.000Z',
    rentalDays: 30,
    monthlyPrice: '15000000',
    basePackageAmount: '15000000',
    durationDiscountPercent: null,
    durationDiscountAmount: '0',
    rentalAmount: '15000000',
    taxAmount: '1050000',
    vatAmount: '750000',
    pitAmount: '300000',
    vatPercent: 5,
    pitPercent: 2,
    onlineAmount: '2250000',
    payAtPickupAmount: '12750000',
    ownerPayableAmount: '1200000',
    ownerNetAmount: '13950000',
    billingMode: BILLING_MODE.COMMISSION,
    available: true,
    busyFrom: null,
    ...over,
  };
}

function pendingExtension(): BookingExtension {
  return {
    id: 'E1',
    code: 'XPEABCDEFGH',
    bookingId: 'B1',
    months: 1,
    fromAt: BOOKING.returnAt,
    toAt: '2026-12-29T06:00:00.000Z',
    status: BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT,
    rentalAmount: '15000000',
    taxAmount: '1050000',
    onlineAmount: '2250000',
    payAtPickupAmount: '12750000',
    paidAmount: '0',
    remainingAmount: '2250000',
    ownerPayableAmount: '1200000',
    expiresAt: '2026-11-02T12:00:00.000Z',
    paidAt: null,
    activatedAt: null,
    closedAt: null,
    createdAt: '2026-11-02T10:00:00.000Z',
    paymentInfo: { configured: false },
  };
}

beforeEach(() => {
  state.extensions = [];
  state.quote = quote();
  state.create.mockReset();
  state.quoteMonths = [];
});

describe('Bước chọn thời gian', () => {
  it('chỉ có mốc tháng 1/2/3/6/9/12; đổi mốc là báo giá lại', () => {
    renderWithIntl(<ExtendBookingDialog booking={BOOKING} onClose={vi.fn()} />);
    const chips = screen.getAllByRole('radio').map((el) => el.textContent);
    expect(chips).toEqual([
      '+1 tháng',
      '+2 tháng',
      '+3 tháng',
      '+6 tháng',
      '+9 tháng',
      '+12 tháng',
    ]);
    fireEvent.click(screen.getByRole('radio', { name: '+3 tháng' }));
    expect(state.quoteMonths).toContain(3);
    expect(screen.getByText('Miễn phí nền tảng cho phần gia hạn')).toBeTruthy();
  });

  it('xe trống ⇒ bấm Thanh toán tạo phụ lục đúng số tháng', () => {
    renderWithIntl(<ExtendBookingDialog booking={BOOKING} onClose={vi.fn()} />);
    expect(screen.getByText('Xe đang trống trong khoảng thời gian gia hạn!')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Thanh toán/ }));
    expect(state.create).toHaveBeenCalledWith(1, expect.anything());
  });

  it('xe bận trong khoảng gia hạn ⇒ báo bận và không cho bấm', () => {
    state.quote = quote({ available: false, busyFrom: '2026-12-10T02:00:00.000Z' });
    renderWithIntl(<ExtendBookingDialog booking={BOOKING} onClose={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toMatch(/Xe đã có lịch từ/);
    expect(
      (screen.getByRole('button', { name: /Thanh toán/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe('Bước thanh toán', () => {
  it('đơn có phụ lục chờ tiền ⇒ mở thẳng màn thanh toán với mã của phụ lục đó', () => {
    state.extensions = [pendingExtension()];
    renderWithIntl(<ExtendBookingDialog booking={BOOKING} onClose={vi.fn()} />);
    expect(screen.getAllByText('XPEABCDEFGH').length).toBeGreaterThan(0);
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByRole('button', { name: 'Huỷ gia hạn' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xong' })).toBeTruthy();
    // Không có lối tự khai "khách đã chuyển khoản" — phụ lục tự lật khi tiền về đủ.
    expect(screen.queryByRole('button', { name: /Xác nhận|đã chuyển/ })).toBeNull();
  });
});
