import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOOKING_LIST_PRESET,
  DASHBOARD_AGENDA_KIND,
  FEATURE_STATE,
  PERMISSION,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
  TENANT_ROLE,
} from '@xeprime/types';
import { ROUTES, bookingPath, bookingsGroupPath } from '@/constants/routes';
import type { Receipt } from '@/features/finance/types';
import type { PartnerOverview } from '../types';
import { DashboardView } from './DashboardView';

/**
 * Tổng quan GIAN HÀNG tuyến gói. Thứ phải khoá lại:
 *
 *  1. Hàng đầu là VIỆC CẦN LÀM, kèm câu trả lời dựng từ chính các con số đó (UX §0 nguyên tắc 1),
 *     và mỗi ô dẫn tới đúng danh sách tạo nên nó (UX §1.5).
 *  2. Khối thiếu quyền VẮNG HẲN — `requests: null` không được vẽ thành "0 yêu cầu".
 *  3. Khối tiền là số THẬT của sổ thu chi, chỉ có ở gói có sổ VÀ vai có `finance.view` (ADR 0027
 *     điều 2); bị chặn thì KHÔNG gọi API. Lỗi nói ra thành chữ, không giả vờ bằng dấu gạch.
 *  4. So cùng kỳ: tiền theo %, tỉ lệ lấp đầy theo ĐIỂM.
 */
const state = vi.hoisted(() => ({
  featureState: 'enabled' as string,
  permissions: [] as string[],
  roleKey: 'shop_manager' as string,
  billingMode: 'package' as string,
  overview: null as unknown,
  summary: null as Record<string, unknown> | null,
  previous: null as Record<string, unknown> | null,
  summaryError: false,
  receipts: [] as unknown[],
  summaryCalls: 0,
  receiptCalls: 0,
}));

// Ô lọc chi nhánh đọc server (ADR 0052) — chặn ở tầng hook như mọi hook dữ liệu khác ở bộ này.
vi.mock('@/features/branches/hooks/use-branch-filter', () => import('@/features/branches/test-utils'));

vi.mock('@/hooks/use-feature', () => ({
  useFeature: () => ({
    state: state.featureState,
    canWrite: state.featureState === 'enabled',
    isVisible: state.featureState !== 'hidden',
    planEndsAt: null,
  }),
  useFeatureStates: () => ({}),
  usePlanEndsAt: () => null,
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => state.permissions.includes(p),
    hasAny: (...ps: string[]) => ps.some((p) => state.permissions.includes(p)),
    isLoading: false,
  }),
}));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({
    data: {
      displayName: 'Chủ shop',
      realm: 'partner',
      tenant: {
        roleKey: state.roleKey,
        billingMode: state.billingMode,
        onboardingState: state.billingMode,
        billingPhase: 'current',
      },
    },
    isLoading: false,
  }),
}));

vi.mock('@/features/vehicles/hooks/use-fleet-summary', () => ({
  useFleetSummary: () => ({
    data: { total: 4, available: 3, renting: 1, maintenance: 0, inactive: 0 },
    isLoading: false,
  }),
}));

// Truy vấn tiền được ĐẾM để khẳng định: bị chặn nghĩa là KHÔNG gọi, không phải gọi rồi bỏ kết quả.
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    fetchPartnerOverview: () => Promise.resolve(state.overview),
    fetchDashboardFinanceSummary: () => {
      state.summaryCalls += 1;
      return state.summaryError ? Promise.reject(new Error('boom')) : Promise.resolve(state.summary);
    },
    fetchDashboardPreviousFinanceSummary: () => Promise.resolve(state.previous),
    fetchDashboardFinanceSeries: () => Promise.resolve({ granularity: 'day', buckets: [] }),
    fetchDashboardFinanceBySource: () =>
      Promise.resolve({
        total: '0',
        marketplaceAmount: '0',
        directAmount: '0',
        unlinkedAmount: '0',
        items: [],
      }),
    fetchDashboardTodayReceipts: () => {
      state.receiptCalls += 1;
      return Promise.resolve({
        items: state.receipts,
        meta: { page: 1, limit: 5, total: state.receipts.length, hasNext: false },
      });
    },
  };
});

// Hai thẻ biểu đồ và panel phụ có test riêng — ở đây chỉ kiểm màn dựng khối nào, với props nào.
vi.mock('./TrendCards', () => ({
  RevenueCard: () => <div data-testid="revenue-chart" />,
  TripsCard: () => <div data-testid="trend-chart" />,
}));
vi.mock('./FleetPlanPanel', () => ({
  FleetPlanPanel: ({
    showPlan,
    showMarket,
    fleet,
  }: {
    showPlan: boolean;
    showMarket: boolean;
    fleet: unknown;
  }) => (
    <div
      data-testid="fleet-plan"
      data-plan={String(showPlan)}
      data-market={String(showMarket)}
      data-fleet={String(fleet !== null)}
    />
  ),
}));
vi.mock('./WalletPanel', () => ({
  WalletPanel: ({ showIncome }: { showIncome: boolean }) => (
    <div data-testid="wallet-panel" data-income={String(showIncome)} />
  ),
}));
vi.mock('./ReputationPanel', () => ({ ReputationPanel: () => null }));
vi.mock('./ShopOnboardingCard', () => ({
  ShopOnboardingCard: () => <div data-testid="shop-onboarding" />,
}));
vi.mock('./OwnerVehiclesPanel', () => ({
  OwnerVehiclesPanel: () => <div data-testid="owner-vehicles" />,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/manage',
  useSearchParams: () => new URLSearchParams(),
}));

const NOW = new Date();
const inHours = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString();

function makeOverview(over: Partial<PartnerOverview> = {}): PartnerOverview {
  return {
    generatedAt: NOW.toISOString(),
    today: {
      awaitingPickup: 4,
      pickupsToday: 2,
      pickupsOverdue: 1,
      pickupsDue: 2,
      active: 3,
      returnsToday: 0,
      returnsOverdue: 0,
      returnsDue: 0,
    },
    requests: { pending: 3, pendingUrgent: 1, nextRespondBy: inHours(0.25), awaitingPayment: 2 },
    agenda: {
      items: [
        {
          kind: DASHBOARD_AGENDA_KIND.PICKUP,
          at: inHours(-1),
          bookingId: '01HBOOKING00000000000000AA',
          code: 'XP0001',
          vehicleId: '01HVEHICLE00000000000000AA',
          vehicleName: 'Toyota Vios',
          plateNumber: '51A-123.45',
          customerName: 'Nguyễn An',
          serviceType: 'self_drive',
        },
      ],
      hasMore: false,
    },
    month: {
      period: '2026-10',
      newBookings: 12,
      newBookingsPrevious: 10,
      completedTrips: 8,
      completedTripsPrevious: 0,
      utilizationPercent: 72.5,
      utilizationPercentPrevious: 68,
    },
    trend: null,
    market: { onMarket: 3, inReview: 1, needsRevision: 0, draft: 0 },
    reputation: {
      sampleCount: 0,
      responseRatePercent: null,
      acceptKeepRatePercent: null,
      responseMinutesMedian: null,
      instantBook: false,
    },
    ...over,
  } as PartnerOverview;
}

function makeReceipt(over: Partial<Receipt> = {}): Receipt {
  return {
    id: '01HRECEIPT000000000000000',
    receiptNo: 'PT-001',
    type: RECEIPT_TYPE.INCOME,
    status: RECEIPT_STATUS.APPROVED,
    source: 'manual',
    amount: '500000',
    paymentMethod: 'cash',
    categoryName: 'Tiền thuê xe',
    occurredAt: '2026-09-03T03:00:00.000Z',
    createdAt: '2026-09-03T03:00:00.000Z',
    ...over,
  } as Receipt;
}

/** Query client mới cho mỗi test — cache dùng lại giữa các test làm số đếm gọi vô nghĩa. */
async function renderView() {
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <DashboardView />
    </QueryClientProvider>,
  );
}

/** Ô việc cần làm có nhãn này — tìm theo link chứa nhãn. */
async function tile(label: string): Promise<HTMLAnchorElement> {
  const text = await screen.findByText(label);
  return text.closest('a') as HTMLAnchorElement;
}

beforeEach(() => {
  state.featureState = FEATURE_STATE.ENABLED;
  state.permissions = [
    PERMISSION.FINANCE_VIEW,
    PERMISSION.BOOKING_VIEW,
    PERMISSION.BOOKING_REQUEST_VIEW,
    PERMISSION.VEHICLE_VIEW,
  ];
  state.roleKey = TENANT_ROLE.SHOP_MANAGER;
  state.billingMode = 'package';
  state.overview = makeOverview();
  state.summary = { revenue: '12500000', depositHeld: '3000000', depositHeldBookings: 2 };
  state.previous = { revenue: '10000000', depositHeld: '0', depositHeldBookings: 0 };
  state.summaryError = false;
  state.receipts = [];
  state.summaryCalls = 0;
  state.receiptCalls = 0;
});

describe('Tổng quan gian hàng - việc cần làm', () => {
  it('câu trả lời đầu trang dựng từ chính các ô: quá giờ → yêu cầu → giao xe', async () => {
    await renderView();
    await screen.findByText('1 việc đã quá giờ');
    const subtitle = screen.getByRole('heading', { level: 1 }).nextElementSibling;
    expect(subtitle?.textContent).toContain(
      'Hôm nay: 1 việc đã quá giờ · 3 yêu cầu chờ bạn trả lời · giao 2 xe.',
    );
  });

  it('lời chào theo tên cho CẢ gian hàng (chốt 17/11/2026 - như app Partner)', async () => {
    await renderView();
    await screen.findByText('Chờ giao xe');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Chủ shop$/);
  });

  it('mỗi ô dẫn tới đúng danh sách lọc sẵn tạo nên con số', async () => {
    await renderView();

    const requests = await tile('Yêu cầu chờ duyệt');
    expect(requests.getAttribute('href')).toBe(`${ROUTES.MANAGE.BOOKINGS}?preset=needs_action`);
    expect(within(requests).getByText('3')).toBeTruthy();
    expect(within(requests).getByText('1 sắp hết hạn')).toBeTruthy();

    const payment = await tile('Chờ khách thanh toán');
    expect(payment.getAttribute('href')).toBe(`${ROUTES.MANAGE.BOOKINGS}?preset=awaiting_payment`);

    const pickups = await tile('Chờ giao xe');
    expect(pickups.getAttribute('href')).toBe(
      bookingsGroupPath(BOOKING_LIST_PRESET.AWAITING_PICKUP),
    );
    expect(within(pickups).getByText('1 quá hạn')).toBeTruthy();
    expect(within(pickups).getByText('2 hẹn hôm nay')).toBeTruthy();

    const active = await tile('Đang cho thuê');
    expect(active.getAttribute('href')).toBe(bookingsGroupPath(BOOKING_LIST_PRESET.RENTING));
  });

  it('không có quyền xem yêu cầu: hai ô yêu cầu VẮNG HẲN, không vẽ thành 0', async () => {
    state.overview = makeOverview({ requests: null });
    await renderView();

    expect(await screen.findByText('Chờ giao xe')).toBeTruthy();
    expect(screen.queryByText('Yêu cầu chờ duyệt')).toBeNull();
    expect(screen.queryByText('Chờ khách thanh toán')).toBeNull();
  });

  it('không có việc gì: câu "yên ả" nói rõ ra, ô nói một câu thay vì số 0 to', async () => {
    state.overview = makeOverview({
      today: {
        awaitingPickup: 0,
        pickupsToday: 0,
        pickupsOverdue: 0,
        pickupsDue: 0,
        active: 0,
        returnsToday: 0,
        returnsOverdue: 0,
        returnsDue: 0,
      },
      requests: { pending: 0, pendingUrgent: 0, nextRespondBy: null, awaitingPayment: 0 },
      agenda: { items: [], hasMore: false },
    });
    await renderView();

    // Câu "yên ả" nằm cuối dòng phụ đề, sau ngày hôm nay.
    expect(
      await screen.findByText(
        /Hôm nay chưa có lịch giao nhận xe nào và không có yêu cầu nào chờ bạn\.$/,
      ),
    ).toBeTruthy();
    expect(screen.getByText('Không có yêu cầu mới')).toBeTruthy();
    expect(screen.getByText('Không có lịch giao hay nhận xe nào trong 7 ngày tới.')).toBeTruthy();
  });

  it('lịch giao nhận: mốc quá giờ mang nhãn "Trễ" và nút "Chi tiết" dẫn thẳng vào đơn', async () => {
    await renderView();

    expect(await screen.findByText('Trễ 1 giờ')).toBeTruthy();
    expect(screen.getByText('Toyota Vios · 51A-123.45')).toBeTruthy();
    const detail = screen.getByText('Chi tiết').closest('a') as HTMLAnchorElement;
    expect(detail.getAttribute('href')).toBe(bookingPath.detail('01HBOOKING00000000000000AA'));
  });
});

describe('Tổng quan gian hàng - KPI tháng này', () => {
  it('đếm so cùng kỳ theo %, tỉ lệ lấp đầy theo ĐIỂM; kỳ trước bằng 0 thì nói không có gì để so', async () => {
    await renderView();

    expect(await screen.findByText('72,5%')).toBeTruthy();
    expect(screen.getByText('4,5 điểm so với tháng trước (68%)')).toBeTruthy();
    // 12 đơn so với 10 cùng kỳ.
    expect(screen.getByText('20% so với tháng trước (10)')).toBeTruthy();
    // 8 chuyến so với 0 — không phải "+∞%", cũng không phải "0%".
    expect(screen.getAllByText('Chưa có số cùng kỳ để so').length).toBeGreaterThan(0);
  });

  it('trend chỉ có ở tuyến gói có sổ tổng hợp - server trả null thì không dựng biểu đồ', async () => {
    await renderView();
    await screen.findByText('Chờ giao xe');
    expect(screen.queryByTestId('trend-chart')).toBeNull();
  });
});

describe('Tổng quan gian hàng - khối tiền dùng dữ liệu thật', () => {
  it('có gói và có quyền: doanh thu và cọc là SỐ THẬT, kèm kỳ, mẫu số và so cùng kỳ', async () => {
    await renderView();

    expect(await screen.findByText('12.500.000 ₫')).toBeTruthy();
    // Cọc đang giữ là ô cuối của khối so sánh tháng (chốt 17/11/2026).
    expect(screen.getByText('3.000.000 ₫')).toBeTruthy();
    expect(screen.getByText('Tiền cọc đang giữ')).toBeTruthy();
    expect(await screen.findByText(/^25% so với tháng trước/)).toBeTruthy();
  });

  it('"Thu chi hôm nay" đã rời Tổng quan - có ở Lịch sử giao dịch (chốt 17/11/2026)', async () => {
    state.receipts = [makeReceipt()];
    await renderView();
    await screen.findByText('12.500.000 ₫');
    expect(screen.queryByText('Thu Chi hôm nay')).toBeNull();
  });

  it('gói hết hạn (read_only): VẪN xem được sổ của chính mình - ADR 0027 điều 3', async () => {
    state.featureState = FEATURE_STATE.READ_ONLY;
    await renderView();

    expect(await screen.findByText('12.500.000 ₫')).toBeTruthy();
  });

  it('gói không có sổ (feature hidden): không thẻ tiền nào, và KHÔNG gọi API', async () => {
    state.featureState = FEATURE_STATE.HIDDEN;
    await renderView();

    // Đội xe ("Xe sẵn sàng") vẫn phải có — chặn khối tiền không được làm hỏng phần còn lại.
    expect((await screen.findByTestId('fleet-plan')).getAttribute('data-fleet')).toBe('true');
    expect(screen.queryByText('Doanh thu')).toBeNull();
    expect(screen.queryByText('Tiền cọc đang giữ')).toBeNull();
    expect(screen.queryByText('Thu Chi hôm nay')).toBeNull();
    expect(screen.queryByTestId('revenue-chart')).toBeNull();
    expect(state.summaryCalls).toBe(0);
    expect(state.receiptCalls).toBe(0);
  });

  it('có gói nhưng vai không có finance.view: cũng không thấy và cũng không gọi', async () => {
    state.permissions = [PERMISSION.BOOKING_VIEW, PERMISSION.VEHICLE_VIEW];
    await renderView();

    expect((await screen.findByTestId('fleet-plan')).getAttribute('data-fleet')).toBe('true');
    expect(screen.queryByText('Doanh thu')).toBeNull();
    expect(state.summaryCalls).toBe(0);
  });

  it('lỗi mạng: thẻ nói ra là lỗi, không giả vờ bằng một dấu gạch', async () => {
    state.summaryError = true;
    await renderView();

    expect((await screen.findAllByText('Đã có lỗi xảy ra')).length).toBeGreaterThan(0);
  });

  it('ví chỉ dựng cho CHỦ gian hàng (`@ShopOwnerOnly`)', async () => {
    await renderView();
    await screen.findByText('Chờ giao xe');
    expect(screen.queryByTestId('wallet-panel')).toBeNull();

    state.roleKey = TENANT_ROLE.SHOP_OWNER;
    await renderView();
    expect(await screen.findByTestId('wallet-panel')).toBeTruthy();
  });
});

/**
 * Chủ xe cá nhân dùng CHÍNH màn này (ADR 0085 điều 1) — khối của gói vắng, và ba khối của Tổng quan
 * riêng cũ của họ được giữ: "Xe của bạn", thu nhập trên ví, lời chào theo tên.
 */
describe('Tổng quan - chủ xe cá nhân (tuyến hoa hồng) dùng chung màn', () => {
  beforeEach(() => {
    state.billingMode = 'commission';
    state.roleKey = TENANT_ROLE.SHOP_OWNER;
    // Chủ xe có `subscription.view` (phễu nâng cấp) — thẻ Gói vắng vì TUYẾN, không vì quyền.
    state.permissions = [...state.permissions, PERMISSION.SUBSCRIPTION_VIEW];
    // Tuyến hoa hồng không có sổ tổng hợp, server không trả `trend`.
    state.featureState = FEATURE_STATE.HIDDEN;
    state.overview = makeOverview({ trend: null });
  });

  it('"Xe của bạn" thay "Xe trên chợ"; không thẻ Gói, không ba bước mở gian hàng', async () => {
    await renderView();

    expect(await screen.findByTestId('owner-vehicles')).toBeTruthy();
    // Tổng quan của MỘT người: lời chào theo tên thay tiêu đề của gian hàng.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Chủ shop$/);
    const fleet = screen.getByTestId('fleet-plan');
    expect(fleet.getAttribute('data-market')).toBe('false');
    expect(fleet.getAttribute('data-plan')).toBe('false');
    expect(screen.queryByTestId('shop-onboarding')).toBeNull();
  });

  it('ví của CHỦ hiện thu nhập tháng; không thẻ tiền nào của sổ thu chi, không gọi API sổ', async () => {
    await renderView();

    expect((await screen.findByTestId('wallet-panel')).getAttribute('data-income')).toBe('true');
    expect(screen.queryByTestId('revenue-chart')).toBeNull();
    expect(state.summaryCalls).toBe(0);
    expect(state.receiptCalls).toBe(0);
  });

  it('gian hàng tuyến gói vẫn thấy đủ khối của mình', async () => {
    state.billingMode = 'package';
    state.featureState = FEATURE_STATE.ENABLED;
    await renderView();

    const fleet = await screen.findByTestId('fleet-plan');
    expect(fleet.getAttribute('data-market')).toBe('true');
    expect(fleet.getAttribute('data-plan')).toBe('true');
    expect(screen.getByTestId('shop-onboarding')).toBeTruthy();
    expect(screen.queryByTestId('owner-vehicles')).toBeNull();
    expect(screen.getByTestId('wallet-panel').getAttribute('data-income')).toBe('false');
  });
});
