import { App } from 'antd';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BILLING_MODE,
  PERMISSION,
  SHOP_ONBOARDING_STATE,
  TENANT_ROLE,
  type Permission,
} from '@xeprime/types';

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
  useSyncScopeWhenInvoiceSettles: () => undefined,
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
 *
 * Scope cũng là nơi đọc TUYẾN: màn này có hai hình dạng (gia hạn ↔ nâng cấp) và cái nào hiện ra
 * do `canUpgradeToPackageTrack` quyết định.
 */
const currentUser = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => currentUser,
}));

/** Scope của một gian hàng ĐANG có gói — hình dạng mặc định của bộ test này. */
function packageScope(over: Record<string, unknown> = {}) {
  return {
    tenant: {
      billingPhase: 'current',
      roleKey: TENANT_ROLE.SHOP_OWNER,
      billingMode: BILLING_MODE.PACKAGE,
      onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
      ...over,
    },
  };
}

/** Scope của một chủ xe tuyến hoa hồng — chưa từng đi qua cửa gói. */
function commissionScope(over: Record<string, unknown> = {}) {
  return packageScope({
    billingMode: BILLING_MODE.COMMISSION,
    onboardingState: SHOP_ONBOARDING_STATE.COMMISSION,
    ...over,
  });
}

/** Gói hoa hồng vẫn là một `currentPlan` — đó chính là chỗ bản cũ mời họ "gia hạn". */
const COMMISSION_PLAN: MySubscription['currentPlan'] = {
  subscriptionId: 'SUB2',
  planId: 'PLAN2',
  planCode: 'commission',
  planName: 'Tuyến hoa hồng',
  billingMode: BILLING_MODE.COMMISSION,
  commissionPercent: 10,
  quota: null,
  endsAt: '2027-01-01T00:00:00.000Z',
};

function subscriptionFixture(over: Partial<MySubscription> = {}): MySubscription {
  return {
    currentPlan: {
      subscriptionId: 'SUB1',
      planId: 'PLAN1',
      planCode: 'shop-basic',
      planName: 'Gói cơ bản',
      billingMode: BILLING_MODE.PACKAGE,
      commissionPercent: null,
      quota: { maxVehicles: 5, maxBranches: 1, maxMembers: null },
      endsAt: '2027-01-01T00:00:00.000Z',
    },
    usage: {
      car: { used: 2, onMarketplace: 2 },
      motorbike: { used: 0, onMarketplace: 0 },
    },
    fleetQuota: { kind: 'total', totalLimit: 5, totalUsed: 2, reason: 'plan' },
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
  currentUser.data = packageScope();
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

    expect(screen.getByText('Gói cơ bản')).toBeTruthy();
    // Trần là MỘT ô cho cả đội xe (ADR 0041 điều 4); hai ô theo loại chỉ nói mức dùng.
    expect(screen.getByText('Tổng số xe')).toBeTruthy();
    expect(screen.getByText('2/5')).toBeTruthy();
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
   * ĐÃ HẾT trần — và nó vẫn là cảnh báo, không phải lỗi: dùng hết hạn mức đã mua là trạng thái
   * hợp lệ của gói.
   */
  it('còn chỗ trống: KHÔNG dựng dải cảnh báo nào', () => {
    renderWorkspace();

    expect(screen.queryByText(/Đã dùng hết hạn mức/)).toBeNull();
  });

  /*
   * Câu chữ đi theo `reason`: chạm trần của bậc ĐÃ MUA thì việc cần làm là nâng bậc. Mời một
   * gian hàng đang trả tiền đi "mua gói" là dẫn họ tới thứ họ đã có.
   */
  it('hết trần của bậc đã mua: dẫn tới NÂNG BẬC, không phải mua gói', () => {
    me.data = subscriptionFixture({
      fleetQuota: { kind: 'total', totalLimit: 3, totalUsed: 3, reason: 'plan' },
    });
    renderWorkspace();

    expect(screen.getByText(/Đã dùng hết hạn mức 3 xe/)).toBeTruthy();
    expect(screen.getByText(/Nâng lên bậc gói lớn hơn/)).toBeTruthy();
  });

  it('hết trần Owner Lite: dẫn tới MUA GÓI', () => {
    me.data = subscriptionFixture({
      fleetQuota: { kind: 'total', totalLimit: 3, totalUsed: 3, reason: 'owner_lite' },
    });
    renderWorkspace();

    expect(screen.getByText(/Mua gói gian hàng để đăng thêm xe/)).toBeTruthy();
  });

  /*
   * Trần là MỘT con số cho cả đội xe ở CẢ HAI tuyến (ADR 0041 điều 4). Hai ô theo loại vẫn ở
   * lại vì màn hình cần con số đó, nhưng chúng không mang trần — viết trần tổng vào ô của từng
   * loại là màn hình nói "3 ô tô" trong khi backend chặn ở "3 xe".
   */
  it('ô theo loại chỉ nói mức dùng, không kèm trần', () => {
    me.data = subscriptionFixture({
      fleetQuota: { kind: 'total', totalLimit: 3, totalUsed: 2, reason: 'owner_lite' },
    });
    renderWorkspace();

    expect(screen.getByText('Tổng số xe')).toBeTruthy();
    expect(screen.getByText('2/3')).toBeTruthy();
    expect(screen.getByText('Ô tô')).toBeTruthy();
    expect(screen.queryByText('2/2')).toBeNull();
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

  /**
   * Phí dịch vụ hiện ra từ CHÍNH SÁCH PHÍ hiệu lực (`/auth/me`), KHÔNG từ `commissionPercent`
   * của gói: hai con số không bị ràng buộc phải bằng nhau (ADR 0029 điều 2), và thứ thật sự trừ
   * vào tiền chủ xe là con số của chính sách.
   */
  it('tuyến hoa hồng: in phí của CHÍNH SÁCH, không in phần trăm của gói', () => {
    me.data = subscriptionFixture({ currentPlan: COMMISSION_PLAN });
    currentUser.data = commissionScope({ serviceFeePercent: 7 });
    renderWorkspace();

    expect(screen.getByText('7% / chuyến')).toBeTruthy();
    // `commissionPercent: 10` của gói KHÔNG được lên màn hình.
    expect(screen.queryByText(/10%/)).toBeNull();
  });

  it('chưa có chính sách phí hiệu lực: KHÔNG dựng ô phí dịch vụ', () => {
    me.data = subscriptionFixture({ currentPlan: COMMISSION_PLAN });
    currentUser.data = commissionScope({ serviceFeePercent: null });
    renderWorkspace();

    expect(screen.queryByText('Phí dịch vụ')).toBeNull();
  });
});

/**
 * HAI TUYẾN, HAI LỜI MỜI (ADR 0028 điều 1).
 *
 * Gói hoa hồng cũng là một `currentPlan`, nên bản cũ mời chủ xe tuyến hoa hồng "Gia hạn / đổi
 * gói" — một thứ họ chưa từng mua — rồi mở hộp thoại mua gói không có bước hồ sơ nào. Câu chữ và
 * màn hình phải đi theo TUYẾN, không theo "có dòng gói hay không".
 */
describe('SubscriptionWorkspace — gia hạn hay nâng cấp', () => {
  /**
   * Tuyến hoa hồng KHÔNG có nút nào ở khối gói: lối nâng cấp của họ là cả một luồng ba bước dựng
   * sẵn ngay bên dưới, với bảng giá mở sẵn. Thứ tuyệt đối không được xuất hiện là lời mời "Gia
   * hạn / đổi gói" — họ chưa từng mua gói nào để mà gia hạn.
   */
  it('tuyến hoa hồng: KHÔNG mời gia hạn, và luồng nâng cấp nằm ngay trên trang', () => {
    me.data = subscriptionFixture({ currentPlan: COMMISSION_PLAN });
    currentUser.data = commissionScope();
    renderWorkspace();

    expect(screen.queryByRole('button', { name: /Gia hạn \/ đổi gói/ })).toBeNull();
    // Bảng giá không nằm sau một cú bấm: khối nâng cấp dựng sẵn ngay dưới khối gói.
    expect(
      screen.getByRole('heading', { name: 'Các bước nâng cấp gian hàng' }),
    ).toBeTruthy();
  });

  /**
   * Hoá đơn chờ hiện ở ĐÚNG MỘT chỗ trên màn.
   *
   * Luồng nâng cấp dựng khối chuyển khoản ở bước 3 của nó, còn sổ hoá đơn cũng dựng một khối như
   * vậy cho hoá đơn đang chờ. Cả hai cùng bật thì trang có hai mã QR cho CÙNG một khoản tiền, và
   * người dùng không có cách nào biết chúng là một.
   */
  it('tuyến hoa hồng đang chờ tiền: chỉ MỘT khối chuyển khoản, không nhân đôi mã QR', () => {
    me.data = subscriptionFixture({ currentPlan: COMMISSION_PLAN });
    currentUser.data = commissionScope();
    pendingInvoice.data = {
      id: 'INV1',
      code: 'XPG123456',
      planId: 'PLAN1',
      planCode: 'shop-basic',
      termMonths: 3,
      quota: { maxVehicles: 5, maxBranches: 1, maxMembers: null },
      status: 'issued',
      totalAmount: '250000',
      paidAmount: '0',
    };
    renderWorkspace();

    expect(screen.getAllByText('XPG123456')).toHaveLength(1);
  });

  it('tuyến gói: giữ nguyên "Gia hạn / đổi gói", không có khối nâng cấp', () => {
    renderWorkspace();

    expect(screen.getByRole('button', { name: /Gia hạn \/ đổi gói/ })).toBeTruthy();
    expect(
      screen.queryByRole('heading', { name: 'Các bước nâng cấp gian hàng' }),
    ).toBeNull();
  });

  /*
   * Thiếu quyền mua thì KHÔNG có CTA nào, và cũng KHÔNG dựng luồng nâng cấp trong cây — một form
   * treo sẵn là một đường vào bằng phím tắt mà API sẽ từ chối ở bước cuối.
   */
  it('tuyến hoa hồng nhưng không có quyền mua: không CTA, không khối nâng cấp', () => {
    me.data = subscriptionFixture({ currentPlan: COMMISSION_PLAN });
    currentUser.data = commissionScope();
    grant(PERMISSION.SUBSCRIPTION_VIEW);
    renderWorkspace();

    expect(screen.queryByRole('button', { name: /Gia hạn \/ đổi gói/ })).toBeNull();
    expect(
      screen.queryByRole('heading', { name: 'Các bước nâng cấp gian hàng' }),
    ).toBeNull();
  });

  /**
   * Gian hàng đã trả tiền rồi hết gói cũng rơi về `billingMode = commission`. Họ là khách cũ cần
   * GIA HẠN — mời họ "nâng cấp lên gian hàng" là kể sai câu chuyện của chính họ (ADR 0040 điều 4).
   */
  it('gian hàng hết gói: vẫn là gia hạn, không phải nâng cấp', () => {
    me.data = subscriptionFixture({ currentPlan: COMMISSION_PLAN });
    currentUser.data = commissionScope({
      onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
      billingPhase: 'lapsed',
    });
    renderWorkspace();

    expect(screen.getByRole('button', { name: /Gia hạn \/ đổi gói/ })).toBeTruthy();
    expect(
      screen.queryByRole('heading', { name: 'Các bước nâng cấp gian hàng' }),
    ).toBeNull();
  });
});
