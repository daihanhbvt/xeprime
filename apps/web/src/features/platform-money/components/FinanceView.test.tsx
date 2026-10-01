import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOOKING_HOLD_OUTCOME,
  BOOKING_HOLD_PURPOSE,
  BOOKING_HOLD_STATUS,
  PERMISSION,
  WALLET_OWNER_TYPE,
  WITHDRAWAL_STATUS,
} from '@xeprime/types';

import { renderWithIntl } from '@/i18n/test-utils';
import type {
  DailyReconciliation,
  PlatformHold,
  PlatformMoneySummary,
  PlatformWithdrawal,
} from '../types';

import { FinanceView } from './FinanceView';

/**
 * Màn Tài chính — gộp "Đối soát tiền vào" + "Vận hành tiền" (01/10/2026).
 *
 * Bốn nhóm khẳng định, mỗi nhóm là một cách sai về TIỀN hoặc về QUYỀN nếu hỏng:
 *
 *  1. **Hàng đợi theo quyền**: thiếu `platform.billing.manage` thì hàng đợi tiền vào ẩn HẲN —
 *     không hiện rồi báo 403. Đổi hàng đợi chỉ giữ lại ngày đối soát, không mang bộ lọc sang.
 *  2. **Kết luận đối soát không nói dối**: chưa nhập số dư thì "chưa tính được", không bao giờ
 *     "khớp" hay 0; lệch là đỏ.
 *  3. **Chốt kết cục chỉ mời kết cục hợp lệ** và cho xem trước ai nhận bao nhiêu.
 *  4. **Từ chối rút tiền gửi LÝ DO NGƯỜI GÕ**, không phải một câu cứng.
 */

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  pathname: '/manage/admin/money',
  params: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.params,
}));

const perms = vi.hoisted(() => ({ granted: new Set<string>() }));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (permission: string) => perms.granted.has(permission),
    hasAny: (...list: string[]) => list.some((p) => perms.granted.has(p)),
    isLoading: false,
  }),
}));

interface QueryState<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => void;
}

function settledQuery<T>(data: T): QueryState<T> {
  return { data, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() };
}

interface WithdrawalPage {
  items: PlatformWithdrawal[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
  overdueCount: number;
}

const summary = vi.hoisted(() => ({}) as QueryState<PlatformMoneySummary>);
const reconciliation = vi.hoisted(() => ({}) as QueryState<DailyReconciliation>);
const holds = vi.hoisted(() => ({}) as QueryState<{ items: PlatformHold[]; meta: unknown }>);
const withdrawals = vi.hoisted(() => ({}) as QueryState<WithdrawalPage>);
const rejectWithdrawal = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const saveBalance = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const markWithdrawalPaid = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

// Trong `vi.hoisted`: factory của `vi.mock` chạy TRƯỚC mọi khai báo cấp module.
const { idle } = vi.hoisted(() => ({
  idle: () => ({ mutate: () => undefined, isPending: false, variables: undefined }),
}));

vi.mock('../hooks/use-platform-money', () => ({
  useMoneySummary: () => summary,
  useDailyReconciliation: () => reconciliation,
  useHolds: () => holds,
  useRefunds: () => ({
    data: { items: [], meta: { page: 1, limit: 20, total: 0, hasNext: false } },
  }),
  useWithdrawalQueue: () => withdrawals,
  useInsuranceQueue: () => ({
    data: { data: [], meta: { page: 1, limit: 20, total: 0, hasNext: false } },
  }),
  useSaveBankBalance: () => saveBalance,
  useSettleHold: idle,
  useMarkRefundPaid: idle,
  useRejectRefund: idle,
  useApproveWithdrawal: idle,
  useRejectWithdrawal: () => rejectWithdrawal,
  useReverseWithdrawal: idle,
  useMarkWithdrawalPaid: () => markWithdrawalPaid,
  useRetryInsurance: idle,
  useVoidInsurance: idle,
}));

vi.mock('@/features/bank-transactions/hooks/use-bank-transactions', () => ({
  useBankTransactions: () => ({
    data: { items: [], meta: { page: 1, limit: 20, total: 0, hasNext: false } },
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useBankTransaction: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useMatchBankTransaction: () => ({ mutate: vi.fn(), isPending: false }),
  useIgnoreBankTransaction: () => ({ mutate: vi.fn(), isPending: false }),
}));

// Hai panel của feature khác — không phải đối tượng của test này, và cả hai tự gọi API.
vi.mock('@/features/admin-bookings/components/AdminBookingDetailDrawer', () => ({
  AdminBookingDetailDrawer: () => null,
}));
vi.mock('@/features/tax/components/TaxPeriodPanel', () => ({ TaxPeriodPanel: () => null }));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

function moneySummary(over: Partial<PlatformMoneySummary> = {}): PlatformMoneySummary {
  return {
    bankIn: {
      count: 3,
      amount: '4200000',
      oldestAt: new Date(Date.now() - 50 * 3_600_000).toISOString(),
    },
    holds: { count: 12, amount: '3600000', disputeCount: 2 },
    refunds: { count: 4, amount: '800000' },
    withdrawals: { count: 5, amount: '9000000', overdueCount: 1 },
    insurance: { count: 0, amount: '0' },
    tax: { period: '2026-10', count: 0, amount: '0', oldestPeriod: null },
    ...over,
  };
}

function reconciled(over: Partial<DailyReconciliation> = {}): DailyReconciliation {
  return {
    date: '2026-10-01',
    platform: {
      serviceFeeRecognized: '400000',
      subscriptionsCollected: '600000',
      total: '1000000',
    },
    custodied: {
      holdsUnsettled: '0',
      holdsUnsettledCount: 0,
      walletTotal: '0',
      walletAvailable: '0',
      walletPending: '0',
      refundsPending: '0',
      refundsPendingCount: 0,
      unmatchedIn: '0',
      unmatchedInCount: 0,
      insuranceReserved: '0',
      taxAccrued: '0',
      total: '0',
    },
    outflow: {
      withdrawalsPaid: '0',
      withdrawalsPaidCount: 0,
      refundsPaid: '0',
      refundsPaidCount: 0,
      total: '0',
    },
    inflow: {
      bankIn: '1000000',
      bankInCount: 3,
      matchedSubscriptions: '600000',
      matchedHolds: '400000',
      unmatched: '0',
      unmatchedCount: 0,
      ignored: '0',
      variance: '0',
    },
    bankBalanceEod: '1000000',
    variance: '0',
    walletDrift: { wallets: 0, amount: '0' },
    ...over,
  } as DailyReconciliation;
}

function hold(over: Partial<PlatformHold> = {}): PlatformHold {
  return {
    id: '01HOLD',
    code: 'XPH23456789',
    tenantId: '01TENANT',
    tenantName: 'Gian hàng A',
    customerName: 'Nguyen Van A',
    vehicleName: 'VinFast VF5',
    bookingRequestId: '01REQ',
    bookingId: '01BOOKING',
    bookingCode: 'BK-000123',
    status: BOOKING_HOLD_STATUS.PAID,
    outcome: null,
    amount: '330000',
    paidAmount: '330000',
    expiresAt: '2026-09-08T03:00:00.000Z',
    freeCancelUntil: '2026-09-16T03:00:00.000Z',
    paidAt: '2026-09-01T03:00:00.000Z',
    releasedAt: null,
    disputeOpen: false,
    refundStatus: null,
    createdAt: '2026-09-01T02:00:00.000Z',
    purpose: BOOKING_HOLD_PURPOSE.ESCROW,
    depositAmount: '300000',
    serviceFeeAmount: '30000',
    vehicleInsuranceAmount: '0',
    personalInsuranceAmount: '0',
    promoDiscountAmount: '0',
    taxAmount: '0',
    ...over,
  } as PlatformHold;
}

function withdrawal(over: Partial<PlatformWithdrawal> = {}): PlatformWithdrawal {
  return {
    id: '01WD',
    code: 'XPW23456789',
    amount: '500000',
    status: WITHDRAWAL_STATUS.PENDING,
    ownerType: WALLET_OWNER_TYPE.TENANT,
    ownerName: 'Gian hàng A',
    bankCode: 'VCB',
    bankAccountNumber: '0123456789',
    bankAccountName: 'CONG TY A',
    dueBy: null,
    overdue: false,
    ageHours: 5,
    paidAt: null,
    bankReference: null,
    rejectReason: null,
    rowVersion: 1,
    createdAt: '2026-09-30T02:00:00.000Z',
    ...over,
  } as PlatformWithdrawal;
}

function renderView(params = '') {
  nav.params = new URLSearchParams(params);
  return renderWithIntl(
    <App>
      <FinanceView />
    </App>,
  );
}

const rail = () => screen.getByRole('navigation', { name: 'Chọn hàng đợi' });

beforeEach(() => {
  nav.replace.mockReset();
  perms.granted = new Set([PERMISSION.PLATFORM_MONEY_MANAGE, PERMISSION.PLATFORM_BILLING_MANAGE]);
  Object.assign(summary, settledQuery(moneySummary()));
  Object.assign(reconciliation, settledQuery(reconciled()));
  Object.assign(
    holds,
    settledQuery({ items: [hold()], meta: { page: 1, limit: 20, total: 1, hasNext: false } }),
  );
  Object.assign(
    withdrawals,
    settledQuery({
      items: [withdrawal()],
      total: 1,
      page: 1,
      limit: 20,
      hasNext: false,
      overdueCount: 0,
    }),
  );
  rejectWithdrawal.mutate.mockReset();
  saveBalance.mutate.mockReset();
});

afterEach(cleanup);

describe('Tài chính — hàng đợi theo quyền và URL', () => {
  it('đủ quyền: mặc định mở hàng đợi tiền vào chưa khớp', () => {
    renderView();

    expect(screen.getByRole('heading', { level: 2, name: 'Tiền vào chưa khớp' })).toBeTruthy();
    expect(within(rail()).getByRole('button', { name: /Tiền vào chưa khớp/ })).toBeTruthy();
  });

  it('thiếu quyền gói: hàng đợi tiền vào ẨN HẲN, kể cả khi URL đòi nó', () => {
    perms.granted = new Set([PERMISSION.PLATFORM_MONEY_MANAGE]);
    renderView('queue=bank-in');

    expect(within(rail()).queryByRole('button', { name: /Tiền vào chưa khớp/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Tiền vào chưa khớp/ })).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Giữ chỗ chờ chốt' })).toBeTruthy();
  });

  it('bấm thẻ đếm là chuyển sang đúng hàng đợi', () => {
    renderView();

    fireEvent.click(screen.getByRole('button', { name: /Rút tiền chờ xử lý/ }));
    expect(nav.replace).toHaveBeenCalledWith('/manage/admin/money?queue=withdrawals', {
      scroll: false,
    });
  });

  it('thẻ thuế: kỳ ĐÃ QUA chưa kê khai ⇒ báo "từ kỳ…" và mở thẳng kỳ đó', () => {
    Object.assign(
      summary,
      settledQuery(
        moneySummary({
          tax: { period: '2026-10', count: 7, amount: '350000', oldestPeriod: '2026-09' },
        }),
      ),
    );
    renderView();

    const card = screen.getByRole('button', { name: /Thuế chưa kê khai/ });
    expect(within(card).getByText('Từ kỳ 2026-09')).toBeTruthy();
    fireEvent.click(card);
    expect(nav.replace).toHaveBeenCalledWith('/manage/admin/money?queue=tax&period=2026-09', {
      scroll: false,
    });
  });

  it('chỉ có quyền GÓI: không gọi tóm tắt tiền, không hiện dải thẻ — chỉ hàng đợi tiền vào', () => {
    perms.granted = new Set([PERMISSION.PLATFORM_BILLING_MANAGE]);
    renderView();

    expect(screen.queryByRole('group', { name: 'Việc đang chờ' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Tiền vào chưa khớp' })).toBeTruthy();
  });

  it('đổi hàng đợi chỉ giữ lại ngày đối soát — bộ lọc của hàng đợi cũ bị bỏ', () => {
    renderView('queue=holds&q=abc&page=3&date=2026-09-30');

    fireEvent.click(within(rail()).getByRole('button', { name: /Hoàn cho khách/ }));
    expect(nav.replace).toHaveBeenCalledWith('/manage/admin/money?queue=refunds&date=2026-09-30', {
      scroll: false,
    });
  });

  it('tiền vào: chọn ĐÍCH không xoá khoảng ngày đang lọc', async () => {
    renderView('queue=bank-in&from=2026-09-01&to=2026-09-30');
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Đích' }));
    fireEvent.click(await screen.findByTitle('Không có mã'));
    const url = String(nav.replace.mock.calls.at(-1)![0]);
    expect(url).toContain('from=2026-09-01');
    expect(url).toContain('to=2026-09-30');
    expect(url).toContain('code=no_code');
  });

  it('thẻ đếm đánh dấu việc khẩn: tranh chấp và lệnh quá hạn', () => {
    renderView();

    expect(screen.getByText('2 đang tranh chấp')).toBeTruthy();
    expect(screen.getByText('1 quá hạn')).toBeTruthy();
  });
});

describe('Tài chính — kết luận đối soát', () => {
  it('khớp: nói "Khớp"', () => {
    renderView();
    expect(screen.getByText('Khớp')).toBeTruthy();
  });

  it('lệch: kết luận nói số lệch, không nói khớp', () => {
    reconciliation.data = reconciled({ variance: '50000' });
    renderView();

    expect(screen.getByText(/^Lệch/)).toBeTruthy();
    expect(screen.queryByText('Khớp')).toBeNull();
  });

  /**
   * Ca quan trọng nhất: CHƯA NHẬP số dư thì chênh lệch **chưa tính được**. Hiện 0 hay "Khớp" ở
   * đây là nói dối hai lần — vừa khẳng định tài khoản rỗng, vừa khẳng định mọi thứ khớp.
   */
  it('chưa nhập số dư: không báo khớp, sổ mở ô nhập và nói "chưa tính được"', () => {
    reconciliation.data = reconciled({ bankBalanceEod: null, variance: null });
    renderView('queue=ledger');

    expect(screen.getByText('Chưa nhập số dư')).toBeTruthy();
    expect(screen.queryByText('Khớp')).toBeNull();
    // Ô số dư mở sẵn để nhập (định dạng tiền), và chênh lệch nói rõ là CHƯA TÍNH — không phải 0.
    expect(screen.getByLabelText('Số dư ngân hàng cuối ngày')).toBeTruthy();
    expect(screen.getByText('Chưa tính được')).toBeTruthy();
    expect(screen.getByText('Nhập số dư để tính')).toBeTruthy();
  });

  it('nhập số dư: ô tiền tự thêm dấu chấm hàng nghìn, gửi đi số NGUYÊN không dấu', async () => {
    reconciliation.data = reconciled({ bankBalanceEod: null, variance: null });
    renderView('queue=ledger&date=2026-09-30');

    const input = screen.getByLabelText('Số dư ngân hàng cuối ngày') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '11264000' } });
    await waitFor(() => expect(input.value).toBe('11.264.000'));

    fireEvent.click(screen.getByRole('button', { name: 'Lưu số dư' }));
    expect(saveBalance.mutate).toHaveBeenCalledTimes(1);
    expect(saveBalance.mutate.mock.calls[0]![0]).toEqual({
      date: '2026-09-30',
      balance: '11264000',
    });
  });

  it('lệch sổ ví: cảnh báo đỏ riêng trong sổ đối soát', () => {
    reconciliation.data = reconciled({ walletDrift: { wallets: 2, amount: '12345' } });
    renderView('queue=ledger');

    const alert = document.querySelector('.ant-alert-error') as HTMLElement;
    expect(alert).not.toBeNull();
    expect(within(alert).getByText(/Lệch sổ ví ở 2 ví/)).toBeTruthy();
  });

  it('dòng "tiền vào chưa khớp" trong sổ là lối tắt sang đúng hàng đợi', () => {
    renderView('queue=ledger');

    fireEvent.click(screen.getAllByRole('button', { name: /Tiền vào chưa khớp/ }).at(-1)!);
    expect(nav.replace).toHaveBeenCalledWith('/manage/admin/money?queue=bank-in', {
      scroll: false,
    });
  });
});

describe('Tài chính — giữ chỗ chờ chốt', () => {
  it('hold ĐÃ TRẢ mà chưa chốt: có lối chốt kết cục; tranh chấp được đánh dấu trên hàng', () => {
    holds.data = {
      items: [hold({ disputeOpen: true })],
      meta: { page: 1, limit: 20, total: 1, hasNext: false },
    };
    renderView('queue=holds');

    expect(screen.getByText('XPH23456789')).toBeTruthy();
    expect(screen.getByText('Đang tranh chấp')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Chốt kết cục' })).toBeTruthy();
  });

  it('hold đã có kết cục: KHÔNG còn nút chốt', () => {
    holds.data = {
      items: [
        hold({ outcome: BOOKING_HOLD_OUTCOME.SETTLED, status: BOOKING_HOLD_STATUS.RELEASED }),
      ],
      meta: { page: 1, limit: 20, total: 1, hasNext: false },
    };
    renderView('queue=holds');

    expect(screen.queryByRole('button', { name: 'Chốt kết cục' })).toBeNull();
  });

  it('góc nhìn "Tất cả" lên được URL — không bị nuốt như giá trị lọc "all"', () => {
    renderView('queue=holds');
    fireEvent.click(screen.getByText('Tất cả'));
    expect(nav.replace).toHaveBeenCalledWith('/manage/admin/money?queue=holds&scope=any', {
      scroll: false,
    });
  });

  it('chọn trạng thái KHÔNG xoá ô tìm kiếm đang có', async () => {
    renderView('queue=holds&scope=any&q=XPH');
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Trạng thái' }));
    fireEvent.click(await screen.findByTitle('Đã giữ chỗ'));
    const url = String(nav.replace.mock.calls.at(-1)![0]);
    expect(url).toContain('q=XPH');
    expect(url).toContain('scope=any');
    expect(url).toContain('status=paid');
  });

  it('chốt kết cục: chỉ mời kết cục CÓ PHÂN BỔ, không chọn sẵn, xem trước ai nhận bao nhiêu', async () => {
    // Mở panel = ghi `?open=` lên URL (F5 và gửi link đều mở lại đúng khoản)…
    const first = renderView('queue=holds');
    fireEvent.click(screen.getByRole('button', { name: 'Chốt kết cục' }));
    expect(nav.replace).toHaveBeenCalledWith('/manage/admin/money?queue=holds&open=01HOLD', {
      scroll: false,
    });
    first.unmount();

    // …và URL đó mở panel.
    renderView('queue=holds&open=01HOLD');
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('Chốt kết cục giữ chỗ')).toBeTruthy();
    expect(within(drawer).getAllByText('XPH23456789').length).toBeGreaterThan(0);

    // Khoản có bốn dòng tiền: kết cục LEGACY (không phân bổ) KHÔNG được mời — giữ trọn hay đẩy
    // hết về một phía là nuốt phần của người khác.
    expect(within(drawer).queryByText('Đã dùng cho chuyến')).toBeNull();
    expect(within(drawer).queryByText('Bồi thường chủ xe')).toBeNull();
    expect(within(drawer).getByText('Đã quyết toán')).toBeTruthy();
    expect(within(drawer).getByText('Huỷ muộn — chia đôi')).toBeTruthy();
    expect(within(drawer).getByText('Đã hoàn khách')).toBeTruthy();

    // Mỗi kết cục nói tiền đi đâu NGAY trên thẻ chọn — và dòng đó là mô tả của chính nút đó.
    const settledRadio = within(drawer).getByRole('radio', { name: 'Đã quyết toán' });
    const settledHelp = document.getElementById(
      settledRadio.getAttribute('aria-describedby') ?? '',
    );
    expect(settledHelp?.textContent).toMatch(/^Chuyến hoàn thành: cọc về chủ xe/);

    // Không chọn sẵn: chưa có xem trước, nút chốt chưa dùng được.
    const radios = within(drawer).getAllByRole('radio') as HTMLInputElement[];
    expect(radios.every((radio) => !radio.checked)).toBe(true);
    expect(within(drawer).queryByText('Ai nhận bao nhiêu')).toBeNull();
    expect(within(drawer).getByText('Chọn một kết cục để xem ai nhận bao nhiêu.')).toBeTruthy();
    expect(
      (within(drawer).getByRole('button', { name: 'Chốt' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    // Chọn "quyết toán" ⇒ cọc về chủ xe, phí về XePrime.
    fireEvent.click(within(drawer).getByRole('radio', { name: 'Đã quyết toán' }));
    expect(within(drawer).getByText('Ai nhận bao nhiêu')).toBeTruthy();
    expect(within(drawer).getByText('Ví chủ xe')).toBeTruthy();
    expect(within(drawer).getByText('Doanh thu XePrime')).toBeTruthy();
    // Dòng tổng = đúng số khách đã chuyển: phân bổ không làm rơi đồng nào.
    expect(within(drawer).getByText('Tổng phân bổ').closest('div')?.textContent).toMatch(/330.000/);
    expect(
      (within(drawer).getByRole('button', { name: 'Chốt: Đã quyết toán' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});

describe('Tài chính — rút tiền', () => {
  it('từ chối: bắt nhập lý do, và gửi ĐÚNG lý do người gõ', async () => {
    renderView('queue=withdrawals');

    // Duyệt là hành động chính nằm ngoài; từ chối nằm trong menu "Thêm thao tác" của dòng.
    fireEvent.click(screen.getByRole('button', { name: 'Thêm thao tác' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Từ chối' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Từ chối yêu cầu rút')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Từ chối' }));
    await waitFor(() =>
      expect(within(dialog).getByText('Nhập lý do (tối thiểu 3 ký tự).')).toBeTruthy(),
    );
    expect(rejectWithdrawal.mutate).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText('Lý do'), {
      target: { value: 'Tên chủ tài khoản không khớp hồ sơ' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Từ chối' }));

    await waitFor(() => expect(rejectWithdrawal.mutate).toHaveBeenCalledTimes(1));
    expect(rejectWithdrawal.mutate.mock.calls[0]![0]).toEqual({
      id: '01WD',
      reason: 'Tên chủ tài khoản không khớp hồ sơ',
    });
  });

  it('xác nhận đã chuyển: mở lệnh KHÁC thì ô mã giao dịch trống — không mang bằng chứng của lệnh trước', async () => {
    markWithdrawalPaid.mutate.mockReset();
    withdrawals.data = {
      items: [
        withdrawal({ id: '01WDA', code: 'XPWAAAAAAAA', status: WITHDRAWAL_STATUS.APPROVED }),
        withdrawal({
          id: '01WDB',
          code: 'XPWBBBBBBBB',
          status: WITHDRAWAL_STATUS.APPROVED,
          rowVersion: 3,
        }),
      ],
      total: 2,
      page: 1,
      limit: 20,
      hasNext: false,
      overdueCount: 0,
    };
    renderView('queue=withdrawals');
    const [openA, openB] = screen.getAllByRole('button', { name: 'Đã chuyển khoản' });

    // Lệnh A: gõ mã rồi HUỶ.
    fireEvent.click(openA!);
    const dialogA = await screen.findByRole('dialog');
    fireEvent.change(within(dialogA).getByLabelText(/Mã giao dịch ngân hàng/), {
      target: { value: 'FT-CUA-LENH-A' },
    });
    fireEvent.click(within(dialogA).getByRole('button', { name: 'Huỷ' }));

    // Lệnh B: ô trống, bấm xác nhận KHÔNG gửi gì.
    fireEvent.click(openB!);
    const dialogB = await screen.findByRole('dialog');
    expect(within(dialogB).getByText('XPWBBBBBBBB')).toBeTruthy();
    const input = within(dialogB).getByLabelText(/Mã giao dịch ngân hàng/) as HTMLInputElement;
    expect(input.value).toBe('');
    fireEvent.click(within(dialogB).getByRole('button', { name: 'Xác nhận đã chuyển' }));
    await waitFor(() =>
      expect(
        within(dialogB).getByText('Nhập mã giao dịch ngân hàng (tối thiểu 3 ký tự).'),
      ).toBeTruthy(),
    );
    expect(markWithdrawalPaid.mutate).not.toHaveBeenCalled();

    // Gõ mã của B ⇒ gửi đúng lệnh B, đúng rowVersion của B.
    fireEvent.change(input, { target: { value: 'FT-CUA-LENH-B' } });
    fireEvent.click(within(dialogB).getByRole('button', { name: 'Xác nhận đã chuyển' }));
    await waitFor(() => expect(markWithdrawalPaid.mutate).toHaveBeenCalledTimes(1));
    expect(markWithdrawalPaid.mutate.mock.calls[0]![0]).toEqual({
      id: '01WDB',
      body: { bankReference: 'FT-CUA-LENH-B', rowVersion: 3 },
    });
  });

  it('lệnh đã chuyển: có lối đảo lệnh (chuyển hụt / sai tài khoản)', () => {
    withdrawals.data = {
      items: [withdrawal({ status: WITHDRAWAL_STATUS.PAID, bankReference: 'FT123' })],
      total: 1,
      page: 1,
      limit: 20,
      hasNext: false,
      overdueCount: 0,
    };
    renderView('queue=withdrawals&view=paid');

    expect(screen.getByRole('button', { name: 'Chuyển hụt / sai tài khoản' })).toBeTruthy();
    expect(screen.getByText('Mã GD FT123')).toBeTruthy();
  });

  it('dòng tổng nói số YÊU CẦU, không nói số lệnh quá hạn', () => {
    renderView('queue=withdrawals');
    expect(screen.getByText('Tổng 1 yêu cầu')).toBeTruthy();
  });
});
