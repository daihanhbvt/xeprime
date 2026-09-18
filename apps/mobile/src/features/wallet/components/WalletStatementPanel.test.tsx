import { fireEvent, render } from '@testing-library/react-native';
import { withIntl } from '@/i18n/test-utils';
import type { WalletStatementFilters } from '@/api/wallet/api';
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
});
