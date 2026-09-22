import { cleanup, screen } from '@testing-library/react';
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
 *  2. Phần khách TRẢ TAY lúc nhận xe hiện thành dòng riêng — thiếu nó, chủ xe đọc "thay đổi số
 *     dư" nhỏ hơn "doanh thu" rồi tin rằng XePrime đang giữ tiền của mình.
 *  3. Đơn dài hạn hiện đơn giá THÁNG, không phải giá ngày suy ra từ chia 30 (ADR 0011).
 *  4. Chưa ai đánh giá / chưa yêu cầu nào tới hạn ⇒ dấu gạch, KHÔNG phải "0 sao" hay "0%".
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
    taxAmount: '0',
    payAtPickupAmount: '2835000',
    balanceChange: '1215000',
    ...overrides,
  };
}

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
      taxTotal: '0',
      payAtPickupTotal: '2835000',
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
  it('KHÔNG có cột phí sàn — phí dịch vụ do khách trả thêm, không trừ vào doanh thu gian hàng', () => {
    renderWithIntl(<WalletStatementPanel filters={filters} onFiltersChange={vi.fn()} />);

    /*
     * `getAllByText`: `DataTable` dựng CẢ bảng desktop lẫn thẻ mobile trong một lần render
     * (ẩn/hiện bằng CSS), nên mỗi nhãn cột xuất hiện hai lần trong DOM.
     */
    expect(screen.getAllByText('Doanh thu').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Thuế KD').length).toBeGreaterThan(0);
    expect(screen.queryByText('Phí sàn')).toBeNull();
  });

  /**
   * Ca quan trọng nhất: hai con số lệch nhau phải có lời giải thích ngay cạnh, không để người
   * đọc tự suy ra rằng tiền của mình bị giữ.
   */
  it('phần khách trả tay lúc nhận xe hiện thành dòng riêng, có ghi chú không qua XePrime', () => {
    renderWithIntl(<WalletStatementPanel filters={filters} onFiltersChange={vi.fn()} />);

    expect(screen.getByText('Khách trả trực tiếp khi nhận xe')).toBeTruthy();
    expect(screen.getByText(/không đi qua XePrime/)).toBeTruthy();
  });

  it('không có phần trả tay ⇒ giấu dòng đó thay vì hiện 0đ', () => {
    query.data = statement({
      totals: { ...statement().totals, payAtPickupTotal: '0' },
    });
    renderWithIntl(<WalletStatementPanel filters={filters} onFiltersChange={vi.fn()} />);

    expect(screen.queryByText('Khách trả trực tiếp khi nhận xe')).toBeNull();
  });

  it('tuyến hoa hồng không có hoá đơn gói ⇒ không hiện dòng phí gói', () => {
    query.data = statement({
      totals: { ...statement().totals, subscriptionFeeTotal: '0' },
    });
    renderWithIntl(<WalletStatementPanel filters={filters} onFiltersChange={vi.fn()} />);

    expect(screen.queryByText('Phí quản lý & vận hành gói nền tảng')).toBeNull();
    expect(screen.getByText('Thu nhập chủ gian hàng')).toBeTruthy();
  });

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

    expect(screen.getByText('Chưa có đánh giá')).toBeTruthy();
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
    expect(screen.getAllByText('Thuế KD').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Thay đổi SD').length).toBeGreaterThan(0);
  });

  it('full vẫn đủ tám cột — compact là ngoại lệ của khu hẹp, không phải mặc định mới', () => {
    renderWithIntl(<WalletStatementPanel filters={filters} onFiltersChange={vi.fn()} />);

    expect(screen.getAllByText('Hình thức').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Đơn giá').length).toBeGreaterThan(0);
  });

  /**
   * Giờ nhận/trả quyết định số ngày tính tiền, nên cột ngày phải mang GIỜ — `fmt.date` cắt mất
   * nó. Định dạng là `HH:mm · dd/MM`, bỏ năm vì cả bảng đã nằm trong một kỳ người dùng tự chọn.
   */
  it('cột ngày đi/ngày về hiện GIỜ trước rồi tới ngày, không có năm', () => {
    renderWithIntl(<WalletStatementPanel filters={filters} onFiltersChange={vi.fn()} />);

    // 2026-10-12T03:00:00Z = 10:00 ngày 12/10 giờ Việt Nam.
    expect(screen.getAllByText('10:00 · 12/10').length).toBeGreaterThan(0);
    expect(screen.getAllByText('10:00 · 15/10').length).toBeGreaterThan(0);
    expect(screen.queryByText(/2026/)).toBeNull();
  });

  /**
   * Cùng một bảng phục vụ hai người. Gọi một chủ xe có đúng một chiếc xe là "chủ gian hàng"
   * ngay trên dòng nói về thu nhập của chính họ là sai về con người — nhãn đi theo TUYẾN.
   */
  it('tuyến gói: dòng thu nhập gọi là chủ GIAN HÀNG', () => {
    renderWithIntl(<WalletStatementPanel filters={filters} onFiltersChange={vi.fn()} />);

    expect(screen.getByText('Thu nhập chủ gian hàng')).toBeTruthy();
  });

  it('tuyến hoa hồng: dòng thu nhập gọi là chủ XE', () => {
    session.tenant = { roleKey: TENANT_ROLE.SHOP_OWNER, billingMode: BILLING_MODE.COMMISSION };
    renderWithIntl(
      <WalletStatementPanel filters={filters} onFiltersChange={vi.fn()} variant="compact" />,
    );

    expect(screen.getByText('Thu nhập chủ xe')).toBeTruthy();
    expect(screen.queryByText('Thu nhập chủ gian hàng')).toBeNull();
  });

  /** Nhãn đi theo TUYẾN, không theo bố cục — `compact` trong /manage vẫn là chủ gian hàng. */
  it('hình thái compact KHÔNG tự đổi cách gọi người đọc', () => {
    renderWithIntl(
      <WalletStatementPanel filters={filters} onFiltersChange={vi.fn()} variant="compact" />,
    );

    expect(screen.getByText('Thu nhập chủ gian hàng')).toBeTruthy();
  });

  /** Tuyến chưa xác định: backend đang từ chối ghi tiền của họ — không đoán tên gọi. */
  it('chưa xác định tuyến ⇒ nhãn chung, không đoán', () => {
    session.tenant = null;
    renderWithIntl(<WalletStatementPanel filters={filters} onFiltersChange={vi.fn()} />);

    expect(screen.getByText('Thu nhập')).toBeTruthy();
  });

  it('lỗi tải lần đầu hiện màn lỗi có nút thử lại, không phải bảng trắng', () => {
    query.data = undefined;
    query.isError = true;
    renderWithIntl(<WalletStatementPanel filters={filters} onFiltersChange={vi.fn()} />);

    expect(screen.getByText('Không tải được bảng tổng hợp.')).toBeTruthy();
  });
});
