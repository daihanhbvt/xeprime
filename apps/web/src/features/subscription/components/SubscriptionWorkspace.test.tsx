import { App } from 'antd';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BILLING_MODE, PERMISSION, type Permission } from '@xeprime/types';

import type { MySubscription } from '../types';
import { SubscriptionWorkspace } from './SubscriptionWorkspace';

/**
 * Màn "Gói & hạn mức" — dùng chung ở section `plan` của `/manage/shop` và ở
 * `/account/subscription`.
 *
 * Bộ này khoá hai thứ, cả hai đều là lỗi đã có thật trên màn cũ:
 *
 *  1. **Giao diện phải khớp với API về quyền MUA.** `shop_manager` có `subscription.view`
 *     nhưng không có `subscription.purchase` (`rbac.ts`), trong khi màn cũ luôn dựng nút
 *     "Gia hạn / đổi gói" và modal mua. Kết quả: họ chọn chỗ, chọn kỳ hạn, bấm tạo hoá đơn và
 *     mới ăn 403 ở bước cuối — hỏng niềm tin vào một màn hình nói về tiền.
 *  2. **Không hứa những con số hệ thống không giữ.** Thẻ "lượt miễn phí" đã gỡ vì
 *     `tenants.freeTripsUsed` không được tăng ở bất kỳ đâu trong `apps/api`/`apps/worker`, và
 *     `commissionPercent` của gói không còn in ra như một cam kết vì phí thật tính từ
 *     `fee_policies` (ADR 0028 — mỗi dòng tiền có chủ sở hữu và snapshot riêng).
 */
const perms = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.has(p),
    hasAny: (...ps: string[]) => ps.some((p) => perms.granted.has(p)),
    isLoading: false,
  }),
}));

const me = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const invoices = vi.hoisted(() => ({
  data: { items: [], meta: { page: 1, limit: 20, total: 0, hasNext: false } },
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
}));

/**
 * Hoá đơn ĐANG CHỜ hỏi bằng một lượt đọc RIÊNG (`GET /subscription/invoices/pending`), không
 * tìm trong trang 1 của lịch sử: mỗi tenant giữ tối đa một hoá đơn còn nhận tiền, và nó phải
 * hiện kể cả khi người dùng đang đứng ở trang 3 của sổ.
 */
const pendingInvoice = vi.hoisted(() => ({
  data: undefined as unknown,
  isPending: false,
  isError: false,
}));

vi.mock('../hooks/use-subscription', () => ({
  useMySubscription: () => me,
  usePendingInvoice: () => pendingInvoice,
  useSubscriptionInvoices: () => invoices,
  useTenantPlans: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  usePurchaseSubscription: () => ({ mutate: vi.fn(), isPending: false }),
  usePaymentInfo: () => ({ data: undefined, isLoading: false, isError: false }),
}));

vi.mock('@/hooks/use-url-filters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-url-filters')>();
  return { ...actual, useUrlFilters: () => ({ filters: { page: 1 }, setFilters: vi.fn() }) };
});

vi.mock('@/hooks/use-feature', () => ({ useFeatureStates: () => ({}) }));

/*
 * PHA của gói (`current`/`grace`/`lapsed`) đọc từ `/auth/me`, KHÔNG suy từ `endsAt` bằng đồng
 * hồ máy khách (ADR 0038 điều 1). Chặn ở đúng ranh giới đó thay vì dựng một QueryClient giả —
 * thứ bộ này quan tâm là màn hình nói gì, không phải hook lấy dữ liệu bằng cách nào.
 */
const currentUser = vi.hoisted(() => ({
  data: { tenant: { billingPhase: 'current' } } as unknown,
}));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => currentUser,
}));

function subscriptionFixture(over: Partial<MySubscription> = {}): MySubscription {
  return {
    currentPlan: {
      subscriptionId: 'SUB1',
      planId: 'PLAN1',
      planCode: 'per-vehicle',
      planName: 'Gói theo xe',
      billingMode: BILLING_MODE.PACKAGE,
      commissionPercent: null,
      slots: { car: 3, motorbike: 2 },
      endsAt: '2027-01-01T00:00:00.000Z',
    },
    usage: {
      car: { used: 2, onMarketplace: 2, limit: 3 },
      motorbike: { used: 0, onMarketplace: 0, limit: 2 },
    },
    fleetQuota: { kind: 'per_type', totalLimit: null, totalUsed: 2 },
    freeTrips: { allowance: 2, used: 0, left: 2 },
    ...over,
  };
}

function grant(...permissions: Permission[]) {
  perms.granted = new Set<string>(permissions);
}

function renderWorkspace() {
  return render(
    <App>
      <SubscriptionWorkspace header={<h1>Gói &amp; hoá đơn</h1>} />
    </App>,
  );
}

beforeEach(() => {
  me.data = subscriptionFixture();
  me.isLoading = false;
  me.isError = false;
  invoices.data = { items: [], meta: { page: 1, limit: 20, total: 0, hasNext: false } };
  pendingInvoice.data = undefined;
  grant(PERMISSION.SUBSCRIPTION_VIEW, PERMISSION.SUBSCRIPTION_PURCHASE);
});

afterEach(cleanup);

describe('SubscriptionWorkspace — quyền mua gói', () => {
  it('có subscription.purchase: thấy nút gia hạn/đổi gói', () => {
    renderWorkspace();

    expect(screen.getByRole('button', { name: /Gia hạn \/ đổi gói/ })).toBeTruthy();
  });

  it('chưa có gói + có quyền mua: CTA là "Mua gói"', () => {
    me.data = subscriptionFixture({ currentPlan: null });
    renderWorkspace();

    expect(screen.getByRole('button', { name: /Mua gói/ })).toBeTruthy();
  });

  /*
   * `shop_manager` điển hình: xem được hạn mức để điều hành đội xe, nhưng mua là việc của chủ
   * gian hàng. Không CTA nào được dẫn họ vào luồng đó — kể cả CTA phụ trong danh sách tính năng.
   */
  it('chỉ subscription.view: KHÔNG có CTA mua nào trên màn', () => {
    grant(PERMISSION.SUBSCRIPTION_VIEW);
    renderWorkspace();

    expect(screen.queryByRole('button', { name: /Gia hạn \/ đổi gói/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Mua gói/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Xem gói cao hơn/ })).toBeNull();
  });

  it('chỉ subscription.view: vẫn xem được gói hiện hành và hạn mức chỗ', () => {
    grant(PERMISSION.SUBSCRIPTION_VIEW);
    renderWorkspace();

    expect(screen.getByText('Gói theo xe')).toBeTruthy();
    // Hạn mức là hai ô số, không còn là một thẻ có tiêu đề "Chỗ xe đang dùng".
    expect(screen.getByText('Chỗ ô tô')).toBeTruthy();
    expect(screen.getByText('2/3')).toBeTruthy();
  });

  /*
   * Không có CTA thì cũng KHÔNG được dựng modal mua trong cây: một modal treo sẵn là một đường
   * vào bằng phím tắt/lập trình mà API sẽ từ chối ở bước cuối.
   */
  it('chỉ subscription.view: modal mua KHÔNG nằm trong cây, không chỉ là bị ẩn', () => {
    grant(PERMISSION.SUBSCRIPTION_VIEW);
    renderWorkspace();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('.ant-modal-root')).toBeNull();
  });
});

describe('SubscriptionWorkspace — hạn mức nói đúng mức dùng', () => {
  /*
   * Dưới 80% là trung tính: còn chỗ thì không có gì để báo động. Dải cảnh báo chỉ xuất hiện khi
   * ĐÃ HẾT chỗ — và nó vẫn là cảnh báo, không phải lỗi: dùng hết chỗ đã mua là trạng thái hợp
   * lệ của gói.
   */
  it('còn chỗ trống: KHÔNG dựng dải cảnh báo nào', () => {
    renderWorkspace();

    expect(screen.queryByText(/Đã dùng hết chỗ/)).toBeNull();
  });

  it('hết chỗ ô tô: nói đúng loại xe đã hết, và chỉ loại đó', () => {
    me.data = subscriptionFixture({
      usage: {
        car: { used: 3, onMarketplace: 3, limit: 3 },
        motorbike: { used: 0, onMarketplace: 0, limit: 2 },
      },
    });
    renderWorkspace();

    const warning = screen.getByText(/Đã dùng hết chỗ/);
    expect(warning.textContent).toContain('Chỗ ô tô');
    expect(warning.textContent).not.toContain('Chỗ xe máy');
  });

  /*
   * Owner Lite có trần TỔNG, tuyến gói có hạn mức theo LOẠI — hai luật, hai cách vẽ. Nhét trần
   * tổng vào ô của từng loại là màn hình nói "3 ô tô" trong khi backend chặn ở "3 xe".
   */
  it('Owner Lite: một ô TỔNG SỐ XE, không phải hai ô theo loại', () => {
    me.data = subscriptionFixture({
      fleetQuota: { kind: 'total', totalLimit: 3, totalUsed: 3 },
    });
    renderWorkspace();

    expect(screen.getByText('Tổng số xe')).toBeTruthy();
    expect(screen.queryByText('Chỗ ô tô')).toBeNull();
  });
});

describe('SubscriptionWorkspace — hoá đơn', () => {
  it('chưa có hoá đơn nào: một dòng chữ gọn, KHÔNG dựng bảng lịch sử', () => {
    renderWorkspace();

    expect(screen.getByText('Chưa phát sinh hoá đơn.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: /Xem lịch sử thanh toán/ })).toBeNull();
  });

  /*
   * Có lịch sử thì bảng vẫn GẬP LẠI: người ta mở nó vài tháng một lần để tìm một mã cụ thể, nên
   * nó không đáng chiếm phần dưới màn hình của mọi lượt truy cập.
   */
  it('có lịch sử: bảng gập lại sau một nút, chỉ dựng khi người dùng mở', () => {
    invoices.data = {
      items: [
        {
          id: 'INV1',
          code: 'XPG123456',
          status: 'paid',
          totalAmount: '1200000',
          paidAmount: '1200000',
          periodFrom: '2026-09-01T00:00:00.000Z',
          periodTo: '2026-12-01T00:00:00.000Z',
          createdAt: '2026-09-01T00:00:00.000Z',
        } as unknown as (typeof invoices.data)['items'][number],
      ],
      meta: { page: 1, limit: 20, total: 1, hasNext: false },
    };
    renderWorkspace();

    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Xem lịch sử thanh toán/ }));
    expect(screen.getByRole('table')).toBeTruthy();
  });
});

describe('SubscriptionWorkspace — không hứa con số hệ thống không giữ', () => {
  it('KHÔNG còn thẻ "lượt miễn phí" — backend không bao giờ trừ lượt', () => {
    renderWorkspace();

    expect(screen.queryByText('Lượt miễn phí')).toBeNull();
    expect(screen.queryByText(/lượt miễn phí/)).toBeNull();
  });

  it('tuyến hoa hồng: mô tả phí theo CHÍNH SÁCH hiện hành, không in phần trăm của gói', () => {
    me.data = subscriptionFixture({
      currentPlan: {
        subscriptionId: 'SUB2',
        planId: 'PLAN2',
        planCode: 'commission',
        planName: 'Tuyến hoa hồng',
        billingMode: BILLING_MODE.COMMISSION,
        commissionPercent: 10,
        slots: null,
        endsAt: '2027-01-01T00:00:00.000Z',
      },
    });
    renderWorkspace();

    expect(screen.getByText(/theo chính sách phí hiện hành/)).toBeTruthy();
    expect(screen.queryByText(/10%/)).toBeNull();
  });
});
