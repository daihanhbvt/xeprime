import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import { withIntl } from '@/i18n/test-utils';
import { walletApi, WALLET_SCOPE, type WalletSummary } from '@/api/wallet/api';
import { WalletSummaryCard } from './WalletSummaryCard';

jest.mock('@/api/wallet/api', () => ({
  ...jest.requireActual('@/api/wallet/api'),
  walletApi: { summary: jest.fn() },
}));

const summaryMock = walletApi.summary as jest.Mock;

function summary(patch: Partial<WalletSummary> = {}): WalletSummary {
  return {
    available: '500000',
    pending: '120000',
    total: '620000',
    status: 'active',
    minWithdrawAmount: '100000',
    maxBusinessDays: 2,
    ...patch,
  } as WalletSummary;
}

async function renderCard(data: WalletSummary, onWithdraw = jest.fn()) {
  summaryMock.mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = await render(
    withIntl(
      <QueryClientProvider client={client}>
        <WalletSummaryCard scope={WALLET_SCOPE.ACCOUNT} onWithdraw={onWithdraw} />
      </QueryClientProvider>,
    ),
  );
  await waitFor(() => view.getByText('Rút được ngay'));
  return view;
}

beforeEach(() => summaryMock.mockReset());

/**
 * Canh hai luật TIỀN mà web đã ghi và bản native phải giữ nguyên — sai ở đây là khách bấm một nút
 * mà server chắc chắn từ chối, hoặc tưởng rút được nhiều hơn thực tế.
 */
describe('WalletSummaryCard', () => {
  it('hiện ĐỦ BA con số, không gộp thành một', async () => {
    const view = await renderCard(summary());

    expect(view.getByText('Rút được ngay')).toBeTruthy();
    expect(view.getByText('Đang chờ chuyển')).toBeTruthy();
    expect(view.getByText('Tổng XePrime phải trả')).toBeTruthy();
  });

  it('nói rõ đây là sổ công nợ, không phải ví điện tử (ADR 0033 điều 1)', async () => {
    const view = await renderCard(summary());

    expect(view.getByText(/1 điểm = 1đ/)).toBeTruthy();
  });

  it('KHOÁ nút rút khi số dư chưa đạt ngưỡng của server', async () => {
    const view = await renderCard(summary({ available: '50000', minWithdrawAmount: '100000' }));

    expect(view.getByRole('button', { name: 'Rút về ngân hàng' }).props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  it('mở nút rút khi đã đạt ngưỡng', async () => {
    const view = await renderCard(summary({ available: '100000', minWithdrawAmount: '100000' }));

    expect(view.getByRole('button', { name: 'Rút về ngân hàng' }).props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: false }),
    );
  });

  it('ví bị KHOÁ thì không rút được, dù số dư có đủ', async () => {
    const view = await renderCard(summary({ status: 'frozen', available: '9000000' }));

    expect(view.getByText(/Ví đang tạm khoá/)).toBeTruthy();
    expect(view.getByRole('button', { name: 'Rút về ngân hàng' }).props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });
});
