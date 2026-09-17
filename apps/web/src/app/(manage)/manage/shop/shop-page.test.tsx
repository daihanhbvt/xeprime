import { App } from 'antd';
import { Provider } from 'react-redux';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BILLING_MODE,
  PERMISSION,
  SHOP_ONBOARDING_STATE,
  SHOP_VERIFICATION,
  TENANT_ROLE,
  TENANT_STATUS,
  type Permission,
} from '@xeprime/types';

import type { MyShop } from '@/features/shop/types';
import { makeStore } from '@/store/make-store';

import ShopPage from './page';

/**
 * TRANG CỬA HÀNG — một trang, năm section (16/09/2026).
 *
 * Bộ này khoá đúng những gì đợt gộp hứa, và mỗi khẳng định tương ứng với một guard thật ở API:
 *
 *  1. **Năm section cùng có mặt**, `?section=` chỉ chọn mục đang sáng — KHÔNG phải tab. Nếu
 *     chọn section là tháo khối cũ ra thì người đang gõ dở hồ sơ mà bấm sang "Gói & hạn mức" để
 *     xem hạn sẽ mất sạch thay đổi chưa lưu.
 *  2. **Query rác rơi về `profile`**, không dựng một trang trống.
 *  3. **Chủ gian hàng CHỈ ĐỌC**, đọc từ `ownerAccount` (`tenants.owner_user_id → users`).
 *  4. **"Tài khoản nhận tiền" chỉ chủ gian hàng** — khớp `@ShopOwnerOnly()` ở
 *     `/shop/bank-accounts`; quản lý ăn 403 ngay ở lượt GET nên hiện khối rỗng cho họ là mời
 *     vào một cánh cửa đã khoá.
 *  5. **"Gói & hạn mức" theo `subscription.view`**, CTA mua theo `subscription.purchase`.
 */
const perms = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.has(p),
    hasAny: (...ps: string[]) => ps.some((p) => perms.granted.has(p)),
    isLoading: false,
  }),
}));

const scope = vi.hoisted(() => ({
  roleKey: 'shop_owner' as string,
  /** Trục đăng ký (ADR 0040) — dải chào mừng đọc nó, xem `isEstablishedPackageShop`. */
  onboardingState: 'package_active' as string,
}));
vi.mock('@/hooks/use-tenant-scope', () => ({
  useTenantScope: () => ({
    tenant: {
      id: 'T1',
      name: 'Việt Car Hà Nội',
      roleKey: scope.roleKey,
      onboardingState: scope.onboardingState,
    },
    hasNoTenant: false,
  }),
}));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({
    data: {
      id: '01HUSER000000000000000000',
      displayName: 'Phạm Đức Việt',
      tenant: { roleKey: scope.roleKey, billingPhase: 'current' },
    },
  }),
}));

const shopQuery = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
vi.mock('@/features/shop/hooks/use-shop', () => ({
  useMyShop: () => shopQuery,
  useUpdateShopProfile: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useSubmitShopReview: () => ({ mutate: vi.fn(), isPending: false }),
}));

/** `?section=` sống ở URL (ADR 0004) — ở đây chặn ở đúng ranh giới đó. */
const url = vi.hoisted(() => ({
  section: null as string | null,
  welcome: false,
  setFilters: vi.fn(),
}));
vi.mock('@/hooks/use-url-filters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-url-filters')>();
  return {
    ...actual,
    useUrlFilters: (parse: (p: URLSearchParams) => unknown) => {
      const params = new URLSearchParams();
      if (url.section) params.set('section', url.section);
      if (url.welcome) params.set('welcome', '1');
      return { filters: parse(params), setFilters: url.setFilters };
    },
  };
});

// Danh mục địa chỉ + bản đồ: stub rỗng — hành vi của ô đó có test riêng.
vi.mock('@/features/locations/hooks/use-provinces', () => ({
  useProvinceOptions: () => ({
    options: [{ value: '01', label: 'Hà Nội' }],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/features/locations/hooks/use-wards', () => ({
  useWardOptions: () => ({
    options: [],
    items: [],
    total: 0,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/features/locations/hooks/use-places', () => ({
  PLACE_SEARCH_MIN_LENGTH: 3,
  usePlaceSearch: () => ({ data: { items: [], available: false }, isFetching: false }),
  usePlaceDetail: () => ({ mutateAsync: vi.fn() }),
  useReverseGeocode: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/components/form/MapPinPicker', () => ({ MapPinPicker: () => null }));

/** Sổ tài khoản nhận tiền — bộ này chỉ hỏi "khối có mặt không", không kiểm hành vi của sổ. */
const bankAccounts = vi.hoisted(() => ({
  data: [] as unknown[],
  isPending: false,
  isError: false,
}));
vi.mock('@/features/bank-accounts/hooks/use-bank-accounts', () => ({
  useBankAccounts: () => bankAccounts,
  useCreateBankAccount: () => ({ mutate: vi.fn(), isPending: false }),
  useSetDefaultBankAccount: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveBankAccount: () => ({ mutate: vi.fn(), isPending: false }),
}));

const subscription = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
vi.mock('@/features/subscription/hooks/use-subscription', () => ({
  useMySubscription: () => subscription,
  // Hoá đơn đang chờ là một lượt đọc riêng — xem `usePendingInvoice`.
  usePendingInvoice: () => ({ data: undefined, isPending: false, isError: false }),
  useSubscriptionInvoices: () => ({
    data: { items: [], meta: { page: 1, limit: 20, total: 0, hasNext: false } },
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useTenantPlans: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  usePurchaseSubscription: () => ({ mutate: vi.fn(), isPending: false }),
  usePaymentInfo: () => ({ data: undefined, isLoading: false, isError: false }),
}));
vi.mock('@/hooks/use-feature', () => ({ useFeatureStates: () => ({}) }));

/**
 * Dải chào mừng sau lần mua gói đầu (ADR 0040) đếm xe để biết nên mời "đăng xe đầu tiên" hay im.
 * Chặn ở tầng hook: bộ này kiểm trang Cửa hàng, không kiểm dải đó — nó có test riêng — và gọi
 * thật thì kéo theo cả `useBranchScope` (redux) lẫn một lượt đọc `/vehicles`.
 */
const vehicles = vi.hoisted(() => ({
  data: { items: [] as unknown[] },
  isPending: false,
  isLoading: false,
}));
vi.mock('@/features/vehicles/hooks/use-vehicles', () => ({
  useVehicles: () => vehicles,
}));

function makeShop(): MyShop {
  return {
    id: '01HSHOP00000000000000000A',
    code: 'SHOP-1',
    slug: 'viet-car-ha-noi',
    name: 'Việt Car Hà Nội',
    tenantType: 'business',
    status: TENANT_STATUS.ACTIVE,
    onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
    verification: SHOP_VERIFICATION.VERIFIED,
    phone: null,
    email: null,
    latestApproval: null,
    ownerAccount: {
      userId: '01HUSER000000000000000000',
      displayName: 'Phạm Đức Việt',
      email: 'owner.hanoi@xeprime.test',
      phone: '84903000001',
      emailVerified: true,
      phoneVerified: true,
    },
    defaultBranch: {
      id: '01HBRANCH0000000000000000',
      code: 'CN01',
      name: 'Chi nhánh Hà Nội',
      provinceCode: '01',
      provinceName: 'Hà Nội',
      needsLocationReview: false,
    },
    profile: {
      displayName: 'Việt Car Hà Nội',
      bio: 'Cho thuê xe tự lái',
      logoUrl: null,
      coverUrl: null,
      address: '12 Nguyễn Thái Học',
      provinceCode: '01',
      provinceName: 'Hà Nội',
      taxCode: null,
      businessLicenseNo: null,
    },
  };
}

function grant(...permissions: Permission[]) {
  perms.granted = new Set<string>(permissions);
}

/**
 * `scrollIntoView` không tồn tại trong jsdom — phải tự cấp, và cấp luôn là chỗ để QUAN SÁT:
 * "có cuộn không, và tới khối nào" là hai câu hỏi mà bộ này cần trả lời.
 */
const scrolledIds: string[] = [];
const scrollIntoView = vi.fn(function (this: HTMLElement) {
  scrolledIds.push(this.id);
});
Element.prototype.scrollIntoView = scrollIntoView as unknown as Element['scrollIntoView'];

/**
 * `Provider` của redux là THẬT, không mock: vỏ quản lý đặt phạm vi chi nhánh ở store, và vài
 * nhánh con của trang đọc nó. Một store trống đúng bằng trạng thái mặc định của người vừa mở
 * trang, nên nó không dựng ra hành vi nào không có thật.
 */
function renderPage() {
  return render(
    <Provider store={makeStore()}>
      <App>
        <ShopPage />
      </App>
    </Provider>,
  );
}

/** Cột mục lục bên trái — nhãn ở đây TRÙNG tiêu đề section, nên mọi khẳng định phải khoanh vùng. */
const sectionNav = () =>
  within(screen.getByRole('navigation', { name: 'Các mục của trang Cửa hàng' }));

beforeEach(() => {
  scrollIntoView.mockClear();
  scrolledIds.length = 0;
  scope.roleKey = TENANT_ROLE.SHOP_OWNER;
  scope.onboardingState = SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE;
  shopQuery.data = makeShop();
  shopQuery.isLoading = false;
  shopQuery.isError = false;
  url.section = null;
  url.welcome = false;
  url.setFilters.mockReset();
  vehicles.data = { items: [] };
  vehicles.isLoading = false;
  bankAccounts.data = [];
  subscription.data = {
    currentPlan: {
      subscriptionId: 'SUB1',
      planId: 'PLAN1',
      planCode: 'shop-advanced',
      planName: 'Gói nâng cao',
      billingMode: BILLING_MODE.PACKAGE,
      commissionPercent: null,
      quota: { maxVehicles: 10, maxBranches: 3, maxMembers: null },
      endsAt: '2026-12-01T00:00:00.000Z',
    },
    usage: {
      car: { used: 8, onMarketplace: 8 },
      motorbike: { used: 2, onMarketplace: 2 },
    },
    fleetQuota: { kind: 'total', totalLimit: 10, totalUsed: 10, reason: 'plan' },
    freeTrips: { allowance: 0, used: 0, left: 0 },
  };
  grant(
    PERMISSION.TENANT_VIEW,
    PERMISSION.TENANT_UPDATE,
    PERMISSION.SUBSCRIPTION_VIEW,
    PERMISSION.SUBSCRIPTION_PURCHASE,
  );
});

afterEach(cleanup);

describe('Trang Cửa hàng — năm section trong một trang', () => {
  it('chủ gian hàng thấy đủ năm mục trong mục lục, đúng thứ tự', () => {
    renderPage();

    expect(
      sectionNav()
        .getAllByRole('link')
        .map((el) => el.textContent),
    ).toEqual([
      'Thông tin hiển thị',
      'Chủ gian hàng',
      'Địa chỉ & pháp lý',
      'Tài khoản nhận tiền',
      'Gói & hạn mức',
    ]);
  });

  /*
   * Đây là khẳng định quan trọng nhất của bố cục: KHÔNG phải tab. Cả năm khối cùng nằm trong
   * DOM, `?section=` chỉ quyết định mục nào sáng và cuộn tới đâu — nếu không thì form hồ sơ bị
   * tháo ra mỗi lần người dùng bấm sang xem hạn gói.
   */
  it('cả năm khối cùng nằm trong DOM — chọn section không tháo khối nào ra', () => {
    const { container } = renderPage();

    for (const id of [
      'shop-section-profile',
      'shop-section-owner',
      'shop-section-legal',
      'shop-section-payout',
      'shop-section-plan',
    ]) {
      expect(container.querySelector(`#${id}`)).toBeTruthy();
    }
  });

  it('bấm một mục ghi `?section=` vào URL, và KHÔNG reset phân trang của bảng bên dưới', () => {
    renderPage();

    fireEvent.click(sectionNav().getByRole('link', { name: 'Gói & hạn mức' }));

    expect(url.setFilters).toHaveBeenCalledWith({ section: 'plan' }, { resetPage: false });
  });

  it('`?section=plan` làm sáng đúng mục đó', () => {
    url.section = 'plan';
    renderPage();

    expect(
      sectionNav().getByRole('link', { name: 'Gói & hạn mức' }).getAttribute('aria-current'),
    ).toBe('true');
  });

  /* Giá trị lạ (bookmark cũ, gõ tay) rơi về `profile` — không dựng một trang trống. */
  it('`?section=` rác rơi về "Thông tin hiển thị"', () => {
    url.section = 'khong-ton-tai';
    renderPage();

    expect(
      sectionNav().getByRole('link', { name: 'Thông tin hiển thị' }).getAttribute('aria-current'),
    ).toBe('true');
  });

  /*
   * Ba route cũ redirect vào `?section=…`, và link chia sẻ cũng vậy. Cả hai hứa "mở ra ở đúng
   * phần này", nên chỉ làm sáng mục lục là chưa giữ lời: phải cuộn tới nơi ngay lần vẽ đầu.
   */
  it('mở thẳng `?section=plan`: cuộn tới đúng khối ngay lần vẽ đầu', () => {
    url.section = 'plan';
    renderPage();

    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrolledIds).toContain('shop-section-plan');
  });

  /* Vào `/manage/shop` trần thì KHÔNG — một cú nhảy ngay khi trang hiện là trang tự ý đưa đi. */
  it('mở `/manage/shop` trần: không cuộn đi đâu cả', () => {
    renderPage();

    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe('Trang Cửa hàng — chủ gian hàng', () => {
  it('hiện tên/email/SĐT từ TÀI KHOẢN CHỦ, kèm cờ đã xác minh', () => {
    renderPage();

    const section = within(document.querySelector('#shop-section-owner') as HTMLElement);
    expect(section.getByText('Phạm Đức Việt')).toBeTruthy();
    expect(section.getByText('owner.hanoi@xeprime.test')).toBeTruthy();
    // SĐT lưu `84…`, đọc lên dạng `09…` như người Việt vẫn đọc số của mình.
    expect(section.getByText('0903000001')).toBeTruthy();
    expect(section.getAllByLabelText('Đã xác minh')).toHaveLength(2);
  });

  /*
   * Lằn ranh ADR 0038 điều 3: `tenant.update` mở hồ sơ GIAN HÀNG, không mở tài khoản của người
   * CHỦ. Khối này chỉ đọc — kể cả với người có đủ quyền sửa hồ sơ.
   */
  it('KHÔNG có ô nhập nào trong khối chủ gian hàng', () => {
    renderPage();

    const section = document.querySelector('#shop-section-owner') as HTMLElement;
    expect(section.querySelectorAll('input')).toHaveLength(0);
  });

  it('chủ gian hàng có lối vào màn bảo mật để tự đổi email/SĐT', () => {
    renderPage();

    const section = within(document.querySelector('#shop-section-owner') as HTMLElement);
    expect(
      section.getByRole('link', { name: 'Quản lý thông tin đăng nhập' }).getAttribute('href'),
    ).toBe('/manage/security');
  });

  it('quản lý gian hàng KHÔNG thấy nút đó — nó sẽ mở tài khoản của chính họ, không phải của chủ', () => {
    scope.roleKey = TENANT_ROLE.SHOP_MANAGER;
    renderPage();

    expect(screen.queryByRole('link', { name: 'Quản lý thông tin đăng nhập' })).toBeNull();
  });
});

describe('Trang Cửa hàng — tài khoản nhận tiền', () => {
  it('chủ gian hàng thấy sổ `bank_accounts` phạm vi gian hàng', () => {
    renderPage();

    expect(document.querySelector('#shop-section-payout')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Thêm tài khoản/ })).toBeTruthy();
  });

  /*
   * `/shop/bank-accounts` là `@ShopOwnerOnly()`: quản lý ăn 403 ngay ở lượt GET. Hiện một khối
   * rỗng kèm nút "Thêm tài khoản" cho họ là mời vào một cánh cửa đã khoá.
   */
  it('quản lý gian hàng: khối đó KHÔNG tồn tại, kể cả khi có đủ quyền hồ sơ', () => {
    scope.roleKey = TENANT_ROLE.SHOP_MANAGER;
    renderPage();

    expect(document.querySelector('#shop-section-payout')).toBeNull();
    expect(sectionNav().queryByRole('link', { name: 'Tài khoản nhận tiền' })).toBeNull();
  });
});

describe('Trang Cửa hàng — gói & hạn mức', () => {
  it('hiện gói hiện hành, hạn và trần TỔNG đội xe', () => {
    renderPage();

    const section = within(document.querySelector('#shop-section-plan') as HTMLElement);
    expect(section.getByText('Gói nâng cao')).toBeTruthy();
    // MỘT ô trần cho cả đội xe (ADR 0041 điều 4) — hai ô theo loại chỉ nói mức dùng.
    expect(section.getByText('10/10')).toBeTruthy();
    expect(section.getByText('Ô tô')).toBeTruthy();
    expect(section.getByText('Xe máy')).toBeTruthy();
  });

  it('đã dùng hết trần: một dòng cảnh báo, KHÔNG phải một dải đỏ', () => {
    renderPage();

    const warning = screen.getByText(/Đã dùng hết hạn mức/);
    expect(warning.closest('.ant-alert-warning')).toBeTruthy();
    expect(warning.closest('.ant-alert-error')).toBeNull();
  });

  it('có `subscription.purchase`: CTA gia hạn/đổi gói có mặt', () => {
    renderPage();

    expect(screen.getByRole('button', { name: /Gia hạn \/ đổi gói/ })).toBeTruthy();
  });

  it('thiếu `subscription.purchase`: KHÔNG CTA nào, và modal mua không nằm trong cây', () => {
    grant(PERMISSION.TENANT_VIEW, PERMISSION.TENANT_UPDATE, PERMISSION.SUBSCRIPTION_VIEW);
    renderPage();

    expect(screen.queryByRole('button', { name: /Gia hạn \/ đổi gói/ })).toBeNull();
    expect(document.querySelector('.ant-modal-root')).toBeNull();
    // …nhưng vẫn XEM được gói: hạn mức là việc điều hành đội xe.
    expect(screen.getByText('Gói nâng cao')).toBeTruthy();
  });

  it('thiếu `subscription.view`: khối đó vắng hẳn khỏi trang và khỏi mục lục', () => {
    grant(PERMISSION.TENANT_VIEW, PERMISSION.TENANT_UPDATE);
    renderPage();

    expect(document.querySelector('#shop-section-plan')).toBeNull();
    expect(sectionNav().queryByRole('link', { name: 'Gói & hạn mức' })).toBeNull();
  });
});

describe('Trang Cửa hàng — hoá đơn thanh toán', () => {
  it('chưa có hoá đơn: một dòng chữ gọn, KHÔNG dựng bảng lịch sử', () => {
    renderPage();

    expect(screen.getByText('Chưa phát sinh hoá đơn.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('Trang Cửa hàng — tiêu đề và quyền', () => {
  it('tiêu đề mang tên gian hàng, nhãn trạng thái và lối xem trang công khai', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Việt Car Hà Nội');
    expect(screen.getByRole('link', { name: /Xem gian hàng/ }).getAttribute('href')).toBe(
      '/shops/viet-car-ha-noi',
    );
  });

  /* Đã xác minh xong = không có tin gì, không có việc gì. Nhãn trạng thái đã nói điều đó. */
  it('gian hàng đã xác minh: KHÔNG dựng dải trạng thái nào', () => {
    renderPage();

    expect(screen.queryByText('Gian hàng đã được xác minh')).toBeNull();
  });

  it('nút Lưu chỉ sáng khi hồ sơ có thay đổi', async () => {
    renderPage();

    const save = screen.getByRole('button', { name: /Lưu thay đổi|Lưu thông tin/ });
    expect(save).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText(/Tên hiển thị/), { target: { value: 'Tên mới' } });

    await waitFor(() => expect(save).toHaveProperty('disabled', false));
  });

  it('thiếu `tenant.view`: trang nói thiếu quyền, không dựng section nào', () => {
    grant();
    renderPage();

    expect(screen.getByText('Không có quyền truy cập')).toBeTruthy();
    expect(document.querySelector('#shop-section-profile')).toBeNull();
  });
});

/**
 * DẢI CHÀO MỪNG sau lần thanh toán gói đầu tiên — `?welcome=1` (ADR 0040).
 *
 * Nội dung của dải có test riêng (`ShopWelcomeBanner.test.tsx`); ở đây kiểm đúng phần DÂY NỐI, và
 * phần đó có một mệnh đề không hiển nhiên: dải chỉ dựng khi CẢ HAI vế đúng — URL nói vừa thanh
 * toán xong, VÀ tenant thật sự đi qua cửa gói. Vế thứ hai chặn một link `?welcome=1` chia sẻ sang
 * tài khoản khác hiện một dòng chào vô nghĩa cho một chủ xe tuyến hoa hồng.
 */
describe('Dải chào mừng sau khi mua gói', () => {
  it('`?welcome=1` + gian hàng tuyến gói thiếu logo → hiện "Còn 1 bước"', () => {
    url.welcome = true;
    grant(PERMISSION.TENANT_VIEW, PERMISSION.TENANT_UPDATE);
    renderPage();

    expect(screen.getByText('Còn 1 bước để đăng xe')).toBeTruthy();
  });

  it('không có `?welcome=1`: KHÔNG dựng dải, dù thiếu logo', () => {
    grant(PERMISSION.TENANT_VIEW, PERMISSION.TENANT_UPDATE);
    renderPage();
    expect(screen.queryByText('Còn 1 bước để đăng xe')).toBeNull();
  });

  /*
   * Link `?welcome=1` gửi sang một chủ xe TUYẾN HOA HỒNG: không dựng gì. Họ chưa từng đi qua cửa
   * gian hàng, và một dòng chào mừng việc mua gói là nói về một việc họ chưa làm.
   */
  it('chủ xe tuyến hoa hồng nhận link `?welcome=1`: không dựng dải', () => {
    url.welcome = true;
    scope.onboardingState = SHOP_ONBOARDING_STATE.COMMISSION;
    grant(PERMISSION.TENANT_VIEW, PERMISSION.TENANT_UPDATE);
    renderPage();

    expect(screen.queryByText('Còn 1 bước để đăng xe')).toBeNull();
  });

  /*
   * Trong lúc lượt đếm xe bay đi, KHÔNG được nháy dải "Sẵn sàng rồi · Đăng xe đầu tiên": với một
   * gian hàng đang có mười xe đó là một lời mời sai, và dải này vốn im lặng khi hết việc để nói.
   */
  it('đang đếm xe: dải im lặng, không nháy "Đăng xe đầu tiên"', () => {
    url.welcome = true;
    const shop = makeShop();
    shop.profile.logoUrl = 'https://img.example/logo.png';
    shopQuery.data = shop;
    vehicles.isLoading = true;
    grant(PERMISSION.TENANT_VIEW, PERMISSION.TENANT_UPDATE);
    renderPage();

    expect(screen.queryByText('Gian hàng đã sẵn sàng')).toBeNull();
  });

  it('đã có logo và đã có xe: dải im lặng', () => {
    url.welcome = true;
    const shop = makeShop();
    shop.profile.logoUrl = 'https://img.example/logo.png';
    shopQuery.data = shop;
    vehicles.data = { items: [{ id: 'V1' }] };
    grant(PERMISSION.TENANT_VIEW, PERMISSION.TENANT_UPDATE);
    renderPage();

    expect(screen.queryByText('Còn 1 bước để đăng xe')).toBeNull();
    expect(screen.queryByText('Gian hàng đã sẵn sàng')).toBeNull();
  });
});
