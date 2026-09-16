import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PAYMENT_KIND, PAYMENT_METHOD, PAYMENT_STATUS } from '@xeprime/types';
import { AccountPaymentsView } from './AccountPaymentsView';
import type { AccountPayment, AccountPaymentPage } from '../types';

/**
 * "Tiền của các chuyến đã thuê" — `/account/payments`.
 *
 * Phép kiểm số 1 ở đây là PHONG BÌ, vì đó là chỗ màn này đã vỡ thật:
 * `Cannot read properties of undefined (reading 'paidTotal')`. Nguyên nhân là tổng từng được
 * trả thành khoá thứ ba ngang hàng `data`/`meta`, rồi bị client làm rụng khi nó lấy phần trong
 * phong bì. Test này dựng dữ liệu đúng hình dạng HTTP THẬT (`meta.totals`) và đọc bốn con số —
 * nếu ai dời `totals` ra ngoài `meta` lần nữa thì đỏ ở đây chứ không đỏ trên máy người dùng.
 *
 * Hai điều còn lại là lý do màn này tồn tại tách khỏi màn số dư:
 *
 *  · Dải đầu màn phải nói ra BA loại tiền ở ba chỗ, và trỏ sang màn SỐ DƯ. Bỏ nó đi là để người
 *    dùng đọc con số ở đây rồi tưởng đó là số dư của mình.
 *  · Tiền CỌC phải kèm câu "sẽ được hoàn khi trả xe". Không có câu đó thì một khoản cọc 5 triệu
 *    đọc như tiền đã mất.
 */
const query = vi.hoisted(() => ({
  data: undefined as AccountPaymentPage | undefined,
  isLoading: false,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
}));

vi.mock('../hooks/use-account-payments', () => ({
  useAccountPayments: () => query,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

function row(over: Partial<AccountPayment> = {}): AccountPayment {
  return {
    id: 'p1',
    bookingId: 'b1',
    bookingCode: 'DH2609001',
    tenantName: 'Việt Car Hà Nội',
    vehicleName: 'Mazda 3',
    // Cố ý KHÁC mọi con số ở `totals`: trùng số thì phép kiểm không phân biệt được nó đọc thẻ
    // tổng hay đọc dòng trong bảng.
    amount: '250000',
    currency: 'VND',
    kind: PAYMENT_KIND.RENTAL,
    method: PAYMENT_METHOD.BANK_TRANSFER,
    status: PAYMENT_STATUS.SUCCEEDED,
    paidAt: '2026-09-10T03:00:00.000Z',
    createdAt: '2026-09-10T03:00:00.000Z',
    ...over,
  };
}

/** Đúng hình dạng phong bì HTTP: tổng nằm TRONG `meta`. */
function page(over: Partial<AccountPaymentPage['meta']['totals']> = {}): AccountPaymentPage {
  return {
    data: [row()],
    meta: {
      page: 1,
      limit: 20,
      total: 1,
      hasNext: false,
      totals: {
        paidTotal: '1000000',
        rentalTotal: '700000',
        depositTotal: '300000',
        tripCount: 1,
        ...over,
      },
    },
  };
}

describe('AccountPaymentsView — phong bì và bốn con số', () => {
  it('đọc tổng từ `meta.totals`, không phải khoá ngang hàng `data`', () => {
    query.data = page();
    render(<AccountPaymentsView />);

    expect(screen.getByText('1.000.000 ₫')).toBeTruthy();
    expect(screen.getByText('700.000 ₫')).toBeTruthy();
    expect(screen.getByText('300.000 ₫')).toBeTruthy();
    // Số chuyến là số đếm, không định dạng tiền.
    expect(screen.getByText('Số chuyến')).toBeTruthy();
  });

  it('nói ra ba loại tiền và trỏ sang màn Số dư — không để ai đọc đây thành số dư', () => {
    query.data = page();
    render(<AccountPaymentsView />);

    expect(screen.getByText('Đây là tiền bạn đã trả cho gian hàng')).toBeTruthy();
    const link = screen.getByText('Số dư của tôi').closest('a');
    expect(link?.getAttribute('href')).toBe('/account/balance');
  });

  it('có cọc thì kèm câu cọc sẽ được hoàn; không có cọc thì không hiện câu thừa', () => {
    query.data = page();
    render(<AccountPaymentsView />);
    expect(screen.getByText(/sẽ được hoàn khi bạn trả xe/)).toBeTruthy();

    query.data = page({ depositTotal: '0' });
    render(<AccountPaymentsView />);
    expect(screen.queryAllByText(/sẽ được hoàn khi bạn trả xe/)).toHaveLength(1);
  });

  it('chưa có khoản nào ⇒ màn rỗng có lời giải thích, không phải lỗi', () => {
    query.data = {
      data: [],
      meta: {
        page: 1,
        limit: 20,
        total: 0,
        hasNext: false,
        totals: { paidTotal: '0', rentalTotal: '0', depositTotal: '0', tripCount: 0 },
      },
    };
    render(<AccountPaymentsView />);

    expect(screen.getByText('Bạn chưa có khoản nào được gian hàng ghi nhận.')).toBeTruthy();
  });
});
