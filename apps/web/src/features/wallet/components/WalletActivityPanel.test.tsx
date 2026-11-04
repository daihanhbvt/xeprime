import { App } from 'antd';
import { cleanup, screen, within } from '@testing-library/react';
import {
  WALLET_ACTIVITY_SOURCE,
  WALLET_ENTRY_KIND,
  WITHDRAWAL_STATUS,
  type WithdrawalStatus,
} from '@xeprime/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/i18n/test-utils';
import type { WalletActivity, WalletActivityPage } from '../types';
import { WalletActivityPanel } from './WalletActivityPanel';

/**
 * TAB "BIẾN ĐỘNG SỐ DƯ" — mọi thứ của khối "Yêu cầu rút" cũ phải còn trên dòng lệnh rút: đích
 * chuyển, chặng đang ở (hạn chuyển / lý do), và nút Huỷ khi — và CHỈ khi — lệnh còn chờ duyệt.
 */
const query = vi.hoisted(() => ({
  data: undefined as WalletActivityPage | undefined,
  isPending: false,
  isFetching: false,
  isError: false,
}));

vi.mock('../hooks', () => ({
  useWalletActivity: () => ({ ...query, refetch: vi.fn() }),
  useCancelWithdrawal: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}));

function entry(overrides: Partial<WalletActivity> = {}): WalletActivity {
  return {
    id: 'E1',
    source: WALLET_ACTIVITY_SOURCE.ENTRY,
    kind: WALLET_ENTRY_KIND.HOLD_RELEASE,
    code: 'DH-0024',
    bookingId: 'B1',
    amount: '500000',
    balanceAfter: '1090000',
    occurredAt: '2026-10-12T03:00:00.000Z',
    cancellable: false,
    withdrawal: null,
    ...overrides,
  };
}

function withdrawal(status: WithdrawalStatus, overrides: Partial<WalletActivity> = {}) {
  return entry({
    id: `W-${status}`,
    source: WALLET_ACTIVITY_SOURCE.WITHDRAWAL,
    kind: null,
    code: 'XPW0001',
    bookingId: null,
    amount: '-500000',
    balanceAfter: null,
    cancellable: status === WITHDRAWAL_STATUS.PENDING,
    withdrawal: {
      status,
      bankCode: 'VCB',
      accountNumberMasked: '••••4567',
      dueBy: '2026-10-15T03:00:00.000Z',
      paidAt: null,
      rejectReason: status === WITHDRAWAL_STATUS.REJECTED ? 'Sai tên chủ tài khoản' : null,
      reverseReason: null,
    },
    ...overrides,
  });
}

function page(items: WalletActivity[]): WalletActivityPage {
  return { items, period: '2026-10', total: items.length, page: 1, limit: 20, hasNext: false };
}

const render = () =>
  renderWithIntl(
    <App>
      <WalletActivityPanel filters={{ period: '2026-10', page: 1 }} onFiltersChange={vi.fn()} />
    </App>,
  );

/** Dòng của bảng chứa một chữ — bảng desktop, không phải thẻ mobile. */
const rowOf = (text: string) => screen.getAllByText(text)[0]!.closest('tr') as HTMLElement;

beforeEach(() => {
  query.data = page([]);
  query.isPending = false;
  query.isError = false;
});

afterEach(cleanup);

describe('WalletActivityPanel', () => {
  it('dòng sổ: loại bút toán, số có dấu, số dư sau, trạng thái Thành công', () => {
    query.data = page([entry()]);
    render();
    const row = within(rowOf('DH-0024'));
    expect(row.getByText('Tiền chuyến hoàn tất')).toBeTruthy();
    expect(row.getByText(/^\+500\.000\s*₫$/)).toBeTruthy();
    expect(row.getByText(/SD: 1\.090\.000/)).toBeTruthy();
    expect(row.getByText('Thành công')).toBeTruthy();
    expect(row.queryByRole('button', { name: 'Huỷ yêu cầu' })).toBeNull();
  });

  it('lệnh rút chờ duyệt: đích chuyển, hạn chuyển, nút Huỷ — không có "số dư sau"', () => {
    query.data = page([withdrawal(WITHDRAWAL_STATUS.PENDING)]);
    render();
    const row = within(rowOf('XPW0001'));
    expect(row.getByText('Rút về tài khoản liên kết')).toBeTruthy();
    expect(row.getByText(/VCB · ••••4567/)).toBeTruthy();
    expect(row.getByText(/Hạn chuyển/)).toBeTruthy();
    expect(row.getByText('Chờ duyệt')).toBeTruthy();
    expect(row.getByRole('button', { name: 'Huỷ yêu cầu' })).toBeTruthy();
    expect(row.queryByText(/SD:/)).toBeNull();
  });

  it('lệnh đã duyệt chờ chuyển: KHÔNG huỷ được nữa', () => {
    query.data = page([withdrawal(WITHDRAWAL_STATUS.APPROVED)]);
    render();
    const row = within(rowOf('XPW0001'));
    expect(row.getByText('Đã duyệt, chờ chuyển')).toBeTruthy();
    expect(row.queryByRole('button', { name: 'Huỷ yêu cầu' })).toBeNull();
  });

  it('lệnh bị từ chối: hiện lý do cho chủ ví', () => {
    query.data = page([withdrawal(WITHDRAWAL_STATUS.REJECTED)]);
    render();
    expect(within(rowOf('XPW0001')).getByText(/Sai tên chủ tài khoản/)).toBeTruthy();
  });

  it('kỳ chưa có biến động ⇒ trạng thái rỗng có lời giải thích', () => {
    render();
    expect(screen.getByText('Tháng này chưa có biến động nào')).toBeTruthy();
  });

  it('lỗi tải lần đầu ⇒ thông báo lỗi có nút thử lại', () => {
    query.data = undefined;
    query.isError = true;
    render();
    expect(screen.getByText('Không tải được biến động số dư.')).toBeTruthy();
  });
});
