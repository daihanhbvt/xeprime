import { App } from 'antd';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEPOSIT_STATUS, PERMISSION } from '@xeprime/types';

import { SettlementCard } from './SettlementCard';

/**
 * Thẻ `Phát sinh & Tiền cọc` phía CHỦ XE (Wave 11.1).
 *
 * Điều được khoá: thẻ không được nói mâu thuẫn với chính nó. Trước đây đơn đang thuê mà đã thu
 * cọc hiện nhãn `Không có cọc` ngay bên cạnh dòng `Cọc đã nhận 5.000.000đ`.
 */
const query = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  error: undefined as unknown,
  refetch: vi.fn(),
}));
const perms = vi.hoisted(() => ({ granted: [] as string[] }));

vi.mock('../hooks', () => ({ useSettlement: () => query }));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.includes(p),
    hasAny: (...p: string[]) => p.some((x) => perms.granted.includes(x)),
    isLoading: false,
  }),
}));

const BASE = {
  bookingId: 'BK1',
  depositRequired: '5000000.00',
  depositReceived: '5000000.00',
  surcharges: [],
  surchargeTotal: '0.00',
  proposedRefund: '5000000.00',
  additionalDue: '0.00',
  depositStatus: DEPOSIT_STATUS.RECEIVED,
  refund: null,
  overtime: {
    available: false,
    lateMinutes: 0,
    chargedHours: 0,
    feePerHour: null,
    amount: null,
    formula: null,
  },
};

beforeEach(() => {
  perms.granted = [PERMISSION.PAYMENT_RECORD];
  query.isLoading = false;
  query.isError = false;
  query.data = BASE;
});

afterEach(cleanup);

function renderCard() {
  return render(
    <App>
      <SettlementCard bookingId="BK1" canView />
    </App>,
  );
}

describe('SettlementCard — trạng thái cọc', () => {
  it('đang thuê + đã thu cọc: `Đã nhận cọc`, không phải `Không có cọc`', () => {
    renderCard();
    expect(screen.getByText('Đã nhận cọc')).toBeTruthy();
    expect(screen.queryByText('Không có cọc')).toBeNull();
    // Chưa xong chuyến thì chưa mời hoàn tiền, và cũng không hiện dòng đề xuất hoàn.
    expect(screen.queryByText('Đề xuất hoàn lại')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Đánh dấu đã hoàn cọc' })).toBeNull();
    expect(screen.getByText(/Đang giữ tiền cọc của khách/)).toBeTruthy();
  });

  it('xong chuyến, còn tiền để trả: mở việc hoàn cọc', () => {
    query.data = { ...BASE, depositStatus: DEPOSIT_STATUS.AWAITING_REFUND };
    renderCard();
    expect(screen.getByText('Chờ hoàn cọc')).toBeTruthy();
    expect(screen.getByText('Đề xuất hoàn lại')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đánh dấu đã hoàn cọc' })).toBeTruthy();
  });

  it('phát sinh ăn hết cọc: `Đã quyết toán cọc`, KHÔNG mời hoàn 0 đồng', () => {
    query.data = {
      ...BASE,
      surcharges: [
        {
          id: 'S1',
          category: 'damage',
          amount: '5000000.00',
          reason: 'Hư hại',
          createdByName: null,
          createdAt: '2026-08-13T00:00:00.000Z',
          updatedAt: '2026-08-13T00:00:00.000Z',
        },
      ],
      surchargeTotal: '5000000.00',
      proposedRefund: '0.00',
      depositStatus: DEPOSIT_STATUS.SETTLED,
    };
    renderCard();

    expect(screen.getByText('Đã quyết toán cọc')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Đánh dấu đã hoàn cọc' })).toBeNull();
    expect(screen.getByText(/không còn khoản nào phải hoàn lại/)).toBeTruthy();
  });

  it('có cấu hình cọc nhưng chưa thu: vẫn nói thẳng là chưa ghi nhận', () => {
    query.data = {
      ...BASE,
      depositReceived: '0.00',
      proposedRefund: '0.00',
      depositStatus: DEPOSIT_STATUS.NOT_RECEIVED,
    };
    renderCard();
    // Xuất hiện hai chỗ: nhãn trạng thái ở góc thẻ và giá trị của dòng `Cọc đã nhận`.
    expect(screen.getAllByText('Chưa ghi nhận đã thu cọc').length).toBeGreaterThan(0);
    expect(screen.queryByText('Đề xuất hoàn lại')).toBeNull();
  });
});
