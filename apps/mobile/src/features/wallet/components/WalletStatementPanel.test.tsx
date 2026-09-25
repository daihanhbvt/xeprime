import { fireEvent, render } from '@testing-library/react-native';
import { WALLET_STATEMENT_UNIT } from '@xeprime/types';
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
  it('mặc định thu gọn như khối Thống kê của màn Giao dịch thu chi', async () => {
    const view = await render(
      withIntl(<WalletStatementPanel filters={filters} onFiltersChange={jest.fn()} />),
    );

    expect(useWalletStatementMock).toHaveBeenLastCalledWith(filters, false);
    expect(view.queryByText('Chọn tháng')).toBeNull();

    await fireEvent.press(view.getByText('BẢNG TỔNG HỢP GIAO DỊCH'));

    expect(useWalletStatementMock).toHaveBeenLastCalledWith(filters, true);
    expect(view.getByText('Chọn tháng')).toBeTruthy();
  });

  it('mở khối thì ưu tiên chỉ số và biến động số dư của từng chuyến', async () => {
    useWalletStatementMock.mockReturnValue({
      data: statement(),
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
    });
    const view = await render(
      withIntl(<WalletStatementPanel filters={filters} onFiltersChange={jest.fn()} />),
    );

    await fireEvent.press(view.getByText('BẢNG TỔNG HỢP GIAO DỊCH'));

    expect(view.getByText('4,6')).toBeTruthy();
    expect(view.getByText('13 chuyến')).toBeTruthy();
    expect(view.getByText('59%')).toBeTruthy();
    expect(view.getByText('DH-0001')).toBeTruthy();
    expect(view.getAllByText('+810.000 ₫').length).toBeGreaterThanOrEqual(2);
    expect(view.getByText('Tự lái')).toBeTruthy();
  });
});
