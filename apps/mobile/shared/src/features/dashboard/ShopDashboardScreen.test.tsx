import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  DASHBOARD_AGENDA_KIND,
  FEATURE_STATE,
  type FeatureState,
  PERMISSION,
  PLAN_FEATURE,
  type PlanFeature,
  RECEIPT_SOURCE_GROUP,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
  SERVICE_TYPE,
  SHOP_VERIFICATION,
  TENANT_STATUS,
  type Permission,
  type TenantStatus,
} from '@xeprime/types';
import { ApiClientError } from '@xeprime/api-client';
import * as authApi from '@/features/auth/api';
import { walletApi } from '@/api/wallet/api';
import { dashboardApi, type PartnerOverview } from './api';
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
  useLocalSearchParams: () => ({}),
  /* Chạy callback lúc mount, cleanup lúc unmount — đủ để mô phỏng "màn đang focus". */
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), setParams: jest.fn() }),
  usePathname: () => '/manage',
}));

/*
 * Thanh trên thật kéo theo drawer/chat/thông báo — thay bằng ĐÚNG phần dải thường trực của nó, vì
 * dải trạng thái gian hàng giờ sống trong `ManageHeader` (`ManageShellNotices`), như `AppShell` web.
 */
jest.mock('@/features/shell/ManageHeader', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { ManageShellNotices } = jest.requireActual<
    typeof import('@/features/shell/ManageShellNotices')
  >('@/features/shell/ManageShellNotices');
  return { ManageHeader: () => createElement(ManageShellNotices) };
});

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
      onboardingState: 'package_active',
      branchScope: 'all',
      roleKey: 'shop_owner',
      logoUrl: null,
      features,
      planCode: null,
      planName: null,
      serviceFeePercent: null,
      billingMode: 'package',
      planEndsAt: null,
      billingPhase: 'current',
      graceEndsAt: null,
      // Gian hàng nháp chưa có xe nào lên chợ — mốc ẩn thẻ ba bước (ADR 0036, web `liveVehicle`).
      publicVehicleCount: status === TENANT_STATUS.DRAFT ? 0 : 1,
    },
    openRenterTripCount: 0,
    platformRole: null,
    permissions,
  };
}

/**
 * `GET /dashboard/overview` giả lập ĐÚNG luật quyền của server: khối thiếu quyền về `null`.
 */
function overviewFor(permissions: Permission[]): PartnerOverview {
  const can = (p: Permission) => permissions.includes(p);
  const bookings = can(PERMISSION.BOOKING_VIEW);
  return {
    generatedAt: new Date().toISOString(),
    today: bookings
      ? { awaitingPickup: 2, pickupsToday: 1, pickupsOverdue: 1, active: 3, returnsToday: 0, returnsOverdue: 0 }
      : null,
    requests: can(PERMISSION.BOOKING_REQUEST_VIEW)
      ? { pending: 4, pendingUrgent: 0, nextRespondBy: null, awaitingPayment: 1 }
      : null,
    agenda: bookings
      ? {
          items: [
            {
              kind: DASHBOARD_AGENDA_KIND.PICKUP,
              at: new Date(Date.now() + 3_600_000).toISOString(),
              bookingId: '01JQZX0000000000000000000K',
              code: 'BK001',
              vehicleId: '01JQZX0000000000000000000V',
              vehicleName: 'Toyota Vios',
              plateNumber: '43A-12345',
              customerName: 'Nguyễn Văn An',
              serviceType: SERVICE_TYPE.SELF_DRIVE,
            },
          ],
          hasMore: false,
        }
      : null,
    month: bookings
      ? {
          period: '2026-10',
          newBookings: 12,
          newBookingsPrevious: 10,
          completedTrips: 5,
          completedTripsPrevious: 0,
          utilizationPercent: 50,
          utilizationPercentPrevious: 40,
        }
      : null,
    trend: bookings ? [{ period: '2026-10', newBookings: 12, completedTrips: 5 }] : null,
    market: can(PERMISSION.VEHICLE_VIEW) ? { onMarket: 3, inReview: 1, needsRevision: 2, draft: 0 } : null,
    reputation: {
      sampleCount: 0,
      responseRatePercent: null,
      acceptKeepRatePercent: null,
      responseMinutesMedian: null,
      instantBook: false,
    },
  } as PartnerOverview;
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
  overviewError?: boolean;
  status?: TenantStatus;
  features?: TenantFeature[];
  vehicleTotal?: number;
}

async function renderScreen(permissions: Permission[], options: Options = {}) {
  const {
    fleetError = false,
    summaryError = false,
    overviewError = false,
    status = TENANT_STATUS.ACTIVE,
    features = [],
    vehicleTotal = 12,
  } = options;

  jest
    .spyOn(authApi, 'fetchCurrentUser')
    .mockResolvedValue(currentUser(permissions, { status, features }));

  const fail = () =>
    Promise.reject(new ApiClientError({ status: 500, code: 'INTERNAL_ERROR', message: 'Hỏng' }));

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

  const overviewSpy = jest.spyOn(dashboardApi, 'overview');
  if (overviewError) overviewSpy.mockImplementation(fail);
  else overviewSpy.mockResolvedValue(overviewFor(permissions));

  jest.spyOn(walletApi, 'summary').mockResolvedValue({
    available: '1500000',
    pending: '200000',
    total: '1700000',
    status: 'active',
    minWithdrawAmount: '100000',
    maxBusinessDays: 3,
  });

  const summarySpy = jest.spyOn(financeApi, 'summary');
  if (summaryError) summarySpy.mockImplementation(fail);
  else summarySpy.mockResolvedValue(SUMMARY);
  jest.spyOn(financeApi, 'series').mockResolvedValue({ granularity: 'day', buckets: [] });

  const receiptsSpy = jest.spyOn(receiptsApi, 'list').mockResolvedValue({
    items: [],
    meta: { page: 1, limit: 5, total: 0, hasNext: false, unassignedCount: 0 },
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
  return { ...view, fleetSpy, overviewSpy, summarySpy, receiptsSpy, shopSpy };
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockPush.mockClear();
});

const FULL: Permission[] = [
  PERMISSION.TENANT_VIEW,
  PERMISSION.VEHICLE_VIEW,
  PERMISSION.BOOKING_VIEW,
  PERMISSION.BOOKING_REQUEST_VIEW,
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

  it('thiếu `bookings.view`: server trả `today/agenda/month = null` ⇒ không ô giao xe, không lịch, không KPI tháng', async () => {
    const view = await renderScreen([PERMISSION.VEHICLE_VIEW]);

    await view.findByText('Xe sẵn sàng');
    await view.findByText('Xe trên chợ');
    expect(view.queryByText('Chờ giao xe')).toBeNull();
    expect(view.queryByText('Lịch giao & nhận xe')).toBeNull();
    expect(view.queryByText('Đơn mới')).toBeNull();
    // Thiếu cả yêu cầu lẫn đơn: không câu trả lời đầu trang nào để khẳng định.
    expect(view.queryByText(/^Hôm nay/)).toBeNull();
  });

  it('thiếu `vehicles.view`: KHÔNG gọi đếm đội xe, không khối xe trên chợ', async () => {
    const view = await renderScreen([PERMISSION.BOOKING_VIEW]);

    await view.findByText('Lịch giao & nhận xe');
    expect(view.fleetSpy).not.toHaveBeenCalled();
    expect(view.queryByText('Xe trên chợ')).toBeNull();
  });

  it('thiếu `subscription.view`: không khối gói', async () => {
    const view = await renderScreen(FULL);
    await view.findByText('Lịch giao & nhận xe');
    expect(view.queryByText('Gói dịch vụ')).toBeNull();
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

    // Lịch giao nhận vẫn dùng được.
    expect(await view.findByText('Toyota Vios · 43A-12345')).toBeTruthy();
    // Ô doanh thu KHÔNG in "0 ₫".
    await waitFor(() => expect(view.queryByText('0 ₫')).toBeNull());
  });

  it('đếm đội xe lỗi: ô hiện "Không rõ", không phải 0/0', async () => {
    const view = await renderScreen(FULL, { fleetError: true });

    await view.findByText('Xe sẵn sàng');
    await waitFor(() => expect(view.queryByText('0/0')).toBeNull());
    expect(view.getAllByText('Không rõ').length).toBeGreaterThan(0);
  });

  it('tổng quan lỗi: ô việc nói lỗi, lịch có "Thử lại" — không ô nào in 0', async () => {
    const view = await renderScreen(FULL, { overviewError: true });

    await waitFor(() =>
      expect(view.getAllByText('Chưa tải được việc hôm nay.').length).toBeGreaterThan(0),
    );
    expect(view.getAllByText('Đã có lỗi xảy ra').length).toBeGreaterThan(0);
    expect(view.queryByText('Không có yêu cầu mới')).toBeNull();
    // Lịch giao nhận VÀ biểu đồ chuyến (lần tải đầu lỗi vẫn hiện panel) đều mời thử lại overview.
    const retries = view.getAllByRole('button', { name: 'Thử lại' });
    expect(retries.length).toBeGreaterThanOrEqual(2);
    const calls = view.overviewSpy.mock.calls.length;
    await fireEvent.press(retries[0]!);
    await waitFor(() => expect(view.overviewSpy.mock.calls.length).toBeGreaterThan(calls));
  });
});

describe('ShopDashboardScreen — việc cần làm, KPI tháng và đích của thẻ', () => {
  it('câu trả lời đầu trang dựng từ chính các ô việc', async () => {
    const view = await renderScreen(FULL);
    expect(
      await view.findByText('Hôm nay: 1 việc đã quá giờ · 4 yêu cầu chờ bạn trả lời · giao 1 xe.'),
    ).toBeTruthy();
  });

  it('KPI so cùng kỳ: +20% cho đơn mới; kỳ trước 0 ⇒ "Chưa có số cùng kỳ để so", không 0%', async () => {
    const view = await renderScreen(FULL);
    expect(await view.findByText('+20% so với cùng kỳ tháng trước')).toBeTruthy();
    expect(view.getAllByText('Chưa có số cùng kỳ để so').length).toBeGreaterThan(0);
    expect(view.getByText('+10 điểm so với cùng kỳ tháng trước')).toBeTruthy();
  });

  it('ô "Chờ giao xe" mở màn Chờ giao xe; dòng lịch mở chi tiết đơn', async () => {
    const view = await renderScreen(FULL);
    await fireEvent.press(await view.findByLabelText(/^Chờ giao xe: 2/));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/manage/bookings/awaiting-pickup'));
  });

  it('chủ gian hàng thấy khối ví (CHỈ chủ — `@ShopOwnerOnly`)', async () => {
    const view = await renderScreen(FULL);
    expect(await view.findByText('Tiền của bạn')).toBeTruthy();
    expect(await view.findByText('1.500.000 ₫')).toBeTruthy();
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
    const target = mockPush.mock.calls[0]?.[0] as {
      pathname: string;
      params: Record<string, string>;
    };
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
      // ADR 0036: trục XÁC MINH tách khỏi `status`.
      verification: SHOP_VERIFICATION.UNVERIFIED,
      onboardingState: 'commission',
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
      },
      ownerAccount: {
        userId: '01JQZX00000000000000000OW',
        displayName: 'Nguyễn Văn A',
        email: null,
        phone: '84901111111',
        emailVerified: false,
        phoneVerified: true,
      },
      latestApproval: null,
      defaultBranch: null,
    });

    expect(await view.findByText('Hồ sơ chưa được gửi duyệt')).toBeTruthy();
    expect(await view.findByText('Bắt đầu bán xe trên XePrime')).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: 'Điền hồ sơ' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/manage/shop'));
  });

  /*
   * Web: `action: { key: 'support', target: 'support' }` → `workspacePaths(MANAGE).support`
   * = `/manage/support`. Bản trước báo "đang phát triển" dù màn Hỗ trợ đã có ở app.
   */
  it.each([
    [TENANT_STATUS.SUSPENDED, 'Gian hàng đang bị khoá'],
    [TENANT_STATUS.EXPIRED, 'Gói dịch vụ đã hết hạn'],
  ])('gian hàng %s: nút "Liên hệ hỗ trợ" mở trang con /manage/help', async (status, title) => {
    const view = await renderScreen(FULL, { status });

    expect(await view.findByText(title)).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Liên hệ hỗ trợ' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/manage/help'));
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
