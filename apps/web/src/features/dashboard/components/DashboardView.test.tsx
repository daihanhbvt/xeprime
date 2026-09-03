import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEATURE_STATE, PERMISSION, RECEIPT_STATUS, RECEIPT_TYPE } from '@xeprime/types';
import type { Receipt } from '@/features/finance/types';
import { DashboardView } from './DashboardView';

/**
 * Khối TIỀN của dashboard gian hàng.
 *
 * Trước đợt này hai thẻ "Doanh thu"/"Tiền cọc đang giữ" là hằng `'—'` viết cứng và panel
 * "Thu Chi hôm nay" luôn rỗng — dashboard trông như đã xong nhưng không nói được gì. Thứ phải
 * khoá lại ở đây là ba điều:
 *
 *  1. Số hiện lên là số THẬT lấy từ `/finance/summary`, không phải chỗ giữ chỗ.
 *  2. Khối tiền chỉ có ở bậc CÓ sổ tổng hợp — hai trục kiểm nối tiếp (ADR 0027 điều 2):
 *     cờ tính năng `finance` VÀ quyền `finance.view`. Thiếu một trong hai thì không thẻ nào
 *     hiện, và hai truy vấn cũng không được gọi (chạy rồi nuốt 403 là lãng phí và ồn log).
 *  3. Lỗi mạng nói ra thành chữ. Nuốt lỗi thành `—` làm một thẻ hỏng trông y hệt một gian
 *     hàng chưa có doanh thu — đúng kiểu sai mà không ai phát hiện.
 */
const state = vi.hoisted(() => ({
  featureState: 'enabled' as string,
  permissions: [] as string[],
  summary: null as Record<string, unknown> | null,
  summaryError: false,
  receipts: [] as unknown[],
  summaryCalls: 0,
  receiptCalls: 0,
}));

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

// Hai truy vấn tiền được đếm để khẳng định điều 2: bị chặn nghĩa là KHÔNG gọi, không phải gọi
// rồi bỏ kết quả.
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    fetchVehicleStats: () => Promise.resolve({ total: 4, available: 3, renting: 1 }),
    fetchDashboardFinanceSummary: () => {
      state.summaryCalls += 1;
      return state.summaryError
        ? Promise.reject(new Error('boom'))
        : Promise.resolve(state.summary);
    },
    fetchDashboardTodayReceipts: () => {
      state.receiptCalls += 1;
      return Promise.resolve({
        items: state.receipts,
        meta: { page: 1, limit: 5, total: state.receipts.length, hasNext: false },
      });
    },
  };
});

vi.mock('../hooks/use-dashboard-bookings', () => ({
  useDashboardBookings: () => ({
    recent: { data: { items: [] }, isLoading: false },
    dueToday: { data: { items: [] }, isLoading: false },
    upcoming: { data: { items: [] }, isLoading: false },
    activeCount: 1,
    overdueCount: 0,
  }),
}));

vi.mock('./ShopOnboardingCard', () => ({ ShopOnboardingCard: () => null }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

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

/** Bọc query client mới cho mỗi test — cache dùng lại giữa các test làm số đếm gọi vô nghĩa. */
async function renderView() {
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DashboardView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.featureState = FEATURE_STATE.ENABLED;
  state.permissions = [PERMISSION.FINANCE_VIEW];
  state.summary = { revenue: '12500000', depositHeld: '3000000', depositHeldBookings: 2 };
  state.summaryError = false;
  state.receipts = [];
  state.summaryCalls = 0;
  state.receiptCalls = 0;
});

afterEach(cleanup);

describe('Dashboard — khối tiền dùng dữ liệu thật', () => {
  it('có gói và có quyền: doanh thu và cọc là SỐ THẬT, kèm kỳ và mẫu số', async () => {
    await renderView();

    expect(await screen.findByText('12.500.000 ₫')).toBeTruthy();
    expect(screen.getByText('3.000.000 ₫')).toBeTruthy();
    // Một số tiền không kèm kỳ là số không kiểm chứng được.
    expect(screen.getByText('Tháng này')).toBeTruthy();
    expect(screen.getByText('2 đơn còn giữ cọc')).toBeTruthy();
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

  it('bậc cơ bản (feature hidden): không thẻ tiền nào, và KHÔNG gọi API', async () => {
    state.featureState = FEATURE_STATE.HIDDEN;
    await renderView();

    // Thẻ "Xe sẵn sàng" vẫn phải có — chặn khối tiền không được làm hỏng phần còn lại.
    expect(await screen.findByText('Xe sẵn sàng')).toBeTruthy();
    expect(screen.queryByText('Doanh thu')).toBeNull();
    expect(screen.queryByText('Tiền cọc đang giữ')).toBeNull();
    expect(screen.queryByText('Thu Chi hôm nay')).toBeNull();
    expect(state.summaryCalls).toBe(0);
    expect(state.receiptCalls).toBe(0);
  });

  it('có gói nhưng vai không có finance.view: cũng không thấy và cũng không gọi', async () => {
    state.permissions = [];
    await renderView();

    expect(await screen.findByText('Xe sẵn sàng')).toBeTruthy();
    expect(screen.queryByText('Doanh thu')).toBeNull();
    expect(state.summaryCalls).toBe(0);
  });

  it('lỗi mạng: thẻ nói ra là lỗi, không giả vờ bằng một dấu gạch', async () => {
    state.summaryError = true;
    await renderView();

    expect(await screen.findAllByText('Đã có lỗi xảy ra')).toBeTruthy();
  });
});
