import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { withIntl } from '@/i18n/test-utils';
import { bankAccountsApi, BANK_ACCOUNT_SCOPE, type BankAccount } from '@/api/bank-accounts/api';
import { BankAccountList } from './BankAccountList';

jest.mock('@/api/bank-accounts/api', () => ({
  ...jest.requireActual('@/api/bank-accounts/api'),
  bankAccountsApi: {
    list: jest.fn(),
    create: jest.fn(),
  },
}));

const listMock = bankAccountsApi.list as jest.Mock;

const account = {
  id: 'ba1',
  bankCode: 'VCB',
  label: 'Lương',
  accountNumberMasked: '****1234',
  accountName: 'NGUYEN VAN A',
  isDefault: true,
  verifiedAt: null,
} as unknown as BankAccount;

async function renderList(data: BankAccount[] | Error) {
  if (data instanceof Error) listMock.mockRejectedValue(data);
  else listMock.mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <BankAccountList scope={BANK_ACCOUNT_SCOPE.SHOP} title="Tài khoản nhận tiền" />
      </QueryClientProvider>,
    ),
  );
}

beforeEach(() => listMock.mockReset());

/** PR #159: mỗi chủ MỘT tài khoản — một thẻ, "Đổi tài khoản", không còn "Đặt làm mặc định". */
describe('BankAccountList', () => {
  it('hiện MỘT thẻ với số đã che và lối Đổi tài khoản', async () => {
    const view = await renderList([account]);
    await waitFor(() => view.getByText('STK: ****1234'));
    expect(view.getByText('Lương')).toBeTruthy();
    expect(view.getByText('NGUYEN VAN A')).toBeTruthy();
    expect(view.getByText('Đổi tài khoản')).toBeTruthy();
    expect(view.queryByText('Đặt làm mặc định')).toBeNull();
    expect(view.queryByText('Mặc định')).toBeNull();
  });

  it('Đổi tài khoản mở tấm khai ở luồng THAY, không có công tắc mặc định', async () => {
    const view = await renderList([account]);
    await waitFor(() => view.getByText('Đổi tài khoản'));
    fireEvent.press(view.getByText('Đổi tài khoản'));
    await waitFor(() => view.getByText('Đổi tài khoản nhận tiền'));
    expect(view.queryByText('Đặt làm tài khoản nhận tiền mặc định')).toBeNull();
  });

  it('chưa có tài khoản: lời mời Thêm', async () => {
    const view = await renderList([]);
    await waitFor(() => view.getByText('Chưa có tài khoản nhận tiền'));
    expect(view.getByText('Thêm tài khoản')).toBeTruthy();
  });

  it('lỗi tải: dùng loadError', async () => {
    const view = await renderList(new Error('boom'));
    await waitFor(() => view.getByText('Không tải được tài khoản nhận tiền.'));
  });
});
