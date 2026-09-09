import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  BOOKING_STATUS,
  FEATURE_STATE,
  type FeatureState,
  PERMISSION,
  PLAN_FEATURE,
  type PlanFeature,
  RECEIPT_SOURCE_GROUP,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
  SERVICE_TYPE,
  TENANT_STATUS,
  type Permission,
  type TenantStatus,
} from '@xeprime/types';
import { ApiClientError } from '@xeprime/api-client';
import * as authApi from '@/features/auth/api';
import { bookingsApi, type BookingListItem } from '@/features/bookings/api';
import { financeApi, receiptsApi, type FinanceSummary } from '@/features/finance/api';
import { tenantsApi } from '@/features/shop/api';
import { vehiclesApi } from '@/features/vehicles/api';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { ShopDashboardScreen } from './ShopDashboardScreen';

const mockPush = jest.fn();

/** Cờ NĂNG LỰC THEO GÓI đi kèm phiên — union, không phải chuỗi trần (ADR 0005). */
type TenantFeature = { feature: PlanFeature; state: FeatureState };

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  /* Chạy callback lúc mount, cleanup lúc unmount — đủ để mô phỏng "màn đang focus". */
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/features/shell/ManageHeader', () => ({ ManageHeader: () => null }));

function currentUser(
  permissions: Permission[],
  {
    status = TENANT_STATUS.ACTIVE,
    features = [],
  }: { status?: TenantStatus; features?: TenantFeature[] } = {},
): authApi.CurrentUser {
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
      status,
      roleKey: 'shop_owner',
      features,
      planCode: null,
      planEndsAt: null,
    },
    platformRole: null,
    permissions,
  };
}

function booking(overrides: Partial<BookingListItem> = {}): BookingListItem {
  return {
    id: '01JQZX0000000000000000000K',
    code: 'BK001',
    vehicleId: '01JQZX0000000000000000000V',
    vehicleName: 'Toyota Vios',
    vehiclePlate: '43A-12345',
    customerName: 'Nguyễn Văn An',
    customerPhone: '0901234567',
    status: BOOKING_STATUS.ACTIVE,
    serviceType: SERVICE_TYPE.SELF_DRIVE,
    longTermPackageMonths: null,
    pickupAt: '2026-09-08T02:00:00.000Z',
    returnAt: '2026-09-10T02:00:00.000Z',
    totalAmount: '2000000',
    paidAmount: '1000000',
    surchargeTotal: '0',
    amountDue: '2000000',
    otherCollected: '0',
    ...overrides,
  } as BookingListItem;
}

const SUMMARY: FinanceSummary = {
  totalIncome: '10000000',
  totalExpense: '3000000',
  balance: '7000000',
  revenue: '8000000',
  cost: '3000000',
  unassignedCost: '0',
  unassignedRevenue: '0',
  profit: '5000000',
  profitMarginPercent: 62.5,
  depositHeld: '4000000',
  depositHeldBookings: 2,
  totalDebt: '1000000',
  debtBookings: 1,
  trips: 6,
};

interface Options {
  fleetError?: boolean;
  summaryError?: boolean;
  bookingsError?: boolean;
  status?: TenantStatus;
  features?: TenantFeature[];
  vehicleTotal?: number;
}

async function renderScreen(permissions: Permission[], options: Options = {}) {
  const {
    fleetError = false,
    summaryError = false,
    bookingsError = false,
    status = TENANT_STATUS.ACTIVE,
    features = [],
    vehicleTotal = 12,
  } = options;

  jest
    .spyOn(authApi, 'fetchCurrentUser')
    .mockResolvedValue(currentUser(permissions, { status, features }));

  const fail = () =>
    Promise.reject(
      new ApiClientError({ status: 500, code: 'INTERNAL_ERROR', message: 'Hỏng' }),
    );

  const fleetSpy = jest.spyOn(vehiclesApi, 'fleetSummary');
  if (fleetError) fleetSpy.mockImplementation(fail);
  else
    fleetSpy.mockResolvedValue({
      total: vehicleTotal,
      available: 9,
      renting: 3,
      maintenance: 0,
      inactive: 0,
    });

  const bookingsSpy = jest.spyOn(bookingsApi, 'list');
  if (bookingsError) bookingsSpy.mockImplementation(fail);
  else
    bookingsSpy.mockResolvedValue({
      items: [booking()],
      meta: { page: 1, limit: 6, total: 1, hasNext: false },
    });

  const summarySpy = jest.spyOn(financeApi, 'summary');
  if (summaryError) summarySpy.mockImplementation(fail);
  else summarySpy.mockResolvedValue(SUMMARY);

  const receiptsSpy = jest.spyOn(receiptsApi, 'list').mockResolvedValue({
    items: [],
    meta: { page: 1, limit: 5, total: 0, hasNext: false },
  });

  const shopSpy = jest.spyOn(tenantsApi, 'myShop');

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = await render(
    withIntl(
      <ReduxProvider store={store}>
        <QueryClientProvider client={queryClient}>
          <ShopDashboardScreen />
        </QueryClientProvider>
      </ReduxProvider>,
    ),
  );
  return { ...view, fleetSpy, bookingsSpy, summarySpy, receiptsSpy, shopSpy };
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockPush.mockClear();
});

const FULL: Permission[] = [
  PERMISSION.TENANT_VIEW,
  PERMISSION.VEHICLE_VIEW,
  PERMISSION.BOOKING_VIEW,
  PERMISSION.FINANCE_VIEW,
];

describe('ShopDashboardScreen — không gọi API cho khối thiếu quyền', () => {
  it('thiếu `finance.view`: KHÔNG có thẻ tiền và KHÔNG gọi endpoint tiền', async () => {
    const view = await renderScreen([PERMISSION.VEHICLE_VIEW, PERMISSION.BOOKING_VIEW]);

    await view.findByText('Xe sẵn sàng');
    expect(view.queryByText('Doanh thu')).toBeNull();
    expect(view.summarySpy).not.toHaveBeenCalled();
    expect(view.receiptsSpy).not.toHaveBeenCalled();
  });

  it('thiếu `bookings.view`: KHÔNG gọi `/bookings` và không có ba khối đơn', async () => {
    const view = await renderScreen([PERMISSION.VEHICLE_VIEW]);

    await view.findByText('Xe sẵn sàng');
    expect(view.bookingsSpy).not.toHaveBeenCalled();
    expect(view.queryByText('Đơn gần đây')).toBeNull();
  });

  it('thiếu `vehicles.view`: KHÔNG gọi đếm đội xe', async () => {
    const view = await renderScreen([PERMISSION.BOOKING_VIEW]);

    await view.findByText('Đơn gần đây');
    expect(view.fleetSpy).not.toHaveBeenCalled();
  });

  it('gói KHÔNG có tính năng tài chính: khối tiền biến mất dù có `finance.view`', async () => {
    const view = await renderScreen(FULL, {
      features: [{ feature: PLAN_FEATURE.FINANCE, state: FEATURE_STATE.HIDDEN }],
    });

    await view.findByText('Xe sẵn sàng');
    expect(view.queryByText('Doanh thu')).toBeNull();
    expect(view.summarySpy).not.toHaveBeenCalled();
  });
});

describe('ShopDashboardScreen — lỗi KHÔNG được hoá thành số 0', () => {
  it('một khối lỗi không kéo cả màn thành màn lỗi', async () => {
    const view = await renderScreen(FULL, { summaryError: true });

    // Khối đơn vẫn dùng được.
    expect(await view.findByText('Đơn gần đây')).toBeTruthy();
    // Ô doanh thu KHÔNG in "0 ₫".
    await waitFor(() => expect(view.queryByText('0 ₫')).toBeNull());
  });

  it('đếm đội xe lỗi: ô hiện "Không rõ", không phải 0/0', async () => {
    const view = await renderScreen(FULL, { fleetError: true });

    await view.findByText('Xe sẵn sàng');
    await waitFor(() => expect(view.queryByText('0/0')).toBeNull());
    expect(view.getAllByText('Không rõ').length).toBeGreaterThan(0);
  });

  it('khối đơn lỗi: nói "Đã có lỗi xảy ra", không nói "Chưa có đơn nào"', async () => {
    const view = await renderScreen(FULL, { bookingsError: true });

    await view.findByText('Đơn gần đây');
    await waitFor(() => expect(view.getAllByText('Đã có lỗi xảy ra').length).toBeGreaterThan(0));
    expect(view.queryByText('Chưa có đơn nào')).toBeNull();
  });
});

describe('ShopDashboardScreen — số liệu dùng CHUNG với module nguồn', () => {
  it('thẻ tiền đọc từ `/finance/summary`, không tự cộng', async () => {
    const view = await renderScreen(FULL);

    expect(await view.findByText('8.000.000 ₫')).toBeTruthy();
    expect(view.getByText('4.000.000 ₫')).toBeTruthy();
    expect(view.getByText('2 đơn còn giữ cọc')).toBeTruthy();
  });

  it('thẻ Doanh thu mở đúng tập phiếu sinh ra nó (kỳ + đã duyệt + thu + kinh doanh)', async () => {
    const view = await renderScreen(FULL);

    await fireEvent.press(await view.findByText('Doanh thu'));

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    const target = mockPush.mock.calls[0]?.[0] as { pathname: string; params: Record<string, string> };
    expect(target.pathname).toBe('/manage/receipts');
    expect(target.params).toMatchObject({
      status: RECEIPT_STATUS.APPROVED,
      type: RECEIPT_TYPE.INCOME,
      sourceGroup: RECEIPT_SOURCE_GROUP.BUSINESS,
    });
    expect(target.params.from).toBeTruthy();
    expect(target.params.to).toBeTruthy();
  });

  it('thẻ Cọc KHÔNG mang kỳ — đó là số TẠI THỜI ĐIỂM NÀY', async () => {
    const view = await renderScreen(FULL);

    await fireEvent.press(await view.findByText('Tiền cọc đang giữ'));

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    const target = mockPush.mock.calls[0]?.[0] as { params: Record<string, string> };
    expect(target.params).toMatchObject({
      status: RECEIPT_STATUS.APPROVED,
      sourceGroup: RECEIPT_SOURCE_GROUP.HELD_FUNDS,
    });
    expect(target.params.from).toBeUndefined();
    expect(target.params.to).toBeUndefined();
  });
});

describe('ShopDashboardScreen — dải trạng thái và ba bước mở gian hàng', () => {
  it('gian hàng đang hoạt động + đã có xe: không dải trạng thái, không thẻ ba bước', async () => {
    const view = await renderScreen(FULL);

    await view.findByText('Xe sẵn sàng');
    expect(view.queryByText('Bắt đầu bán xe trên XePrime')).toBeNull();
    expect(view.queryByText('Gian hàng đang hoạt động')).toBeNull();
  });

  it('gian hàng NHÁP: dải trạng thái + ba bước, và bước hồ sơ dẫn tới /manage/shop', async () => {
    const view = await renderScreen(FULL, { status: TENANT_STATUS.DRAFT, vehicleTotal: 0 });
    view.shopSpy.mockResolvedValue({
      id: '01JQZX0000000000000000000T',
      code: 'SHOP01',
      slug: 'binh-minh',
      name: 'Gian hàng Đà Nẵng',
      tenantType: 'individual',
      status: TENANT_STATUS.DRAFT,
      phone: null,
      email: null,
      profile: {
        displayName: null,
        bio: null,
        logoUrl: null,
        coverUrl: null,
        address: null,
        provinceCode: null,
        provinceName: null,
        taxCode: null,
        businessLicenseNo: null,
        bankName: null,
        bankAccountNo: null,
        bankAccountName: null,
        qrUrl: null,
        ownerFullName: null,
        ownerPhone: null,
        ownerEmail: null,
      },
      latestApproval: null,
      defaultBranch: null,
    });

    expect(await view.findByText('Hồ sơ chưa được gửi duyệt')).toBeTruthy();
    expect(await view.findByText('Bắt đầu bán xe trên XePrime')).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: 'Điền hồ sơ' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/manage/shop'));
  });
});
