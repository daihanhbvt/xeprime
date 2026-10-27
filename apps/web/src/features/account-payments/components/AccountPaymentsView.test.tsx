import { App } from 'antd';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_TRANSACTION_STATUS } from '@xeprime/types';
import { AccountPaymentsView } from './AccountPaymentsView';
import type { AccountTransaction, AccountTransactionPage } from '../types';

/**
 * Tab "Lịch sử giao dịch" — `/account/payments` (Figma Account / History `21695:27193`).
 *
 * Điều được khoá:
 *  · Mỗi dòng nói đúng DẤU tiền theo góc nhìn của khách (`+` tiền về, `-` tiền đi) và nhãn trạng
 *    thái — không bao giờ in số âm kèm dấu trừ thứ hai.
 *  · Mã của dòng thuộc một chuyến là LIÊN KẾT về chuyến đó; dòng không thuộc chuyến thì chỉ là chữ.
 *  · Bộ lọc sống trên URL (ADR 0004): đổi chip trạng thái là `router.replace` với `?status=`, và
 *    đổi bộ lọc thì về trang 1.
 *  · Lệnh rút còn chờ duyệt có lối "Huỷ yêu cầu"; dòng khác thì không.
 *  · Rỗng có lời giải thích — khác nhau giữa "chưa có gì" và "không khớp bộ lọc".
 */
const query = vi.hoisted(() => ({
  data: undefined as AccountTransactionPage | undefined,
  isLoading: false,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
}));
const lastFilters = vi.hoisted(() => ({ value: null as unknown }));

vi.mock('../hooks/use-account-transactions', () => ({
  useAccountTransactions: (filters: unknown) => {
    lastFilters.value = filters;
    return query;
  },
}));

const cancelWithdrawal = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
vi.mock('@/features/wallet/hooks', () => ({
  useCancelWithdrawal: () => cancelWithdrawal,
}));

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => nav.params,
}));

function row(over: Partial<AccountTransaction> = {}): AccountTransaction {
  return {
    id: 'tx1',
    kind: 'hold_payment',
    title: 'hold_payment',
    code: 'XPH23456789',
    amount: '-320000',
    status: ACCOUNT_TRANSACTION_STATUS.SUCCEEDED,
    occurredAt: '2026-10-27T03:00:39.000Z',
    tripId: 'RQ1',
    bookingCode: null,
    cancellable: false,
    ...over,
  };
}

function page(rows: AccountTransaction[], total = rows.length): AccountTransactionPage {
  return { data: rows, meta: { page: 1, limit: 20, total, hasNext: total > 20 } };
}

function renderView() {
  return render(
    <App>
      <AccountPaymentsView />
    </App>,
  );
}

beforeEach(() => {
  query.data = undefined;
  query.isLoading = false;
  query.isFetching = false;
  query.isError = false;
  nav.params = new URLSearchParams();
  nav.replace.mockReset();
  cancelWithdrawal.mutate.mockReset();
});

describe('AccountPaymentsView — dòng giao dịch', () => {
  it('tiền đi mang dấu "-", tiền về mang dấu "+", kèm nhãn trạng thái', () => {
    query.data = page([
      row(),
      row({
        id: 'tx2',
        kind: 'hold_refund',
        title: 'hold_refund',
        amount: '150000',
        status: ACCOUNT_TRANSACTION_STATUS.PENDING,
      }),
    ]);
    renderView();

    const list = screen.getByRole('list', { name: 'Lịch sử giao dịch' });
    const [paid, refund] = within(list).getAllByRole('listitem');
    expect(within(paid!).getByText('Thanh toán giữ chỗ')).toBeTruthy();
    expect(within(paid!).getByText('-320.000 ₫')).toBeTruthy();
    expect(within(paid!).getByText('Thành công')).toBeTruthy();
    expect(within(refund!).getByText('Hoàn tiền giữ chỗ')).toBeTruthy();
    expect(within(refund!).getByText('+150.000 ₫')).toBeTruthy();
    expect(within(refund!).getByText('Đang chờ')).toBeTruthy();
  });

  it('mã của dòng thuộc chuyến dẫn về chuyến đó; dòng không thuộc chuyến chỉ là chữ', () => {
    query.data = page([
      row(),
      row({ id: 'tx2', kind: 'withdrawal', title: 'withdrawal', code: 'XPW0001', tripId: null }),
    ]);
    renderView();

    expect(screen.getByRole('link', { name: '#XPH23456789' }).getAttribute('href')).toBe(
      '/trips/RQ1',
    );
    expect(screen.getByText('#XPW0001')).toBeTruthy();
    expect(screen.queryByRole('link', { name: '#XPW0001' })).toBeNull();
  });

  it('chỉ lệnh rút còn chờ duyệt mới có "Huỷ yêu cầu"', () => {
    query.data = page([
      row(),
      row({
        id: 'wd1',
        kind: 'withdrawal',
        title: 'withdrawal',
        code: 'XPW0001',
        tripId: null,
        amount: '-500000',
        status: ACCOUNT_TRANSACTION_STATUS.PENDING,
        cancellable: true,
      }),
    ]);
    renderView();

    const cancel = screen.getAllByRole('button', { name: 'Huỷ yêu cầu' });
    expect(cancel).toHaveLength(1);
    fireEvent.click(cancel[0]!);
    // Bấm chỉ mở hộp xác nhận — chưa gọi huỷ.
    expect(screen.getByText('Huỷ yêu cầu rút này?')).toBeTruthy();
    expect(cancelWithdrawal.mutate).not.toHaveBeenCalled();
  });
});

describe('AccountPaymentsView — bộ lọc trên URL', () => {
  it('đọc trạng thái, khoảng ngày và trang từ URL rồi gửi xuống server', () => {
    nav.params = new URLSearchParams('status=pending&from=2026-10-01&to=2026-10-27&page=3');
    query.data = page([row()]);
    renderView();

    expect(lastFilters.value).toEqual({
      status: 'pending',
      from: '2026-10-01',
      to: '2026-10-27',
      page: 3,
    });
    expect(screen.getByRole('button', { name: 'Đang chờ' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('giá trị rác trên URL bị bỏ qua, không gửi xuống server', () => {
    nav.params = new URLSearchParams('status=hacked&from=27-10-2026&page=-2');
    query.data = page([row()]);
    renderView();

    expect(lastFilters.value).toEqual({ status: null, from: null, to: null, page: 1 });
  });

  it('đổi chip trạng thái ⇒ `?status=` mới và về trang 1', () => {
    nav.params = new URLSearchParams('page=4');
    query.data = page([row()]);
    renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Thất bại' }));
    expect(nav.replace).toHaveBeenCalledWith('/account/payments?status=failed', {
      scroll: false,
    });
  });
});

describe('AccountPaymentsView — trạng thái màn', () => {
  it('chưa có giao dịch nào ⇒ lời giải thích, không phải lỗi', () => {
    query.data = page([]);
    renderView();
    expect(screen.getByText('Bạn chưa có giao dịch nào.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('có bộ lọc mà rỗng ⇒ nói là không khớp bộ lọc', () => {
    nav.params = new URLSearchParams('status=failed');
    query.data = page([]);
    renderView();
    expect(screen.getByText('Không có giao dịch nào khớp bộ lọc.')).toBeTruthy();
  });

  it('lỗi tải ⇒ báo lỗi kèm nút thử lại', () => {
    query.isError = true;
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /Thử lại/ }));
    expect(query.refetch).toHaveBeenCalled();
  });
});
