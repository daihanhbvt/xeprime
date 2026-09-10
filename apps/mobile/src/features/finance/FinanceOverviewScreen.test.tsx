import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { PERMISSION, type Permission } from '@xeprime/types';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { FinanceOverviewScreen } from './FinanceOverviewScreen';
import { financeApi, type CustomerRevenue, type FinanceSummary, type VehicleProfit } from './api';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/features/shell/ManageHeader', () => ({ ManageHeader: () => null }));

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

function user(permissions: Permission[]): authApi.CurrentUser {
  return {
    id: '01JQZX0000000000000000000U',
    displayName: 'Chủ shop',
    email: 'owner@xeprime.test',
    avatarUrl: null,
    phone: '0901111111',
    phoneVerified: true,
    hasPassword: true,
    tenant: {
      id: '01JQZX0000000000000000000T',
      name: 'Gian hàng Đà Nẵng',
      slug: 'da-nang',
      status: 'active',
      roleKey: 'shop_owner',
      features: [],
      planCode: null,
      planEndsAt: null,
    },
    platformRole: null,
    permissions,
  } as authApi.CurrentUser;
}

function summary(over: Partial<FinanceSummary> = {}): FinanceSummary {
  return {
    totalIncome: '96500000',
    totalExpense: '24100000',
    balance: '72400000',
    revenue: '82500000',
    cost: '19300000',
    unassignedCost: '3200000',
    unassignedRevenue: '0',
    profit: '63200000',
    profitMarginPercent: 76.6,
    depositHeld: '14000000',
    depositHeldBookings: 7,
    totalDebt: '37025000',
    debtBookings: 16,
    trips: 34,
    ...over,
  } as FinanceSummary;
}

const VEHICLE: VehicleProfit = {
  vehicleId: 'v1',
  vehicleName: 'Vios',
  plateNumber: '51A-12345',
  trips: 12,
  revenue: '18400000',
  cost: '2100000',
  profit: '16300000',
  profitMarginPercent: 88.6,
};

const CUSTOMER: CustomerRevenue = {
  tenantCustomerId: 'c1',
  fullName: 'Nguyễn Văn A',
  trips: 8,
  revenue: '32400000',
  sharePercent: 39.3,
};

async function renderScreen(
  permissions: Permission[],
  options: {
    summary?: FinanceSummary;
    vehicles?: VehicleProfit[];
    customers?: CustomerRevenue[];
  } = {},
) {
  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(user(permissions));

  const summarySpy = jest
    .spyOn(financeApi, 'summary')
    .mockResolvedValue(options.summary ?? summary());
  const seriesSpy = jest
    .spyOn(financeApi, 'series')
    .mockResolvedValue({ granularity: 'day', buckets: [] });
  const byCategorySpy = jest
    .spyOn(financeApi, 'byCategory')
    .mockResolvedValue({ total: '0', items: [] });
  const byVehicleSpy = jest.spyOn(financeApi, 'byVehicle').mockResolvedValue({
    items: options.vehicles ?? [VEHICLE],
    meta: { page: 1, limit: 10, total: (options.vehicles ?? [VEHICLE]).length, hasNext: false },
  });
  const byCustomerSpy = jest.spyOn(financeApi, 'byCustomer').mockResolvedValue({
    items: options.customers ?? [CUSTOMER],
    meta: { page: 1, limit: 10, total: (options.customers ?? [CUSTOMER]).length, hasNext: false },
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ui: ReactElement = withIntl(
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <FinanceOverviewScreen />
      </QueryClientProvider>
    </ReduxProvider>,
  );
  const view = await render(ui);
  return { ...view, summarySpy, seriesSpy, byCategorySpy, byVehicleSpy, byCustomerSpy };
}

afterEach(() => {
  jest.restoreAllMocks();
  mockPush.mockClear();
});

/**
 * `/manage/finance` — Tổng quan tài chính. Ba thứ phải sống sót qua mọi lần sửa, vì chúng là lý
 * do màn này đáng tin:
 *  1. **Ba lớp tiền tách rời** — "Lợi nhuận" (của một kỳ) không đứng lẫn với "Cọc đang giữ"
 *     (tại thời điểm này), và cọc nằm ngoài doanh thu.
 *  2. **Lối đi khớp thẻ** — mỗi ô dẫn ra sổ phải mang `sourceGroup` + `status=approved`, nếu
 *     không thẻ nói một số và danh sách nó dẫn tới nói số khác.
 *  3. **Phần chưa gắn xe / chưa gắn khách không bốc hơi.**
 */
describe('FinanceOverviewScreen — ba lớp tiền', () => {
  it('doanh thu KHÔNG gồm cọc, còn dòng tiền quỹ thì có', async () => {
    const { findByText } = await renderScreen([PERMISSION.FINANCE_VIEW]);

    expect(await findByText('KẾT QUẢ KINH DOANH')).toBeTruthy();
    expect(await findByText('82.500.000 ₫')).toBeTruthy();
    expect(await findByText('DÒNG TIỀN QUỸ')).toBeTruthy();
    expect(await findByText('96.500.000 ₫')).toBeTruthy();
  });

  it('cọc đang giữ và công nợ nằm ở lớp "tại thời điểm này", tách khỏi số liệu kỳ', async () => {
    const { findByText } = await renderScreen([PERMISSION.FINANCE_VIEW]);

    expect(await findByText('TẠI THỜI ĐIỂM NÀY')).toBeTruthy();
    expect(await findByText('14.000.000 ₫')).toBeTruthy();
    expect(await findByText('37.025.000 ₫')).toBeTruthy();
    expect(await findByText('Hai số này không phụ thuộc kỳ đã chọn.')).toBeTruthy();
  });

  it('chưa có doanh thu ⇒ nói "chưa có để tính biên", KHÔNG hiện 0%', async () => {
    const { findByText, queryByText } = await renderScreen([PERMISSION.FINANCE_VIEW], {
      summary: summary({ revenue: '0', profit: '-300000', profitMarginPercent: null }),
    });

    expect(await findByText('Chưa có doanh thu để tính biên')).toBeTruthy();
    expect(queryByText('Biên 0%')).toBeNull();
  });

  it('nói rõ lợi nhuận này CHƯA trừ khấu hao và lãi vay', async () => {
    const { findByText } = await renderScreen([PERMISSION.FINANCE_VIEW]);
    expect(await findByText(/chưa trừ khấu hao/i)).toBeTruthy();
  });
});

describe('FinanceOverviewScreen — lối đi phải khớp thẻ', () => {
  it('ô Doanh thu mở sổ đã lọc theo nhóm nguồn + đã duyệt + đúng kỳ', async () => {
    const { findByLabelText } = await renderScreen([PERMISSION.FINANCE_VIEW]);

    // Tìm theo NHÃN KHẢ TRUY CẬP của ô: chữ "Doanh thu" còn là tên cột trong dải hiệu quả theo xe.
    await fireEvent.press(await findByLabelText(/^Doanh thu: /));

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    const href = mockPush.mock.calls[0]![0] as { pathname: string; params: Record<string, string> };
    expect(href.pathname).toBe('/manage/receipts');
    expect(href.params.type).toBe('income');
    // Thiếu hai tham số này là thẻ nói 82,5tr còn sổ cộng ra 96,5tr.
    expect(href.params.sourceGroup).toBe('business');
    expect(href.params.status).toBe('approved');
    expect(href.params.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(href.params.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('ô Tiền vào KHÔNG lọc nhóm nguồn — nó cố ý gồm cả cọc', async () => {
    const { findByText } = await renderScreen([PERMISSION.FINANCE_VIEW]);

    await fireEvent.press(await findByText('Tiền vào'));

    const href = mockPush.mock.calls[0]![0] as { params: Record<string, string> };
    expect(href.params.type).toBe('income');
    expect(href.params.sourceGroup).toBeUndefined();
  });

  it('ô Cọc đang giữ mở đúng nhóm tiền giữ hộ và KHÔNG mang kỳ', async () => {
    const { findByText } = await renderScreen([PERMISSION.FINANCE_VIEW]);

    await fireEvent.press(await findByText('Cọc đang giữ'));

    const href = mockPush.mock.calls[0]![0] as { params: Record<string, string> };
    expect(href.params.sourceGroup).toBe('held_funds');
    expect(href.params.from).toBeUndefined();
  });

  it('ô Khách còn nợ dẫn sang màn Công nợ, không phải sổ Thu-Chi', async () => {
    const { findByText } = await renderScreen([PERMISSION.FINANCE_VIEW]);

    await fireEvent.press(await findByText('Khách còn nợ'));

    expect(mockPush).toHaveBeenCalledWith('/manage/debts');
  });
});

describe('FinanceOverviewScreen — hai dải xếp hạng', () => {
  it('kỳ mặc định luôn có hai đầu — biểu đồ không bao giờ chạy với khoảng rỗng', async () => {
    const { byVehicleSpy } = await renderScreen([PERMISSION.FINANCE_VIEW]);

    await waitFor(() => expect(byVehicleSpy).toHaveBeenCalled());
    const filters = byVehicleSpy.mock.calls[0]![0];
    expect(filters.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(filters.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('chi phí chung chưa gắn xe được nói ra, không lặng lẽ biến mất', async () => {
    const { findByText } = await renderScreen([PERMISSION.FINANCE_VIEW]);
    expect(await findByText(/Chi phí chung chưa gắn xe: 3\.200\.000 ₫/)).toBeTruthy();
  });

  it('không có chi phí chung thì không hiện dòng chú thích thừa', async () => {
    const { queryByText } = await renderScreen([PERMISSION.FINANCE_VIEW], {
      summary: summary({ unassignedCost: '0' }),
    });
    await waitFor(() => expect(queryByText(/Chi phí chung chưa gắn xe/)).toBeNull());
  });

  it('doanh thu chưa gắn khách được nói ra', async () => {
    const { findByText } = await renderScreen([PERMISSION.FINANCE_VIEW], {
      summary: summary({ unassignedRevenue: '900000' }),
    });
    expect(await findByText(/Chưa gắn khách nào: 900\.000 ₫/)).toBeTruthy();
  });

  it('xe chưa có doanh thu: biên là — chứ không phải 0%', async () => {
    const { findByText, queryByText } = await renderScreen([PERMISSION.FINANCE_VIEW], {
      vehicles: [{ ...VEHICLE, revenue: '0', cost: '0', profit: '0', profitMarginPercent: null }],
    });

    expect(await findByText('Vios')).toBeTruthy();
    // Không có biên thì KHÔNG có viên biên nào — cái phải tránh là hiện "Biên 0%".
    expect(queryByText('Biên 0%')).toBeNull();
  });

  it('hai dải phân trang ĐỘC LẬP — tham số của dải này không rơi vào dải kia', async () => {
    const { byVehicleSpy, byCustomerSpy } = await renderScreen([PERMISSION.FINANCE_VIEW]);

    await waitFor(() => expect(byCustomerSpy).toHaveBeenCalled());
    const vehicleFilters = byVehicleSpy.mock.calls[0]![0];
    const customerFilters = byCustomerSpy.mock.calls[0]![0];
    expect(vehicleFilters.page).toBe(1);
    expect(customerFilters.customerPage).toBe(1);
  });
});

describe('FinanceOverviewScreen — quyền', () => {
  it('thiếu `finance.view`: thay TOÀN BỘ nội dung và KHÔNG gọi API nào', async () => {
    const { findByText, queryByText, summarySpy, byVehicleSpy, byCustomerSpy } = await renderScreen(
      [],
    );

    expect(await findByText('Không có quyền xem số liệu tài chính')).toBeTruthy();
    expect(queryByText('KẾT QUẢ KINH DOANH')).toBeNull();
    expect(summarySpy).not.toHaveBeenCalled();
    expect(byVehicleSpy).not.toHaveBeenCalled();
    expect(byCustomerSpy).not.toHaveBeenCalled();
  });

  it('thiếu `vehicles.view`: dải theo xe vẫn hiện nhưng thẻ KHÔNG mở hồ sơ xe', async () => {
    const { findByText } = await renderScreen([PERMISSION.FINANCE_VIEW]);

    await fireEvent.press(await findByText('Vios'));
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/manage/vehicles/[id]' }),
    );
  });

  it('có `vehicles.view`: thẻ xe mở hồ sơ 360', async () => {
    const { findByLabelText } = await renderScreen([
      PERMISSION.FINANCE_VIEW,
      PERMISSION.VEHICLE_VIEW,
    ]);

    await fireEvent.press(await findByLabelText('Vios'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/manage/vehicles/[id]',
      params: { id: 'v1' },
    });
  });

  it('có `customers.view`: thẻ khách mở hồ sơ khách', async () => {
    const { findByLabelText } = await renderScreen([
      PERMISSION.FINANCE_VIEW,
      PERMISSION.CUSTOMER_VIEW,
    ]);

    await fireEvent.press(await findByLabelText('Nguyễn Văn A'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/manage/customers/[id]',
      params: { id: 'c1' },
    });
  });
});
