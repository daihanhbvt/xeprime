import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { PERMISSION } from '@xeprime/types';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { FinanceEntityPanel } from './FinanceEntityPanel';
import { financeApi, type FinanceScope, type FinanceSummary } from '../api';

/**
 * ĐỒNG HỒ GIẢ — bắt buộc ở mọi file test có RENDER biểu đồ.
 *
 * `BarChart` hẹn một `setTimeout(labelsAppear, animationDuration)` lúc gắn rồi chạy tiếp một
 * `Animated.timing` 500ms, và không prop nào tắt được (`isAnimated={false}` chỉ tắt animation của
 * cột). Cái hẹn đó sống lâu hơn cả môi trường jest: test xong, môi trường bị dỡ, callback mới
 * chạy — worker chết kèm một stack không trỏ vào test nào, hoặc jest treo không thoát.
 */
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

const SUMMARY: FinanceSummary = {
  totalIncome: '20000000',
  totalExpense: '3000000',
  balance: '17000000',
  revenue: '18000000',
  cost: '2500000',
  unassignedCost: '0',
  unassignedRevenue: '0',
  profit: '15500000',
  profitMarginPercent: 86.1,
  depositHeld: '0',
  depositHeldBookings: 0,
  totalDebt: '1200000',
  debtBookings: 2,
  trips: 9,
} as FinanceSummary;

async function renderPanel(
  kind: 'vehicle' | 'customer',
  scope: FinanceScope,
  options: { canCreateReceipt?: boolean } = {},
) {
  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({
    id: 'u1',
    displayName: 'Chủ shop',
    email: 'owner@xeprime.test',
    avatarUrl: null,
    phone: '0901111111',
    phoneVerified: true,
    hasPassword: true,
    tenant: {
      id: 't1',
      name: 'Gian hàng',
      slug: 'g',
      status: 'active',
      roleKey: 'shop_owner',
      features: [],
      planCode: null,
      planEndsAt: null,
    },
    platformRole: null,
    permissions: [PERMISSION.FINANCE_VIEW, PERMISSION.RECEIPT_CREATE],
  } as authApi.CurrentUser);

  const summarySpy = jest.spyOn(financeApi, 'summary').mockResolvedValue(SUMMARY);
  const seriesSpy = jest
    .spyOn(financeApi, 'series')
    .mockResolvedValue({ granularity: 'day', buckets: [] });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ui: ReactElement = withIntl(
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <FinanceEntityPanel
          scope={scope}
          kind={kind}
          {...(options.canCreateReceipt === undefined
            ? {}
            : { canCreateReceipt: options.canCreateReceipt })}
        />
      </QueryClientProvider>
    </ReduxProvider>,
  );
  const view = await render(ui);
  return { ...view, summarySpy, seriesSpy };
}

afterEach(() => {
  jest.restoreAllMocks();
  mockPush.mockClear();
});

/**
 * Khối tiền của MỘT thực thể — MỘT component cho cả hồ sơ xe lẫn hồ sơ khách.
 *
 * Nó dùng lại nguyên bộ endpoint của màn Tổng quan doanh thu, chỉ thêm mệnh đề thu hẹp. Đó là
 * điều làm cho con số ở hồ sơ một chiếc xe **không thể lệch** dòng của nó trong bảng tổng quan.
 */
describe('FinanceEntityPanel — hồ sơ xe', () => {
  it('phạm vi xe đi xuống CẢ hai truy vấn', async () => {
    const { summarySpy, seriesSpy } = await renderPanel('vehicle', { vehicleId: 'v1' });

    await waitFor(() => expect(summarySpy).toHaveBeenCalled());
    expect(summarySpy.mock.calls[0]![1]).toEqual({ vehicleId: 'v1' });
    expect(seriesSpy.mock.calls[0]![1]).toEqual({ vehicleId: 'v1' });
  });

  it('xe hiện doanh thu · chi phí · lợi nhuận · số chuyến', async () => {
    const { findByText } = await renderPanel('vehicle', { vehicleId: 'v1' });

    expect(await findByText('18.000.000 ₫')).toBeTruthy();
    expect(await findByText('2.500.000 ₫')).toBeTruthy();
    expect(await findByText('15.500.000 ₫')).toBeTruthy();
    expect(await findByText(/Biên 86[.,]1%/)).toBeTruthy();
  });

  it('có quyền ghi: lối tạo phiếu mang XE + cờ mở form, KHÔNG mang kỳ đang xem', async () => {
    const { findByText } = await renderPanel(
      'vehicle',
      { vehicleId: 'v1' },
      { canCreateReceipt: true },
    );

    await fireEvent.press(await findByText('Tạo phiếu thu/chi'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/manage/receipts',
      params: { vehicleId: 'v1', create: '1' },
    });
  });

  it('không có quyền ghi: chỉ còn lối ĐỌC sổ', async () => {
    const { findByText, queryByText } = await renderPanel('vehicle', { vehicleId: 'v1' });

    expect(await findByText('Xem trên sổ Thu-Chi')).toBeTruthy();
    expect(queryByText('Tạo phiếu thu/chi')).toBeNull();
  });

  it('lối ra sổ mang phạm vi + kỳ + đã duyệt, KHÔNG mang độ mịn biểu đồ', async () => {
    const { findByText } = await renderPanel('vehicle', { vehicleId: 'v1' });

    await fireEvent.press(await findByText('Xem trên sổ Thu-Chi'));

    const href = mockPush.mock.calls[0]![0] as { params: Record<string, string> };
    expect(href.params.vehicleId).toBe('v1');
    expect(href.params.status).toBe('approved');
    expect(href.params.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(href.params.granularity).toBeUndefined();
  });
});

describe('FinanceEntityPanel — hồ sơ khách', () => {
  it('khách hiện doanh thu · còn nợ · số chuyến, KHÔNG hiện chi phí/lợi nhuận', async () => {
    const { findByText, queryByText } = await renderPanel('customer', {
      tenantCustomerId: 'c1',
    });

    expect(await findByText('18.000.000 ₫')).toBeTruthy();
    expect(await findByText('1.200.000 ₫')).toBeTruthy();
    expect(queryByText('Chi phí')).toBeNull();
    expect(queryByText('Lợi nhuận')).toBeNull();
  });

  it('khách KHÔNG có lối tạo phiếu, kể cả khi đủ quyền', async () => {
    const { findByText, queryByText } = await renderPanel(
      'customer',
      { tenantCustomerId: 'c1' },
      { canCreateReceipt: true },
    );

    await findByText('Xem trên sổ Thu-Chi');
    expect(queryByText('Tạo phiếu thu/chi')).toBeNull();
  });
});
