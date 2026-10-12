import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DASHBOARD_AGENDA_KIND,
  FEATURE_STATE,
  PERMISSION,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
  TENANT_ROLE,
} from '@xeprime/types';
import { ROUTES, bookingPath } from '@/constants/routes';
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
      tenant: { roleKey: state.roleKey, billingMode: 'package', billingPhase: 'current' },
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
    fetchDashboardTodayReceipts: () => {
      state.receiptCalls += 1;
      return Promise.resolve({
        items: state.receipts,
        meta: { page: 1, limit: 5, total: state.receipts.length, hasNext: false },
      });
    },
  };
});

// Biểu đồ (recharts cần đo kích thước — jsdom không có) và panel phụ có test riêng.
vi.mock('@/components/chart/RevenueTrendChart', () => ({
  RevenueTrendChart: () => <div data-testid="revenue-chart" />,
}));
vi.mock('@/components/chart/CountTrendChart', () => ({
  CountTrendChart: () => <div data-testid="trend-chart" />,
}));
vi.mock('./PlanPanel', () => ({ PlanPanel: () => null }));
vi.mock('./WalletPanel', () => ({ WalletPanel: () => <div data-testid="wallet-panel" /> }));
vi.mock('./ReputationPanel', () => ({ ReputationPanel: () => null }));
vi.mock('./ShopOnboardingCard', () => ({ ShopOnboardingCard: () => null }));

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
      active: 3,
      returnsToday: 0,
      returnsOverdue: 0,
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
  state.overview = makeOverview();
  state.summary = { revenue: '12500000', depositHeld: '3000000', depositHeldBookings: 2 };
  state.previous = { revenue: '10000000', depositHeld: '0', depositHeldBookings: 0 };
  state.summaryError = false;
  state.receipts = [];
  state.summaryCalls = 0;
  state.receiptCalls = 0;
});

describe('Tổng quan gian hàng — việc cần làm', () => {
  it('câu trả lời đầu trang dựng từ chính các ô: quá giờ → yêu cầu → giao xe', async () => {
    await renderView();
    expect(
      await screen.findByText('Hôm nay: 1 việc đã quá giờ · 3 yêu cầu chờ bạn trả lời · giao 2 xe.'),
    ).toBeTruthy();
  });

  it('mỗi ô dẫn tới đúng danh sách lọc sẵn tạo nên con số', async () => {
    await renderView();

    const requests = await tile('Yêu cầu chờ duyệt');
    expect(requests.getAttribute('href')).toBe(ROUTES.MANAGE.BOOKING_REQUESTS);
    expect(within(requests).getByText('3')).toBeTruthy();
    expect(within(requests).getByText('1 sắp hết hạn trả lời')).toBeTruthy();

    const payment = await tile('Chờ khách thanh toán');
    expect(payment.getAttribute('href')).toBe(`${ROUTES.MANAGE.BOOKING_REQUESTS}?status=awaiting_hold`);

    const pickups = await tile('Chờ giao xe');
    expect(pickups.getAttribute('href')).toBe(ROUTES.MANAGE.BOOKINGS_AWAITING_PICKUP);
    expect(within(pickups).getByText('1 đã quá giờ')).toBeTruthy();
    expect(within(pickups).getByText('2 hẹn hôm nay')).toBeTruthy();

    const active = await tile('Đang cho thuê');
    expect(active.getAttribute('href')).toBe(`${ROUTES.MANAGE.BOOKINGS}?status=active&sort=return_asc`);
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
      today: { awaitingPickup: 0, pickupsToday: 0, pickupsOverdue: 0, active: 0, returnsToday: 0, returnsOverdue: 0 },
      requests: { pending: 0, pendingUrgent: 0, nextRespondBy: null, awaitingPayment: 0 },
      agenda: { items: [], hasMore: false },
    });
    await renderView();

    expect(
      await screen.findByText('Hôm nay chưa có lịch giao nhận xe nào và không có yêu cầu nào chờ bạn.'),
    ).toBeTruthy();
    expect(screen.getByText('Không có yêu cầu mới')).toBeTruthy();
    expect(screen.getByText('Không có lịch giao hay nhận xe nào trong 7 ngày tới.')).toBeTruthy();
  });

  it('lịch giao nhận: mốc quá giờ đứng trong nhóm riêng và dẫn thẳng vào chi tiết đơn', async () => {
    await renderView();

    expect(await screen.findByText('Đã quá giờ')).toBeTruthy();
    const row = screen.getByText('Toyota Vios · 51A-123.45').closest('a') as HTMLAnchorElement;
    expect(row.getAttribute('href')).toBe(bookingPath.detail('01HBOOKING00000000000000AA'));
  });
});

describe('Tổng quan gian hàng — KPI tháng này', () => {
  it('đếm so cùng kỳ theo %, tỉ lệ lấp đầy theo ĐIỂM; kỳ trước bằng 0 thì nói không có gì để so', async () => {
    await renderView();

    expect(await screen.findByText('72,5%')).toBeTruthy();
    expect(screen.getByText('+4,5 điểm')).toBeTruthy();
    // 12 đơn so với 10 cùng kỳ.
    expect(screen.getByText('+20%')).toBeTruthy();
    // 8 chuyến so với 0 — không phải "+∞%", cũng không phải "0%".
    expect(screen.getAllByText('Chưa có số cùng kỳ để so').length).toBeGreaterThan(0);
  });

  it('trend chỉ có ở tuyến gói có sổ tổng hợp — server trả null thì không dựng biểu đồ', async () => {
    await renderView();
    await screen.findByText('Chờ giao xe');
    expect(screen.queryByTestId('trend-chart')).toBeNull();
  });
});

describe('Tổng quan gian hàng — khối tiền dùng dữ liệu thật', () => {
  it('có gói và có quyền: doanh thu và cọc là SỐ THẬT, kèm kỳ, mẫu số và so cùng kỳ', async () => {
    await renderView();

    expect(await screen.findByText('12.500.000 ₫')).toBeTruthy();
    expect(screen.getByText('3.000.000 ₫')).toBeTruthy();
    expect(screen.getByText('Tháng này', { selector: 'div' })).toBeTruthy();
    expect(screen.getByText('2 đơn còn giữ cọc')).toBeTruthy();
    expect(await screen.findByText('+25%')).toBeTruthy();
  });

  it('phiếu hôm nay hiện trong panel, dòng CHI mang dấu trừ', async () => {
    state.receipts = [
      makeReceipt(),
      makeReceipt({
        id: '01HRECEIPT000000000000001',
        receiptNo: 'PC-001',
        type: RECEIPT_TYPE.EXPENSE,
        amount: '200000',
        categoryName: 'Xăng dầu',
      }),
    ];
    await renderView();

    expect(await screen.findByText('Tiền thuê xe')).toBeTruthy();
    expect(screen.getByText('−200.000 ₫')).toBeTruthy();
  });

  it('gói hết hạn (read_only): VẪN xem được sổ của chính mình — ADR 0027 điều 3', async () => {
    state.featureState = FEATURE_STATE.READ_ONLY;
    await renderView();

    expect(await screen.findByText('12.500.000 ₫')).toBeTruthy();
  });

  it('gói không có sổ (feature hidden): không thẻ tiền nào, và KHÔNG gọi API', async () => {
    state.featureState = FEATURE_STATE.HIDDEN;
    await renderView();

    // Thẻ đội xe vẫn phải có — chặn khối tiền không được làm hỏng phần còn lại.
    expect(await screen.findByText('Xe sẵn sàng')).toBeTruthy();
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

    expect(await screen.findByText('Xe sẵn sàng')).toBeTruthy();
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
