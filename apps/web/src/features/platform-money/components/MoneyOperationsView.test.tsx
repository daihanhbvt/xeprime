import { App } from 'antd';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOOKING_HOLD_OUTCOME,
  BOOKING_HOLD_STATUS,
  HOLD_REFUND_REASON,
  HOLD_REFUND_STATUS,
} from '@xeprime/types';

import { renderWithIntl } from '@/i18n/test-utils';
import type { DailyReconciliation, PlatformHold, PlatformHoldRefund } from '../types';

import { MoneyOperationsView } from './MoneyOperationsView';

/**
 * Money operations — ADR 0028 release gate 6–7.
 *
 * Ba khẳng định, mỗi cái là một cách sai về TIỀN nếu hỏng:
 *
 *  1. **Hold đã có kết cục thì không chốt lại được.** Chốt hai lần là một khoản đổi chủ lần thứ
 *     hai; server chặn bằng `updateMany` có điều kiện, màn hình không được mời người ta thử.
 *  2. **`variance ≠ 0` phải là CẢNH BÁO**, không phải một số bình thường trong bảng — nó chính là
 *     thứ cả màn đối chiếu tồn tại để bắt.
 *  3. **Khoản hoàn chưa có tài khoản nhận thì không "đã chuyển" được** — nút vẫn còn nhưng hộp
 *     thoại nói thẳng, vì đó là dữ liệu khách phải khai chứ không phải lỗi của admin.
 */

const holds = vi.hoisted(() => ({
  data: undefined as { items: PlatformHold[]; meta: unknown } | undefined,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
}));

const refunds = vi.hoisted(() => ({
  data: undefined as { items: PlatformHoldRefund[]; meta: unknown } | undefined,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
}));

const reconciliation = vi.hoisted(() => ({
  data: undefined as DailyReconciliation | undefined,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));

vi.mock('../hooks/use-platform-money', () => ({
  useHolds: () => holds,
  useRefunds: () => refunds,
  useDailyReconciliation: () => reconciliation,
  useSettleHold: () => ({ mutate: vi.fn(), isPending: false }),
  useMarkRefundPaid: () => ({ mutate: vi.fn(), isPending: false }),
  useRejectRefund: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

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
    amount: '100000',
    paidAmount: '100000',
    expiresAt: '2026-09-08T03:00:00.000Z',
    freeCancelUntil: '2026-09-16T03:00:00.000Z',
    paidAt: '2026-09-01T03:00:00.000Z',
    releasedAt: null,
    disputeOpen: false,
    refundStatus: null,
    createdAt: '2026-09-01T02:00:00.000Z',
    ...over,
  } as PlatformHold;
}

function refund(over: Partial<PlatformHoldRefund> = {}): PlatformHoldRefund {
  return {
    id: '01REFUND',
    holdId: '01HOLD',
    holdCode: 'XPH23456789',
    tenantName: 'Gian hàng A',
    customerName: 'Nguyen Van A',
    amount: '100000',
    status: HOLD_REFUND_STATUS.PENDING,
    reason: HOLD_REFUND_REASON.EARLY_CANCEL,
    bankCode: 'VCB',
    bankAccountNumber: '0123456789',
    bankAccountName: 'NGUYEN VAN A',
    paidByName: null,
    paidAt: null,
    bankReference: null,
    note: null,
    createdAt: '2026-09-02T03:00:00.000Z',
    ...over,
  } as PlatformHoldRefund;
}

function reconciled(over: Partial<DailyReconciliation> = {}): DailyReconciliation {
  return {
    date: '2026-09-07',
    bankIn: '1000000',
    bankInCount: 3,
    matchedSubscriptions: '600000',
    matchedHolds: '400000',
    unmatched: '0',
    unmatchedCount: 0,
    ignored: '0',
    refundsPaid: '0',
    refundsPaidCount: 0,
    refundsPending: '0',
    refundsPendingCount: 0,
    holdsUnsettled: '0',
    holdsUnsettledCount: 0,
    variance: '0',
    ...over,
  } as DailyReconciliation;
}

function renderView() {
  return renderWithIntl(
    <App>
      <MoneyOperationsView />
    </App>,
  );
}

function openTab(label: string) {
  fireEvent.click(screen.getByRole('tab', { name: label }));
}

beforeEach(() => {
  holds.data = { items: [hold()], meta: { page: 1, limit: 20, total: 1, hasNext: false } };
  holds.isError = false;
  refunds.data = { items: [refund()], meta: { page: 1, limit: 20, total: 1, hasNext: false } };
  refunds.isError = false;
  reconciliation.data = reconciled();
  reconciliation.isLoading = false;
  reconciliation.isError = false;
});

afterEach(cleanup);

describe('Money operations — hàng đợi giữ chỗ', () => {
  it('hold ĐÃ TRẢ mà chưa chốt: có lối chốt kết cục', () => {
    renderView();

    expect(screen.getByText('XPH23456789')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Chốt kết cục' })).toBeTruthy();
  });

  it('hold đã có kết cục: KHÔNG còn nút chốt', () => {
    holds.data = {
      items: [hold({ outcome: BOOKING_HOLD_OUTCOME.KEPT, status: BOOKING_HOLD_STATUS.RELEASED })],
      meta: { page: 1, limit: 20, total: 1, hasNext: false },
    };
    renderView();

    expect(screen.queryByRole('button', { name: 'Chốt kết cục' })).toBeNull();
    expect(screen.getByText('Đã dùng cho chuyến')).toBeTruthy();
  });

  it('đơn còn tranh chấp mở được đánh dấu ngay trên hàng', () => {
    holds.data = {
      items: [hold({ disputeOpen: true })],
      meta: { page: 1, limit: 20, total: 1, hasNext: false },
    };
    renderView();

    expect(screen.getByText('Đang tranh chấp')).toBeTruthy();
  });
});

describe('Money operations — đối chiếu ngày', () => {
  it('khớp: nói rõ không có dòng nào ngoài nhóm', () => {
    renderView();
    openTab('Đối chiếu ngày');

    expect(screen.getByText('Khớp — không có dòng tiền nào ngoài nhóm.')).toBeTruthy();
  });

  it('lệch: cảnh báo kèm số tiền lệch, không lẫn vào bảng', () => {
    reconciliation.data = reconciled({ variance: '50000', unmatched: '50000', unmatchedCount: 1 });
    renderView();
    openTab('Đối chiếu ngày');

    const alert = document.querySelector('.ant-alert-warning') as HTMLElement;
    expect(alert).not.toBeNull();
    expect(within(alert).getByText(/Lệch/)).toBeTruthy();
  });
});
