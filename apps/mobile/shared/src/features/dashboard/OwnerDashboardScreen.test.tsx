import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { render, waitFor } from '@testing-library/react-native';
import { PERMISSION, TENANT_STATUS, type Permission } from '@xeprime/types';
import * as authApi from '@/features/auth/api';
import { financeApi } from '@/features/finance/api';
import { subscriptionApi } from '@/api/subscription/api';
import { vehiclesApi } from '@/features/vehicles/api';
import { walletApi, type WalletStatement } from '@/api/wallet/api';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { dashboardApi, type PartnerOverview } from './api';
import { OwnerDashboardScreen } from './OwnerDashboardScreen';

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => undefined,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), setParams: jest.fn() }),
  usePathname: () => '/manage',
}));

jest.mock('@/features/shell/ManageHeader', () => ({ ManageHeader: () => null }));

/**
 * Tổng quan chủ xe tuyến hoa hồng (PR #170): tiền đọc SỔ VÍ, KHÔNG gọi sổ thu chi; không biểu đồ.
 */
function user(roleKey: string, permissions: Permission[]): authApi.CurrentUser {
  return {
    id: '01JQZX0000000000000000000U',
    displayName: 'Hương',
    email: null,
    avatarUrl: null,
    phone: '0901111111',
    phoneVerified: true,
    hasPassword: true,
    tenant: {
      id: '01JQZX0000000000000000000T',
      name: 'Xe chị Hương',
      slug: 'huong',
      status: TENANT_STATUS.ACTIVE,
      onboardingState: 'commission',
      branchScope: 'all',
      roleKey,
      logoUrl: null,
      features: [],
      planCode: null,
      planName: null,
      serviceFeePercent: '10',
      billingMode: 'commission',
      planEndsAt: null,
      billingPhase: 'current',
      graceEndsAt: null,
      publicVehicleCount: 1,
    },
    openRenterTripCount: 0,
    platformRole: null,
    permissions,
  } as unknown as authApi.CurrentUser;
}

const OVERVIEW = {
  generatedAt: new Date().toISOString(),
  today: { awaitingPickup: 0, pickupsToday: 0, pickupsOverdue: 0, active: 0, returnsToday: 0, returnsOverdue: 0 },
  requests: { pending: 0, pendingUrgent: 0, nextRespondBy: null, awaitingPayment: 0 },
  agenda: { items: [], hasMore: false },
  month: null,
  trend: null,
  market: null,
  reputation: {
    sampleCount: 0,
    responseRatePercent: null,
    acceptKeepRatePercent: null,
    responseMinutesMedian: null,
    instantBook: false,
  },
} as unknown as PartnerOverview;

async function renderScreen(roleKey: string) {
  const permissions = [PERMISSION.BOOKING_VIEW, PERMISSION.BOOKING_REQUEST_VIEW, PERMISSION.VEHICLE_VIEW];
  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(user(roleKey, permissions));
  jest.spyOn(dashboardApi, 'overview').mockResolvedValue(OVERVIEW);
  jest.spyOn(vehiclesApi, 'list').mockResolvedValue({
    items: [],
    meta: { page: 1, limit: 5, total: 0, hasNext: false },
  } as never);
  jest.spyOn(subscriptionApi, 'me').mockResolvedValue({} as never);
  const summary = jest.spyOn(walletApi, 'summary').mockResolvedValue({
    available: '900000',
    pending: '100000',
    total: '1000000',
    status: 'active',
    minWithdrawAmount: '100000',
    maxBusinessDays: 3,
  });
  const statement = jest.spyOn(walletApi, 'statement').mockResolvedValue({
    totals: { ownerIncome: '2500000' },
    stats: { completedTripCount: 3 },
  } as unknown as WalletStatement);
  const finance = jest.spyOn(financeApi, 'summary');

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = await render(
    withIntl(
      <ReduxProvider store={store}>
        <QueryClientProvider client={client}>
          <OwnerDashboardScreen />
        </QueryClientProvider>
      </ReduxProvider>,
    ),
  );
  return { ...view, summary, statement, finance };
}

beforeEach(() => jest.restoreAllMocks());

describe('OwnerDashboardScreen', () => {
  it('chủ: thu nhập tháng từ sổ ví, câu "yên ả", không gọi sổ thu chi, không biểu đồ', async () => {
    const view = await renderScreen('shop_owner');

    expect(await view.findByText('2.500.000 ₫')).toBeTruthy();
    expect(view.getByText('Hôm nay chưa có lịch giao nhận xe nào và không có yêu cầu nào chờ bạn.')).toBeTruthy();
    expect(view.finance).not.toHaveBeenCalled();
    expect(view.queryByText(/Doanh thu \d+ ngày qua/)).toBeNull();
    expect(view.getByText('Bạn chưa có xe nào trên XePrime.')).toBeTruthy();
  });

  it('thành viên không phải chủ: KHÔNG gọi ví', async () => {
    const view = await renderScreen('shop_staff');

    await view.findByText('Xe của bạn');
    await waitFor(() => expect(view.summary).not.toHaveBeenCalled());
    expect(view.queryByText('Tiền của bạn')).toBeNull();
  });
});
