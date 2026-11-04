import { cleanup, screen } from '@testing-library/react';
import { BILLING_MODE, TENANT_ROLE } from '@xeprime/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/i18n/test-utils';
import type { WalletStatement } from '../types';
import { WalletMonthSummary } from './WalletMonthSummary';

/**
 * THẺ TỔNG HỢP THÁNG — các dòng cộng dồn của kỳ (chuyển từ đáy bảng tổng hợp sang cột phải của
 * trang Quản lý ví, 04/11/2026). Ba điều được khoá:
 *
 *  1. Phần khách TRẢ TAY lúc nhận xe hiện thành dòng riêng khi có — thiếu nó, chủ xe đọc "thay
 *     đổi số dư" nhỏ hơn "thu nhập" rồi tin rằng XePrime đang giữ tiền của mình. Không có thì giấu.
 *  2. Các dòng chỉ-khi-khác-0 (phí gói, phí giao xe, phí dịch vụ – chủ xe) không hiện "0đ".
 *  3. Dòng thu nhập gọi người đọc theo TUYẾN — chủ gian hàng / chủ xe / nhãn chung.
 */
const query = vi.hoisted(() => ({
  data: undefined as WalletStatement | undefined,
  isPending: false,
  isError: false,
}));

const session = vi.hoisted(() => ({
  tenant: null as { roleKey: string; billingMode: string } | null,
}));

vi.mock('../hooks', () => ({
  useWalletStatement: () => ({ ...query, refetch: vi.fn() }),
}));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { tenant: session.tenant } }),
}));

function statement(totals: Partial<WalletStatement['totals']> = {}): WalletStatement {
  return {
    periodKey: '2026-10',
    stats: {
      ratingAvg: 5,
      ratingCount: 3,
      completedTripCount: 14,
      responseRatePercent: 100,
      responseSampleCount: 6,
      acceptKeepRatePercent: 83,
    },
    totals: {
      revenueTotal: '4050000',
      ownerCommissionTotal: '0',
      taxTotal: '0',
      payAtPickupTotal: '2835000',
      deliveryTotal: '0',
      balanceChangeTotal: '1215000',
      subscriptionFeeTotal: '1000000',
      ownerIncome: '3050000',
      ...totals,
    },
    items: [],
    total: 0,
    page: 1,
    limit: 20,
    hasNext: false,
  };
}

const filters = { period: '2026-10', page: 1 };
const render = () => renderWithIntl(<WalletMonthSummary filters={filters} />);

beforeEach(() => {
  query.data = statement();
  query.isPending = false;
  query.isError = false;
  session.tenant = { roleKey: TENANT_ROLE.SHOP_OWNER, billingMode: BILLING_MODE.PACKAGE };
});

afterEach(cleanup);

describe('WalletMonthSummary', () => {
  it('tiêu đề nói đúng tháng đang xem, và có số chuyến của kỳ', () => {
    render();
    expect(screen.getByText('Tổng hợp tháng 10/2026')).toBeTruthy();
    expect(screen.getByText('14 chuyến')).toBeTruthy();
  });

  it('phần khách trả tay lúc nhận xe hiện thành dòng riêng, có ghi chú không qua XePrime', () => {
    render();
    expect(screen.getByText('Khách thanh toán trực tiếp khi nhận xe')).toBeTruthy();
    expect(screen.getByText(/không đi qua XePrime/)).toBeTruthy();
  });

  it('không có phần trả tay ⇒ giấu dòng đó thay vì hiện 0đ', () => {
    query.data = statement({ payAtPickupTotal: '0' });
    render();
    expect(screen.queryByText('Khách thanh toán trực tiếp khi nhận xe')).toBeNull();
  });

  it('tuyến hoa hồng không có hoá đơn gói ⇒ không hiện dòng phí gói', () => {
    query.data = statement({ subscriptionFeeTotal: '0' });
    render();
    expect(screen.queryByText('Phí quản lý & vận hành gói nền tảng')).toBeNull();
    expect(screen.getByText('Thu nhập chủ gian hàng')).toBeTruthy();
  });

  it('kỳ có hoa hồng ⇒ dòng tổng phí dịch vụ – chủ xe, hiện như khoản TRỪ', () => {
    query.data = statement({ ownerCommissionTotal: '140000' });
    render();
    expect(screen.getByText('Tổng phí dịch vụ – Chủ xe')).toBeTruthy();
    expect(screen.getAllByText(/^−140\.000\s*₫$/).length).toBe(1);
  });

  it('kỳ không có hoa hồng ⇒ không có dòng 0đ', () => {
    render();
    expect(screen.queryByText('Tổng phí dịch vụ – Chủ xe')).toBeNull();
  });

  it('kỳ có phí giao xe ⇒ dòng riêng kèm ghi chú; không có ⇒ giấu', () => {
    query.data = statement({ deliveryTotal: '100000' });
    render();
    expect(screen.getByText('Phí giao xe khách trả trực tiếp')).toBeTruthy();
    expect(screen.getByText(/không tính phí dịch vụ và thuế/)).toBeTruthy();
    cleanup();

    query.data = statement();
    render();
    expect(screen.queryByText('Phí giao xe khách trả trực tiếp')).toBeNull();
  });

  it('tuyến hoa hồng: dòng thu nhập gọi là chủ XE', () => {
    session.tenant = { roleKey: TENANT_ROLE.SHOP_OWNER, billingMode: BILLING_MODE.COMMISSION };
    render();
    expect(screen.getByText('Thu nhập chủ xe')).toBeTruthy();
    expect(screen.queryByText('Thu nhập chủ gian hàng')).toBeNull();
  });

  /** Tuyến chưa xác định: backend đang từ chối ghi tiền của họ — không đoán tên gọi. */
  it('chưa xác định tuyến ⇒ nhãn chung, không đoán', () => {
    session.tenant = null;
    render();
    expect(screen.getByText('Thu nhập')).toBeTruthy();
  });

  it('lỗi tải lần đầu ⇒ thông báo lỗi có nút thử lại', () => {
    query.data = undefined;
    query.isError = true;
    render();
    expect(screen.getByText('Không tải được bảng tổng hợp.')).toBeTruthy();
  });
});
