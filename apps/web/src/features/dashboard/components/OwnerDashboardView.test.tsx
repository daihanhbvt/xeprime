import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CUSTOMER_TRIP_FILTER, PERMISSION, TENANT_ROLE } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import type { PartnerOverview } from '../types';
import { OwnerDashboardView } from './OwnerDashboardView';

/**
 * Tổng quan CHỦ XE CÁ NHÂN (tuyến hoa hồng). Thứ phải khoá lại:
 *
 *  1. Trước 09/10/2026 trang chủ của họ chỉ là danh sách xe — trùng mục "Xe của tôi". Nay nó trả
 *     lời bốn câu: ai đang hỏi thuê, hôm nay giao/nhận gì, tiền ở đâu, xe có lên chợ không.
 *  2. Chủ xe đọc yêu cầu + đơn gộp ở "Chuyến cho thuê" — mọi ô dẫn THẲNG vào đó, không đi vòng
 *     qua hộp thư rồi bị chuyển hướng.
 *  3. Không có báo cáo theo kỳ (ADR 0027 điều 1) — không biểu đồ, không ô chi nhánh.
 *  4. Ví chỉ của CHỦ: thành viên không thấy panel tiền.
 */
const state = vi.hoisted(() => ({
  roleKey: 'shop_owner' as string,
  overview: null as unknown,
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) =>
      [PERMISSION.BOOKING_VIEW, PERMISSION.BOOKING_REQUEST_VIEW, PERMISSION.VEHICLE_VIEW].includes(
        p as never,
      ),
    hasAny: () => true,
    isLoading: false,
  }),
}));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({
    data: {
      displayName: 'Trần Hương',
      realm: 'partner',
      tenant: {
        roleKey: state.roleKey,
        billingMode: 'commission',
        onboardingState: 'commission',
        billingPhase: 'current',
      },
    },
    isLoading: false,
  }),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, fetchPartnerOverview: () => Promise.resolve(state.overview) };
});

vi.mock('./WalletPanel', () => ({
  WalletPanel: ({ showIncome }: { showIncome: boolean }) => (
    <div data-testid="wallet-panel" data-income={String(showIncome)} />
  ),
}));
vi.mock('./OwnerVehiclesPanel', () => ({ OwnerVehiclesPanel: () => <div data-testid="owner-vehicles" /> }));
vi.mock('./ReputationPanel', () => ({ ReputationPanel: () => null }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/manage',
  useSearchParams: () => new URLSearchParams(),
}));

function makeOverview(): PartnerOverview {
  return {
    generatedAt: new Date().toISOString(),
    today: { awaitingPickup: 1, pickupsToday: 1, pickupsOverdue: 0, active: 0, returnsToday: 0, returnsOverdue: 0 },
    requests: { pending: 1, pendingUrgent: 0, nextRespondBy: null, awaitingPayment: 0 },
    agenda: { items: [], hasMore: false },
    month: {
      period: '2026-10',
      newBookings: 2,
      newBookingsPrevious: 1,
      completedTrips: 1,
      completedTripsPrevious: 1,
      utilizationPercent: 40,
      utilizationPercentPrevious: 40,
    },
    // Tuyến hoa hồng: server KHÔNG trả báo cáo theo kỳ.
    trend: null,
    market: { onMarket: 1, inReview: 0, needsRevision: 0, draft: 0 },
    reputation: {
      sampleCount: 0,
      responseRatePercent: null,
      acceptKeepRatePercent: null,
      responseMinutesMedian: null,
      instantBook: false,
    },
  } as PartnerOverview;
}

async function renderView() {
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <OwnerDashboardView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.roleKey = TENANT_ROLE.SHOP_OWNER;
  state.overview = makeOverview();
});

describe('Tổng quan chủ xe cá nhân', () => {
  it('chào đúng tên, trả lời việc hôm nay, và không có ô chi nhánh', async () => {
    await renderView();

    expect(await screen.findByText(/Trần Hương$/)).toBeTruthy();
    expect(await screen.findByText('Hôm nay: 1 yêu cầu chờ bạn trả lời · giao 1 xe.')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('CHỦ xe: mọi ô dẫn thẳng vào "Chuyến cho thuê", chuyến hoàn thành vào tab lịch sử', async () => {
    await renderView();

    const requests = (await screen.findByText('Yêu cầu chờ duyệt')).closest('a')!;
    expect(requests.getAttribute('href')).toBe(ROUTES.MANAGE.TRIPS);
    const pickups = screen.getByText('Chờ giao xe').closest('a')!;
    expect(pickups.getAttribute('href')).toBe(ROUTES.MANAGE.TRIPS);
    const completed = screen.getByText('Chuyến hoàn thành').closest('a')!;
    expect(completed.getAttribute('href')).toBe(
      `${ROUTES.MANAGE.TRIPS}?filter=${CUSTOMER_TRIP_FILTER.HISTORY}`,
    );
    expect(within(completed).getByText('Không đổi')).toBeTruthy();
  });

  it('chủ xe thấy panel tiền KÈM thu nhập tháng; xe của họ hiện từng chiếc', async () => {
    await renderView();

    const wallet = await screen.findByTestId('wallet-panel');
    expect(wallet.getAttribute('data-income')).toBe('true');
    expect(screen.getByTestId('owner-vehicles')).toBeTruthy();
  });

  it('THÀNH VIÊN (không phải chủ): không có ví; ô dẫn về hộp thư + bảng đơn như tuyến gói', async () => {
    state.roleKey = TENANT_ROLE.SHOP_STAFF;
    await renderView();

    const requests = (await screen.findByText('Yêu cầu chờ duyệt')).closest('a')!;
    expect(requests.getAttribute('href')).toBe(ROUTES.MANAGE.BOOKING_REQUESTS);
    expect(screen.queryByTestId('wallet-panel')).toBeNull();
  });
});
