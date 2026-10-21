import { App } from 'antd';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BILLING_MODE,
  PERMISSION,
  SHOP_ONBOARDING_STATE,
  TENANT_ROLE,
  type Permission,
} from '@xeprime/types';

import type { CurrentPlan, MySubscription, SubscriptionInvoice, TenantPlan } from '../types';
import { SubscriptionWorkspace } from './SubscriptionWorkspace';

/**
 * Màn "Gói & hạn mức" — section `plan` của trang Cửa hàng (tuyến gói) và của "Hồ sơ chủ xe"
 * (tuyến hoa hồng).
 *
 * Bộ này khoá ba nhóm điều, cả ba đều là lỗi đã có thật hoặc sẽ có nếu làm sai:
 *
 *  1. **Gói theo LOẠI XE (ADR 0065).** Hai làn xe máy / ô tô, mỗi làn gói riêng, trần riêng, nút
 *     mua riêng; gói doanh nghiệp phủ cả hai thì hai làn đóng lại; loại xe chưa có gói nói thẳng
 *     "chưa đăng lên chợ được" thay vì một con số 0/0.
 *  2. **Giao diện khớp với API về quyền MUA.** `shop_manager` có `subscription.view` nhưng không có
 *     `subscription.purchase` — không CTA mua nào, không modal treo sẵn trong cây.
 *  3. **Không hứa những con số hệ thống không giữ** — phí dịch vụ đọc từ chính sách phí, không từ
 *     `commissionPercent` của gói; không còn trần chi nhánh.
 */
const perms = vi.hoisted(() => ({ granted: new Set<string>() }));
const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({
    push: nav.push,
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
}));

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
  data: { items: [] as unknown[], meta: { page: 1, limit: 20, total: 0, hasNext: false } },
  isFetching: false,
  isPending: false,
  isError: false,
  refetch: vi.fn(),
}));
/** Hoá đơn ĐANG CHỜ — tối đa một mỗi loại xe, đọc bằng một lượt RIÊNG. */
const pending = vi.hoisted(() => ({
  data: [] as SubscriptionInvoice[],
  isPending: false,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const plans = vi.hoisted(() => ({
  data: [] as TenantPlan[],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));

vi.mock('../hooks/use-subscription', () => ({
  useMySubscription: () => me,
  usePendingInvoices: () => pending,
  useSubscriptionInvoices: () => invoices,
  useTenantPlans: () => plans,
  usePurchaseSubscription: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  usePaymentInfo: () => ({ data: undefined, isLoading: false, isError: false }),
  useSyncScopeWhenInvoiceSettles: () => undefined,
}));

const url = vi.hoisted(() => ({
  purchase: false,
  lane: undefined as string | undefined,
  setFilters: (() => undefined) as (p: unknown, o?: unknown) => void,
}));
vi.mock('@/hooks/use-url-filters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-url-filters')>();
  return {
    ...actual,
    useUrlFilters: () => ({
      filters: { page: 1, purchase: url.purchase, lane: url.lane },
      setFilters: (patch: unknown, options?: unknown) => url.setFilters(patch, options),
    }),
  };
});

vi.mock('@/hooks/use-feature', () => ({ useFeatureStates: () => ({}) }));

/** PHA và TUYẾN đọc từ `/auth/me` (ADR 0038 điều 1) — chặn đúng ở ranh giới đó. */
const currentUser = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => currentUser,
}));

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

function commissionScope(over: Record<string, unknown> = {}) {
  return packageScope({
    billingMode: BILLING_MODE.COMMISSION,
    onboardingState: SHOP_ONBOARDING_STATE.COMMISSION,
    ...over,
  });
}

const MOTO_PLAN: CurrentPlan = {
  subscriptionId: 'SUB-M',
  planId: 'PLAN-M5',
  planCode: 'moto_5',
  planName: 'Xe máy 5 xe',
  vehicleScope: 'motorbike',
  phase: 'current',
  billingMode: BILLING_MODE.PACKAGE,
  commissionPercent: null,
  quota: { maxVehicles: 5, maxBranches: null, maxMembers: null },
  endsAt: '2027-01-01T00:00:00.000Z',
};

const ENTERPRISE_PLAN: CurrentPlan = {
  ...MOTO_PLAN,
  subscriptionId: 'SUB-E',
  planId: 'PLAN-E',
  planCode: 'enterprise_contact',
  planName: 'Doanh nghiệp',
  vehicleScope: 'all',
  quota: { maxVehicles: null, maxBranches: null, maxMembers: null },
};

/** Gói hoa hồng vẫn là một `currentPlan` — nhưng không bao giờ nằm trong `currentPlans`. */
const COMMISSION_PLAN: CurrentPlan = {
  subscriptionId: 'SUB2',
  planId: 'PLAN2',
  planCode: 'free',
  planName: 'Tuyến hoa hồng',
  vehicleScope: 'all',
  phase: 'current',
  billingMode: BILLING_MODE.COMMISSION,
  commissionPercent: 10,
  quota: null,
  endsAt: '2027-01-01T00:00:00.000Z',
};

type Quota = MySubscription['vehicleQuotas']['car'];

const motoQuota = (over: Partial<Quota> = {}): Quota => ({
  kind: 'total',
  limit: 5,
  reason: 'plan',
  countedScope: 'motorbike',
  used: 2,
  onMarketplace: 2,
  subscriptionId: 'SUB-M',
  planCode: 'moto_5',
  planName: 'Xe máy 5 xe',
  phase: 'current',
  ...over,
});

/** Gian hàng tuyến gói chỉ có gói xe máy: ô tô `scope_required`. */
const CAR_NOT_COVERED: Quota = {
  kind: 'scope_required',
  limit: null,
  reason: null,
  countedScope: 'car',
  used: 1,
  onMarketplace: 0,
  subscriptionId: null,
  planCode: null,
  planName: null,
  phase: null,
};

/** Owner Lite: một trần TỔNG cho cả hai loại. */
const ownerLite = (used: number): Quota => ({
  kind: 'total',
  limit: 3,
  reason: 'owner_lite',
  countedScope: 'all',
  used,
  onMarketplace: used,
  subscriptionId: null,
  planCode: null,
  planName: null,
  phase: null,
});

function subscriptionFixture(over: Partial<MySubscription> = {}): MySubscription {
  return {
    currentPlan: MOTO_PLAN,
    currentPlans: [MOTO_PLAN],
    usage: {
      car: { used: 1, onMarketplace: 0 },
      motorbike: { used: 2, onMarketplace: 2 },
    },
    vehicleQuotas: { motorbike: motoQuota(), car: CAR_NOT_COVERED },
    fleetQuota: { kind: 'total', totalLimit: 5, totalUsed: 3, reason: 'plan' },
    freeTrips: { allowance: 2, used: 0, left: 2 },
    ...over,
  } as MySubscription;
}

function commissionFixture(used = 2): MySubscription {
  return subscriptionFixture({
    currentPlan: COMMISSION_PLAN,
    currentPlans: [],
    vehicleQuotas: { motorbike: ownerLite(used), car: ownerLite(used) },
  });
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

const lane = (name: 'Gói xe máy' | 'Gói ô tô') => screen.getByRole('article', { name });

beforeEach(() => {
  me.data = subscriptionFixture();
  me.isLoading = false;
  me.isError = false;
  invoices.data = { items: [], meta: { page: 1, limit: 20, total: 0, hasNext: false } };
  pending.data = [];
  plans.data = [];
  currentUser.data = packageScope();
  grant(PERMISSION.SUBSCRIPTION_VIEW, PERMISSION.SUBSCRIPTION_PURCHASE);
  url.purchase = false;
  url.lane = undefined;
  url.setFilters = vi.fn();
});

afterEach(cleanup);

describe('SubscriptionWorkspace — hai làn theo loại xe (ADR 0065)', () => {
  it('làn có gói: tên gói, mức dùng theo ĐÚNG loại xe, nút gia hạn của chính làn đó', () => {
    renderWorkspace();

    const moto = lane('Gói xe máy');
    expect(within(moto).getByText('Xe máy 5 xe')).toBeTruthy();
    expect(within(moto).getByText(/Đang có 2\/5 xe/)).toBeTruthy();
    expect(within(moto).getByRole('button', { name: 'Gia hạn / đổi gói' })).toBeTruthy();
  });

  it('loại xe chưa có gói: nói thẳng "chưa đăng lên chợ được" + nút mua ĐÚNG loại đó', () => {
    renderWorkspace();

    const car = lane('Gói ô tô');
    expect(within(car).getByText('Chưa có gói ô tô — ô tô chưa đăng lên chợ được.')).toBeTruthy();
    expect(within(car).getByRole('button', { name: 'Mua gói ô tô' })).toBeTruthy();
    // Ô hạn mức ở đầu trang cũng nói "chưa có gói", không phải "0/0".
    expect(screen.getAllByText('Chưa có gói').length).toBeGreaterThan(0);
    expect(screen.queryByText('0/0')).toBeNull();
  });

  it('bấm "Mua gói ô tô" mở hộp thoại của LÀN Ô TÔ', async () => {
    renderWorkspace();
    fireEvent.click(within(lane('Gói ô tô')).getByRole('button', { name: 'Mua gói ô tô' }));

    expect(await screen.findByText('Mua / gia hạn Gói ô tô')).toBeTruthy();
  });

  it('hai ô hạn mức theo loại — mỗi ô một trần, không có ô "Tổng số xe"', () => {
    renderWorkspace();

    expect(screen.getByText('2/5')).toBeTruthy();
    expect(screen.queryByText('Tổng số xe')).toBeNull();
  });

  /** Doanh nghiệp phủ cả hai loại: mua một gói xe máy lúc này là trả tiền cho thứ chưa dùng tới. */
  it('gói doanh nghiệp đang chạy: phủ cả hai loại, KHÔNG có nút mua làn nào', () => {
    me.data = subscriptionFixture({
      currentPlan: ENTERPRISE_PLAN,
      currentPlans: [ENTERPRISE_PLAN],
      vehicleQuotas: {
        motorbike: motoQuota({ kind: 'unlimited', limit: null, countedScope: 'all' }),
        car: motoQuota({ kind: 'unlimited', limit: null, countedScope: 'all', used: 1 }),
      },
    });
    renderWorkspace();

    expect(
      screen.getByText('Gian hàng đang dùng gói doanh nghiệp, phủ cả xe máy lẫn ô tô.'),
    ).toBeTruthy();
    expect(screen.getByText('Không giới hạn xe máy và ô tô')).toBeTruthy();
    expect(screen.queryByRole('article', { name: 'Gói xe máy' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Mua gói/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Gia hạn / đổi gói' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Liên hệ tư vấn' })).toBeTruthy();
  });

  it('danh mục có bậc doanh nghiệp: thẻ "Liên hệ tư vấn" đứng cạnh hai làn, không có giá', () => {
    plans.data = [
      {
        id: 'PLAN-E',
        code: 'enterprise_contact',
        name: 'Gói doanh nghiệp',
        billingMode: BILLING_MODE.PACKAGE,
        vehicleScope: 'all',
        limits: {
          maxVehicles: null,
          maxBranches: null,
          maxMembers: null,
          termPrices: [],
          salesOnly: true,
          recommended: false,
          graceDays: 7,
          features: [],
        },
        currency: 'VND',
        status: 'active',
        sortOrder: 9,
        createdAt: '2026-10-21T00:00:00.000Z',
      } as TenantPlan,
    ];
    renderWorkspace();

    expect(lane('Gói xe máy')).toBeTruthy();
    expect(screen.getByText('Gói doanh nghiệp')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Liên hệ tư vấn' }).getAttribute('href')).toBe(
      '/support',
    );
  });

  it('hoá đơn chờ của một làn: làn đó có lối thanh toán đúng mã', () => {
    pending.data = [
      {
        id: 'INV-C',
        code: 'XPGCAR01',
        planId: 'PLAN-C1',
        planCode: 'car_1',
        vehicleScope: 'car',
        termMonths: 1,
        quota: { maxVehicles: 1, maxBranches: null, maxMembers: null },
        status: 'issued',
        totalAmount: '300000',
        paidAmount: '0',
        periodFrom: '2026-10-21T00:00:00.000Z',
        periodTo: '2026-11-21T00:00:00.000Z',
        createdAt: '2026-10-21T00:00:00.000Z',
      } as unknown as SubscriptionInvoice,
    ];
    renderWorkspace();

    expect(within(lane('Gói ô tô')).getByText('Hoá đơn XPGCAR01 đang chờ thanh toán')).toBeTruthy();
    expect(within(lane('Gói xe máy')).queryByText(/đang chờ thanh toán/)).toBeNull();
  });

  it('hết suất xe máy: cảnh báo nói đúng loại xe và lối nâng gói xe máy', () => {
    me.data = subscriptionFixture({
      vehicleQuotas: { motorbike: motoQuota({ used: 5 }), car: CAR_NOT_COVERED },
    });
    renderWorkspace();

    expect(screen.getByText('Đã dùng hết 5 suất xe máy của gói.')).toBeTruthy();
    expect(screen.getByText(/Nâng gói xe máy lên bậc lớn hơn/)).toBeTruthy();
  });

  it('còn chỗ trống: KHÔNG dựng dải cảnh báo nào', () => {
    renderWorkspace();
    expect(screen.queryByText(/Đã dùng hết/)).toBeNull();
  });

  /** Trần chi nhánh thôi là hạn mức (ADR 0065 điều 1). */
  it('không in trần chi nhánh ở bất kỳ đâu', () => {
    renderWorkspace();
    expect(screen.queryByText(/chi nhánh/)).toBeNull();
  });
});

describe('SubscriptionWorkspace — ý định từ URL (?lane= · ?purchase=1)', () => {
  it('?lane=car&purchase=1 (CTA ở màn xe): mở hộp thoại của làn ô tô và gỡ tham số', async () => {
    url.purchase = true;
    url.lane = 'car';
    renderWorkspace();

    expect(await screen.findByText('Mua / gia hạn Gói ô tô')).toBeTruthy();
    expect(url.setFilters).toHaveBeenCalledWith(
      { purchase: false, lane: undefined },
      { resetPage: false },
    );
  });

  it('?purchase=1 trần với đúng MỘT làn có gói: mở hộp thoại của làn đó', async () => {
    url.purchase = true;
    renderWorkspace();

    expect(await screen.findByText('Mua / gia hạn Gói xe máy')).toBeTruthy();
  });

  it('thiếu quyền mua: không mở hộp thoại, vẫn gỡ tham số', () => {
    grant(PERMISSION.SUBSCRIPTION_VIEW);
    url.purchase = true;
    url.lane = 'car';
    renderWorkspace();

    expect(screen.queryByText(/Mua \/ gia hạn/)).toBeNull();
    expect(url.setFilters).toHaveBeenCalled();
  });
});

describe('SubscriptionWorkspace — quyền mua gói', () => {
  /*
   * `shop_manager` điển hình: xem được hạn mức để điều hành đội xe, nhưng mua là việc của chủ
   * gian hàng. Không CTA nào được dẫn họ vào luồng đó — kể cả CTA phụ trong danh sách tính năng.
   */
  it('chỉ subscription.view: KHÔNG có CTA mua nào, nhưng vẫn xem được gói và hạn mức', () => {
    grant(PERMISSION.SUBSCRIPTION_VIEW);
    renderWorkspace();

    expect(screen.queryByRole('button', { name: /Gia hạn \/ đổi gói/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Mua gói/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Xem gói cao hơn/ })).toBeNull();
    expect(screen.getByText('Xe máy 5 xe')).toBeTruthy();
    expect(screen.getByText('2/5')).toBeTruthy();
  });

  it('chỉ subscription.view: modal mua KHÔNG nằm trong cây, không chỉ là bị ẩn', () => {
    grant(PERMISSION.SUBSCRIPTION_VIEW);
    renderWorkspace();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('.ant-modal-root')).toBeNull();
  });
});

describe('SubscriptionWorkspace — hoá đơn', () => {
  it('chưa có hoá đơn nào: một dòng chữ gọn, KHÔNG dựng bảng lịch sử', () => {
    renderWorkspace();

    expect(screen.getByText('Chưa phát sinh hoá đơn.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('HAI hoá đơn chờ (xe máy + ô tô): mỗi mã một thẻ thanh toán', () => {
    const base = {
      planId: 'P',
      termMonths: 1,
      quota: { maxVehicles: 1, maxBranches: null, maxMembers: null },
      status: 'issued',
      totalAmount: '300000',
      paidAmount: '0',
      periodFrom: '2026-10-21T00:00:00.000Z',
      periodTo: '2026-11-21T00:00:00.000Z',
      createdAt: '2026-10-21T00:00:00.000Z',
    };
    pending.data = [
      { ...base, id: 'I1', code: 'XPGMOTO1', planCode: 'moto_1', vehicleScope: 'motorbike' },
      { ...base, id: 'I2', code: 'XPGCAR01', planCode: 'car_1', vehicleScope: 'car' },
    ] as unknown as SubscriptionInvoice[];
    renderWorkspace();

    expect(screen.getByText('XPGMOTO1')).toBeTruthy();
    expect(screen.getByText('XPGCAR01')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /Thanh toán/ })).toHaveLength(4);
  });
});

describe('SubscriptionWorkspace — tuyến hoa hồng', () => {
  it('trần CHUNG Owner Lite: MỘT ô "Tổng số xe", không hai ô cùng in "3"', () => {
    me.data = commissionFixture(2);
    currentUser.data = commissionScope({ serviceFeePercent: 7 });
    renderWorkspace();

    expect(screen.getByText('Tổng số xe')).toBeTruthy();
    expect(screen.getAllByText('2/3')).toHaveLength(1);
  });

  /** Phí dịch vụ hiện ra từ CHÍNH SÁCH PHÍ hiệu lực, KHÔNG từ `commissionPercent` của gói. */
  it('in phí của CHÍNH SÁCH, không in phần trăm của gói', () => {
    me.data = commissionFixture();
    currentUser.data = commissionScope({ serviceFeePercent: 7 });
    renderWorkspace();

    expect(screen.getByText('7% / chuyến')).toBeTruthy();
    expect(screen.queryByText(/10%/)).toBeNull();
  });

  it('chủ xe chưa từng trả: KHÔNG có làn mua — luồng nâng cấp nằm ngay trên trang', () => {
    me.data = commissionFixture();
    currentUser.data = commissionScope();
    renderWorkspace();

    expect(screen.queryByRole('article', { name: 'Gói xe máy' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Gia hạn \/ đổi gói/ })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Các bước nâng cấp gian hàng' })).toBeTruthy();
  });

  it('hết trần Owner Lite: dẫn tới MUA GÓI', () => {
    me.data = commissionFixture(3);
    currentUser.data = commissionScope();
    renderWorkspace();

    expect(screen.getByText(/Đã dùng hết hạn mức 3 xe/)).toBeTruthy();
    expect(screen.getByText(/Mua gói gian hàng để đăng thêm xe/)).toBeTruthy();
  });

  /**
   * Gian hàng đã trả tiền rồi hết gói cũng rơi về tuyến hoa hồng. Họ là khách cũ cần GIA HẠN — mời
   * họ "nâng cấp lên gian hàng" là kể sai câu chuyện của chính họ (ADR 0040 điều 4).
   */
  it('gian hàng hết gói: hai làn để mua lại, không phải luồng nâng cấp', () => {
    me.data = commissionFixture();
    currentUser.data = commissionScope({
      onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
      billingPhase: 'lapsed',
    });
    renderWorkspace();

    expect(within(lane('Gói xe máy')).getByRole('button', { name: 'Mua gói xe máy' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Các bước nâng cấp gian hàng' })).toBeNull();
  });
});
