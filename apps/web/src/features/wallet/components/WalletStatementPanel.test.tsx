import { cleanup, fireEvent, screen } from '@testing-library/react';
import { BILLING_MODE, TENANT_ROLE, WALLET_STATEMENT_UNIT } from '@xeprime/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/i18n/test-utils';
import type { WalletStatement, WalletStatementTrip } from '../types';
import { WalletStatementPanel } from './WalletStatementPanel';

/**
 * BẢNG TỔNG HỢP GIAO DỊCH — bốn điều được khoá, tất cả đều là chỗ một bảng tiền nói dối êm ru:
 *
 *  1. KHÔNG có cột "phí sàn" — phí dịch vụ do KHÁCH trả thêm, không trừ vào doanh thu gian hàng
 *     (ADR 0032 điều 2). Một cột như thế là bịa ra khoản khấu trừ không tồn tại.
 *  2. (Các dòng cộng dồn của kỳ đã sang `WalletMonthSummary` — test ở file của nó.)
 *  3. Đơn dài hạn hiện đơn giá THÁNG, không phải giá ngày suy ra từ chia 30 (ADR 0011).
 *  4. Chưa ai đánh giá / chưa yêu cầu nào tới hạn ⇒ dấu gạch, KHÔNG phải "0 sao" hay "0%".
 *  5. Hoa hồng `H` (tuyến hoa hồng — ADR 0064 điều 3) CHỦ XE chịu thật: kỳ có hoa hồng thì có
 *     cột riêng, hiện như một khoản trừ.
 */
const query = vi.hoisted(() => ({
  data: undefined as WalletStatement | undefined,
  isPending: false,
  isFetching: false,
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

function trip(overrides: Partial<WalletStatementTrip> = {}): WalletStatementTrip {
  return {
    bookingId: 'B1',
    code: 'XP3948',
    serviceType: 'self_drive',
    pickupAt: '2026-10-12T03:00:00.000Z',
    returnAt: '2026-10-15T03:00:00.000Z',
    unitAmount: '1350000',
    unitKind: WALLET_STATEMENT_UNIT.DAY,
    revenueAmount: '4050000',
    ownerCommissionAmount: '0',
    taxAmount: '0',
    payAtPickupAmount: '2835000',
    deliveryAmount: '0',
    ownerIncomeAmount: '4050000',
    balanceChange: '1215000',
    ownerPayout: null,
    ...overrides,
  };
}

/** Số tiền như `fmt.money` in ra — khoảng trắng trước `₫` có thể là NBSP. */
const money = (digits: string) => new RegExp(`^${digits.replace(/\./g, '\\.')}\\s*₫$`);

/** Đặc tả 05 §6.1 — tự lái 1 ngày × 780.000đ, chủ xe cá nhân, tuyến hoa hồng. */
const PAYOUT: NonNullable<WalletStatementTrip['ownerPayout']> = {
  rentAmount: '780000',
  rentalDays: 1,
  unitAmount: '780000',
  ownerCommissionAmount: '78000',
  commissionTiers: [
    { fromDay: 1, percent: 10 },
    { fromDay: 3, percent: 7 },
    { fromDay: 8, percent: 3 },
    { fromDay: 31, percent: 0 },
  ],
  taxAmount: '54600',
  vatAmount: '39000',
  pitAmount: '15600',
  vatPercent: 5,
  pitPercent: 2,
  taxTotalPercent: 7,
  taxExemptReason: null,
  ownerNetAmount: '647400',
  payAtPickupRentAmount: '585000',
  ownerPayableAmount: '62400',
  collectsHold: true,
};

function statement(overrides: Partial<WalletStatement> = {}): WalletStatement {
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
    },
    items: [trip()],
    total: 1,
    page: 1,
    limit: 20,
    hasNext: false,
    ...overrides,
  };
}

const filters = { period: '2026-10', page: 1 };

beforeEach(() => {
  query.data = statement();
  session.tenant = { roleKey: TENANT_ROLE.SHOP_OWNER, billingMode: BILLING_MODE.PACKAGE };
  query.isPending = false;
  query.isFetching = false;
  query.isError = false;
});

afterEach(cleanup);

describe('WalletStatementPanel', () => {
  it('KHÔNG có cột phí sàn - phí dịch vụ do khách trả thêm, không trừ vào doanh thu gian hàng', () => {
    renderWithIntl(<WalletStatementPanel filters={filters} onFiltersChange={vi.fn()} />);

    /*
     * `getAllByText`: `DataTable` dựng CẢ bảng desktop lẫn thẻ mobile trong một lần render
     * (ẩn/hiện bằng CSS), nên mỗi nhãn cột xuất hiện hai lần trong DOM.
     */
    expect(screen.getAllByText('Doanh thu').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Thuế khấu trừ').length).toBeGreaterThan(0);
    expect(screen.queryByText('Phí sàn')).toBeNull();
  });

  /**
   * Ca quan trọng nhất: hai con số lệch nhau phải có lời giải thích ngay cạnh, không để người
   * đọc tự suy ra rằng tiền của mình bị giữ.
   */
  it('đơn dài hạn hiện ĐƠN GIÁ THÁNG, không phải giá ngày chia từ gói', () => {
    query.data = statement({
      items: [
        trip({
          serviceType: 'long_term',
          unitAmount: '6000000',
          unitKind: WALLET_STATEMENT_UNIT.MONTH,
        }),
      ],
    });
    renderWithIntl(<WalletStatementPanel filters={filters} onFiltersChange={vi.fn()} />);

    expect(screen.getByText(/6\.000\.000\s*₫\/tháng/)).toBeTruthy();
  });

  it('đơn không có bảng kê giá ⇒ ô đơn giá là dấu gạch, không phải 0đ', () => {
    query.data = statement({ items: [trip({ unitAmount: null, unitKind: null })] });
    const { container } = renderWithIntl(
      <WalletStatementPanel filters={filters} onFiltersChange={vi.fn()} />,
    );

    expect(container.textContent).not.toContain('0 ₫/ngày');
  });

  it('kỳ chưa có đánh giá / chưa yêu cầu nào tới hạn ⇒ dấu gạch, không phải 0 sao hay 0%', () => {
    query.data = statement({
      stats: {
        ratingAvg: null,
        ratingCount: 0,
        completedTripCount: 0,
        responseRatePercent: null,
        responseSampleCount: 0,
        acceptKeepRatePercent: null,
      },
      items: [],
      total: 0,
    });
    renderWithIntl(<WalletStatementPanel filters={filters} onFiltersChange={vi.fn()} />);

    // Nhãn đổi 26/11/2026 (đồng bộ Figma mobile): luôn "Đánh giá (n lượt)"; con số vẫn là dấu gạch.
    expect(screen.getByText('Đánh giá (0 lượt)')).toBeTruthy();
    expect(screen.queryByText('0%')).toBeNull();
    expect(screen.getByText('Tháng này chưa có chuyến nào hoàn thành')).toBeTruthy();
  });

  /**
   * Khu `/account` có menu trái 256px; tám cột ở đó phải cuộn ngang mới ghép được một dòng.
   * Bỏ hai cột MÔ TẢ, giữ nguyên ba cột TIỀN — chủ xe phải đối chiếu được thuế và số dư.
   */
  it('compact bỏ Hình thức và Đơn giá, GIỮ nguyên các cột tiền', () => {
    renderWithIntl(
      <WalletStatementPanel filters={filters} onFiltersChange={vi.fn()} variant="compact" />,
    );

    expect(screen.queryByText('Hình thức')).toBeNull();
    expect(screen.queryByText('Đơn giá')).toBeNull();
    expect(screen.getAllByText('Doanh thu').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Thuế khấu trừ').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Thay đổi SD').length).toBeGreaterThan(0);
  });

  it('full vẫn đủ tám cột - compact là ngoại lệ của khu hẹp, không phải mặc định mới', () => {
    renderWithIntl(<WalletStatementPanel filters={filters} onFiltersChange={vi.fn()} />);

    expect(screen.getAllByText('Hình thức').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Đơn giá').length).toBeGreaterThan(0);
  });

  /**
   * Giờ nhận/trả quyết định số ngày tính tiền, nên cột ngày phải mang GIỜ — `fmt.date` cắt mất
   * nó. Định dạng là `HH:mm  dd/MM` (`DATE_TIME_SEPARATOR`), bỏ năm vì cả bảng đã nằm trong
   * một kỳ người dùng tự chọn.
   */
  it('cột ngày đi/ngày về hiện GIỜ trước rồi tới ngày, không có năm', () => {
    renderWithIntl(<WalletStatementPanel filters={filters} onFiltersChange={vi.fn()} />);

    // 2026-10-12T03:00:00Z = 10:00 ngày 12/10 giờ Việt Nam.
    // getByText gộp khoảng trắng: hai NBSP của DATE_TIME_SEPARATOR khớp một dấu cách.
    expect(screen.getAllByText('10:00 12/10').length).toBeGreaterThan(0);
    expect(screen.getAllByText('10:00 15/10').length).toBeGreaterThan(0);
    expect(screen.queryByText(/2026/)).toBeNull();
  });

  it('kỳ có hoa hồng ⇒ cột "Phí dịch vụ - Chủ xe", hiện như khoản TRỪ', () => {
    session.tenant = { roleKey: TENANT_ROLE.SHOP_OWNER, billingMode: BILLING_MODE.COMMISSION };
    query.data = statement({
      items: [trip({ ownerCommissionAmount: '140000', taxAmount: '200000' })],
      totals: {
        ...statement().totals,
        ownerCommissionTotal: '140000',
        taxTotal: '200000',
        subscriptionFeeTotal: '0',
        ownerIncome: '3710000',
      },
    });
    renderWithIntl(
      <WalletStatementPanel filters={filters} onFiltersChange={vi.fn()} variant="compact" />,
    );

    expect(screen.getAllByText('Phí dịch vụ - Chủ xe').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^−140\.000\s*₫$/).length).toBeGreaterThanOrEqual(1);
  });

  it('kỳ không có hoa hồng (tuyến gói) ⇒ không có cột toàn số 0', () => {
    renderWithIntl(<WalletStatementPanel filters={filters} onFiltersChange={vi.fn()} />);

    expect(screen.queryByText('Phí dịch vụ - Chủ xe')).toBeNull();
  });

  /**
   * Bảng cộng ví của TỪNG chuyến (ADR 0068 điều 5) — cùng khối với hộp duyệt và chi tiết đơn, mở
   * ngay dưới dòng. Đơn lập tay (không bảng phí) không có gì để mở.
   */
  it('dòng có bảng cộng ví ⇒ mở rộng được và hiện đủ (a), (b), số cộng ví', () => {
    query.data = statement({ items: [trip({ ownerPayout: PAYOUT })] });
    const { container } = renderWithIntl(
      <WalletStatementPanel filters={filters} onFiltersChange={vi.fn()} />,
    );

    expect(screen.queryByText('Số tiền cộng ví (A − B)')).toBeNull();
    const toggle = container.querySelector('button.ant-table-row-expand-icon-collapsed');
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle!);

    expect(screen.getByText('Thu nhập chủ xe (A)')).toBeTruthy();
    expect(screen.getByText('Khách thanh toán trực tiếp (B)')).toBeTruthy();
    expect(screen.getByText('Số tiền cộng ví (A − B)')).toBeTruthy();
    expect(screen.getAllByText(money('62.400')).length).toBeGreaterThan(0);
    expect(container.querySelector('[aria-label="Bảng cộng ví chuyến XP3948"]')).toBeTruthy();
  });

  it('đơn lập tay (không bảng phí) ⇒ dòng không mở rộng được', () => {
    query.data = statement({ items: [trip({ ownerPayout: null })] });
    const { container } = renderWithIntl(
      <WalletStatementPanel filters={filters} onFiltersChange={vi.fn()} />,
    );

    expect(container.querySelector('button.ant-table-row-expand-icon-collapsed')).toBeNull();
  });

  /** Phí giao `G` của từng chuyến: khách trả tận tay, không nằm trong doanh thu hay bảng cộng ví. */
  it('kỳ có phí giao xe ⇒ cột "Phí giao xe" mang số của từng chuyến; không có ⇒ không có cột', () => {
    query.data = statement({
      items: [trip({ deliveryAmount: '100000' }), trip({ bookingId: 'B2', code: 'XP4000' })],
      totals: { ...statement().totals, deliveryTotal: '100000' },
    });
    renderWithIntl(<WalletStatementPanel filters={filters} onFiltersChange={vi.fn()} />);
    expect(screen.getAllByText('Phí giao xe').length).toBeGreaterThan(0);
    expect(screen.getAllByText(money('100.000')).length).toBeGreaterThanOrEqual(1);
    cleanup();

    query.data = statement();
    renderWithIntl(<WalletStatementPanel filters={filters} onFiltersChange={vi.fn()} />);
    expect(screen.queryByText('Phí giao xe')).toBeNull();
  });

  it('lỗi tải lần đầu hiện màn lỗi có nút thử lại, không phải bảng trắng', () => {
    query.data = undefined;
    query.isError = true;
    renderWithIntl(<WalletStatementPanel filters={filters} onFiltersChange={vi.fn()} />);

    expect(screen.getByText('Không tải được bảng tổng hợp.')).toBeTruthy();
  });
});
