import { fireEvent, render } from '@testing-library/react-native';
import { WALLET_STATEMENT_UNIT } from '@xeprime/types';
import { nowInAppTz } from '@xeprime/domain';
import { withIntl } from '@/i18n/test-utils';
import type {
  WalletStatement,
  WalletStatementFilters,
  WalletStatementTrip,
} from '@/api/wallet/api';
import { useWalletStatement } from '../hooks/use-wallet';
import { WalletStatementPanel } from './WalletStatementPanel';

jest.mock('../hooks/use-wallet', () => ({
  useWalletStatement: jest.fn(),
}));

jest.mock('@/features/auth/hooks/use-auth', () => ({
  useCurrentUser: () => ({ data: null }),
}));

const useWalletStatementMock = useWalletStatement as jest.Mock;
const filters: WalletStatementFilters = { period: '2026-09', page: 1 };

function trip(overrides: Partial<WalletStatementTrip> = {}): WalletStatementTrip {
  return {
    bookingId: 'B1',
    code: 'DH-0001',
    serviceType: 'self_drive',
    pickupAt: '2026-09-18T03:00:00.000Z',
    returnAt: '2026-09-18T06:00:00.000Z',
    unitAmount: '900000',
    unitKind: WALLET_STATEMENT_UNIT.DAY,
    revenueAmount: '900000',
    taxAmount: '90000',
    payAtPickupAmount: '0',
    balanceChange: '810000',
    ...overrides,
  };
}

function statement(): WalletStatement {
  return {
    periodKey: '2026-09',
    stats: {
      ratingAvg: 4.6,
      ratingCount: 10,
      completedTripCount: 13,
      responseRatePercent: 59,
      responseSampleCount: 17,
      acceptKeepRatePercent: 82,
    },
    totals: {
      revenueTotal: '900000',
      taxTotal: '90000',
      payAtPickupTotal: '0',
      balanceChangeTotal: '810000',
      subscriptionFeeTotal: '0',
      ownerIncome: '810000',
    },
    items: [trip()],
    total: 1,
    page: 1,
    limit: 20,
    hasNext: false,
  };
}

beforeEach(() => {
  useWalletStatementMock.mockReset();
  useWalletStatementMock.mockReturnValue({
    data: undefined,
    isError: false,
    isFetching: false,
    refetch: jest.fn(),
  });
});

describe('WalletStatementPanel', () => {
  /*
   * Đúng web (25/09/2026): khối LUÔN hiện và LUÔN tải. Bản trước thu gọn mặc định và chỉ tải khi
   * mở — một khác biệt web không có.
   */
  it('luôn hiện và luôn tải, không cần mở khối', async () => {
    const view = await render(
      withIntl(<WalletStatementPanel filters={filters} onFiltersChange={jest.fn()} />),
    );

    expect(useWalletStatementMock).toHaveBeenLastCalledWith(filters, true);
    expect(view.getByText('Chọn tháng')).toBeTruthy();
  });

  /*
   * Web chọn được MỌI tháng quá khứ (`DatePicker` + `maxDate` = hôm nay). Bản native trước chỉ có
   * 12 tháng gần nhất.
   */
  it('‹ lùi một kỳ (về trang 1); › khoá ở tháng hiện tại — tháng sau chưa xảy ra', async () => {
    const onFiltersChange = jest.fn();
    const current = nowInAppTz().format('YYYY-MM');
    const view = await render(
      withIntl(
        <WalletStatementPanel
          filters={{ period: current, page: 3 }}
          onFiltersChange={onFiltersChange}
        />,
      ),
    );

    await fireEvent.press(view.getByLabelText('Trước · Chọn tháng'));
    expect(onFiltersChange).toHaveBeenCalledWith({
      period: nowInAppTz().subtract(1, 'month').format('YYYY-MM'),
      page: 1,
    });

    const next = view.getByLabelText('Tiếp tục · Chọn tháng');
    expect(next.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('kỳ rất cũ (ngoài 12 tháng gần nhất) vẫn đi tiếp được bằng ›', async () => {
    const onFiltersChange = jest.fn();
    const view = await render(
      withIntl(
        <WalletStatementPanel
          filters={{ period: '2024-01', page: 1 }}
          onFiltersChange={onFiltersChange}
        />,
      ),
    );

    await fireEvent.press(view.getByLabelText('Tiếp tục · Chọn tháng'));
    expect(onFiltersChange).toHaveBeenCalledWith({ period: '2024-02', page: 1 });
  });

  it('ưu tiên chỉ số và biến động số dư của từng chuyến', async () => {
    useWalletStatementMock.mockReturnValue({
      data: statement(),
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
    });
    const view = await render(
      withIntl(<WalletStatementPanel filters={filters} onFiltersChange={jest.fn()} />),
    );

    expect(view.getByText('4,6')).toBeTruthy();
    expect(view.getByText('13 chuyến')).toBeTruthy();
    expect(view.getByText('59%')).toBeTruthy();
    expect(view.getByText('DH-0001')).toBeTruthy();
    expect(view.getAllByText('+810.000 ₫').length).toBeGreaterThanOrEqual(2);
    expect(view.getByText('Tự lái')).toBeTruthy();
  });
});
