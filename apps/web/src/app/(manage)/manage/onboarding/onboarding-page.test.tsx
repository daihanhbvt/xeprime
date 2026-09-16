import { App } from 'antd';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BILLING_MODE,
  SHOP_ONBOARDING_STATE,
  SUBSCRIPTION_INVOICE_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
} from '@xeprime/types';

import OwnerOnboardingPage from './page';

/**
 * ONBOARDING — máy trạng thái SUY TỪ SERVER, không từ state của component (ADR 0040).
 *
 * Điều bộ này khoá là chính lý do trục đăng ký phải nằm ở DB: mỗi trường hợp dưới đây được dựng
 * bằng cách đặt `/auth/me` + `GET /subscription/invoices/pending` rồi render TRANG TỪ ĐẦU — đúng
 * như một lần F5. Không test nào dựa vào một cú bấm trước đó, vì chính điều đó là thứ bản cũ làm
 * và là thứ đã hỏng.
 *
 * Bốn bất biến:
 *  1. `?track=package` + chưa có gian hàng ⇒ BƯỚC 1, hai chặng hiện rõ.
 *  2. `package_pending` ⇒ BƯỚC 2, và nếu server còn hoá đơn chờ thì hiện lại đúng mã đó (F5).
 *  3. `partially_paid` KHÔNG phải trạng thái kết thúc — vẫn ở bước 2.
 *  4. Gói đã hiệu lực ⇒ `replace('/manage/shop?welcome=1…')`, và chỉ khi SCOPE đã nhận tuyến gói.
 */
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
const search = vi.hoisted(() => ({ value: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/manage/onboarding',
  useSearchParams: () => new URLSearchParams(search.value),
}));

const currentUser = vi.hoisted(() => ({ data: undefined as unknown, isLoading: false }));
vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => currentUser }));

const invalidate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...actual, useQueryClient: () => ({ invalidateQueries: invalidate }) };
});

/**
 * Cả nhánh hook của gói được thay một lần: trang và `PackageShopCheckout` cùng gọi
 * `usePendingInvoice` (chung query key, chung cache), nên mock ở tầng hook giữ cho hai chỗ luôn
 * thấy CÙNG một câu trả lời — đúng như TanStack Query làm thật.
 */
const subscription = vi.hoisted(() => ({
  pending: { data: null as unknown, isLoading: false, isError: false, refetch: vi.fn() },
  plans: {
    data: [] as unknown[],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  purchase: { mutate: vi.fn(), isPending: false, isError: false, error: null as unknown },
  paymentInfo: { data: { configured: false } as unknown },
}));
vi.mock('@/features/subscription/hooks/use-subscription', () => ({
  usePendingInvoice: () => subscription.pending,
  useTenantPlans: () => subscription.plans,
  usePurchaseSubscription: () => subscription.purchase,
  usePaymentInfo: () => subscription.paymentInfo,
}));

/** Form bước 1 thay bằng một dấu hiệu: hành vi của nó có spec riêng (`ShopRegistration.test`). */
vi.mock('@/features/shop/components/ShopRegistration', () => ({
  ShopRegistration: ({ track }: { track?: string }) => (
    <div data-testid="shop-registration" data-track={track} />
  ),
}));

const PLAN = {
  id: 'PLAN1',
  name: 'Gói gian hàng theo chỗ',
  billingMode: BILLING_MODE.PACKAGE,
  basePriceMonthly: '0',
  limits: {
    perVehiclePrice: { car: '100000', motorbike: '40000' },
    includedCars: 0,
    includedMotorbikes: 0,
    maxCars: null,
    maxMotorbikes: null,
    maxMembers: null,
    maxBranches: null,
    terms: [{ months: 3, discountPercent: 0 }],
    graceDays: 7,
    features: [],
  },
};

const INVOICE = {
  id: 'INV1',
  code: 'XPGABC1234',
  status: SUBSCRIPTION_INVOICE_STATUS.ISSUED,
  totalAmount: '300000',
  paidAmount: '0',
  expiresAt: null,
  periodFrom: '2026-09-16T00:00:00.000Z',
  periodTo: '2026-12-16T00:00:00.000Z',
};

function tenant(over: Record<string, unknown>) {
  return {
    id: 'T1',
    name: 'Gian hàng A',
    slug: 'gian-hang-a',
    roleKey: TENANT_ROLE.SHOP_OWNER,
    status: TENANT_STATUS.ACTIVE,
    publicVehicleCount: 0,
    ...over,
  };
}

function signedIn(tenantOver: Record<string, unknown> | null) {
  currentUser.data = {
    id: 'U1',
    displayName: 'Chủ gian hàng',
    phone: '0901234567',
    email: 'a@b.vn',
    tenant: tenantOver ? tenant(tenantOver) : null,
  };
}

function renderPage() {
  return render(
    <App>
      <OwnerOnboardingPage />
    </App>,
  );
}

beforeEach(() => {
  router.replace.mockReset();
  invalidate.mockReset();
  search.value = '';
  subscription.pending.data = null;
  subscription.pending.isLoading = false;
  subscription.pending.isError = false;
  subscription.plans.data = [PLAN];
  subscription.plans.isLoading = false;
  subscription.plans.isError = false;
  subscription.purchase.mutate.mockReset();
  subscription.purchase.isError = false;
});

afterEach(cleanup);

describe('Bước 1 — chưa có gian hàng', () => {
  it('`?track=package`: hiện HAI chặng và form mang đúng tuyến', () => {
    search.value = 'track=package';
    signedIn(null);
    renderPage();

    expect(screen.getByTestId('shop-registration').getAttribute('data-track')).toBe('package');
    // Chỉ dẫn bước là một `<ol>` có nhãn — hai chặng, bước 1 đang mở.
    const steps = screen.getByRole('list', { name: /Tiến trình đăng ký gian hàng/ });
    expect(steps.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText('Thông tin gian hàng')).toBeTruthy();
    expect(screen.getByText('Gói và thanh toán')).toBeTruthy();
  });

  /*
   * Tuyến hoa hồng KHÔNG có hai bước: nó là một màn duy nhất rồi vào Owner Lite. Dựng một chỉ dẫn
   * hai chặng ở đó là hứa một bước thanh toán không tồn tại.
   */
  it('không có `?track=`: tuyến hoa hồng, KHÔNG có chỉ dẫn hai bước', () => {
    signedIn(null);
    renderPage();

    expect(screen.getByTestId('shop-registration').getAttribute('data-track')).toBe('commission');
    expect(screen.queryByRole('list', { name: /Tiến trình đăng ký gian hàng/ })).toBeNull();
  });

  it('`?track=` rác rơi về tuyến hoa hồng — cửa mặc định, không dựng một tuyến thứ ba', () => {
    search.value = 'track=vip';
    signedIn(null);
    renderPage();

    expect(screen.getByTestId('shop-registration').getAttribute('data-track')).toBe('commission');
  });
});

describe('Bước 2 — đã tạo gian hàng, chưa thanh toán', () => {
  beforeEach(() => {
    signedIn({
      onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_PENDING,
      billingMode: null,
    });
  });

  /*
   * Đây là bất biến quan trọng nhất của cả file: trang được render TỪ ĐẦU (không có cú bấm nào
   * trước đó) và vẫn rơi vào bước 2. Đó là "F5 vẫn quay lại bước chọn gói/thanh toán".
   */
  it('chưa có hoá đơn: hiện bộ chọn gói, không hiện form tạo gian hàng', () => {
    renderPage();

    expect(screen.queryByTestId('shop-registration')).toBeNull();
    expect(screen.getByRole('radiogroup', { name: /Chọn kỳ hạn cam kết/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tạo hoá đơn và lấy mã chuyển khoản/ })).toBeTruthy();
    expect(screen.queryByText(/^2$/)).toBeTruthy();
  });

  /*
   * Nút mờ phải NÓI VÌ SAO. Không có dòng này, người dùng chọn số chỗ xong thấy nút xám và không
   * có cách nào biết mình còn thiếu một cú bấm vào thẻ kỳ hạn.
   */
  it('chưa chọn kỳ hạn: nút tạo hoá đơn mờ VÀ có lý do đọc được', () => {
    renderPage();

    const cta = screen.getByRole('button', { name: /Tạo hoá đơn và lấy mã chuyển khoản/ });
    expect(cta.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Chọn kỳ hạn để tạo hoá đơn.')).toBeTruthy();
  });

  /**
   * F5 giữa lúc chờ chuyển khoản: hoá đơn đến từ SERVER, nên đúng mã cũ hiện lại — không có form
   * mua gói nào mời người dùng tạo mã thứ hai cho cùng một khoản.
   */
  it('CÓ hoá đơn chờ: hiện lại đúng mã + trạng thái chờ, không hiện bộ chọn gói', () => {
    subscription.pending.data = INVOICE;
    renderPage();

    expect(screen.getByText('XPGABC1234')).toBeTruthy();
    expect(screen.getByText(/Đang chờ tiền về/)).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: /Chọn kỳ hạn cam kết/ })).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  /**
   * Chuyển THIẾU vẫn ở bước 2 — `partially_paid` không phải trạng thái kết thúc. Gọi nó là "đã
   * thanh toán" vì đã có tiền về là mở Manage cho một khoản chưa đủ.
   */
  it('chuyển THIẾU: vẫn ở màn thanh toán, nói rõ còn thiếu, KHÔNG điều hướng', () => {
    subscription.pending.data = {
      ...INVOICE,
      status: SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID,
      paidAmount: '100000',
    };
    renderPage();

    expect(screen.getByText(/Đã nhận một phần/)).toBeTruthy();
    expect(screen.getByText('XPGABC1234')).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('Thanh toán xong', () => {
  /*
   * Điều kiện điều hướng là `/auth/me` THẬT SỰ đã nhận tuyến gói — không phải "hoá đơn vừa biến
   * khỏi danh sách chờ". Hai thứ đó cách nhau một round-trip, và nhảy sang `/manage/shop` trong
   * khoảng đó nghĩa là `AppShell` đọc scope cũ rồi đá người dùng ngược ra.
   */
  it('scope đã nhận tuyến gói ⇒ replace sang trang Cửa hàng kèm dải chào', async () => {
    signedIn({
      onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
      billingMode: BILLING_MODE.PACKAGE,
    });
    renderPage();

    await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
    const target = router.replace.mock.calls[0]![0] as string;
    expect(target.startsWith('/manage/shop')).toBe(true);
    expect(target).toContain('welcome=1');
  });

  /*
   * Scope CHƯA cập nhật (`package_pending` + hoá đơn đã rời trạng thái chờ): KHÔNG điều hướng,
   * chỉ làm mới `/auth/me`. Đây là nhịp giữa webhook và lượt fetch scope kế tiếp.
   */
  it('hoá đơn rời trạng thái chờ mà scope chưa kịp: làm mới auth, chưa điều hướng', async () => {
    signedIn({
      onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_PENDING,
      billingMode: null,
    });
    // Lượt đầu: đang chờ tiền.
    subscription.pending.data = INVOICE;
    const view = renderPage();
    expect(invalidate).not.toHaveBeenCalled();

    // Lượt polling cuối trả `null` — tiền đã về.
    subscription.pending.data = null;
    view.rerender(
      <App>
        <OwnerOnboardingPage />
      </App>,
    );

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    expect(router.replace).not.toHaveBeenCalled();
  });

  /*
   * Chưa từng tạo hoá đơn cũng cho `data === null`. Làm mới scope ở ca đó là một lượt gọi vô ích
   * mỗi lần trang mở — nên hook phân biệt "vừa trả xong" với "chưa bắt đầu".
   */
  it('chưa từng tạo hoá đơn: KHÔNG làm mới auth vô ích', () => {
    signedIn({
      onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_PENDING,
      billingMode: null,
    });
    renderPage();

    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('Tuyến hoa hồng đã có gian hàng: không thuộc màn này', () => {
  /*
   * Đích do `resolveWorkspaceHref` quyết định, KHÔNG do bảng đường dẫn theo khu:
   * `workspacePaths` mặc định về `/manage` khi chưa biết người dùng thuộc đâu, nên đi qua nó ở
   * đây sẽ đẩy một chủ xe hoa hồng vào cổng quản lý rồi để `AppShell` đá họ ra — hai cú nhảy và
   * một lần nháy màn hình.
   */
  it('chưa có xe trên chợ ⇒ màn tiến trình đăng ký, KHÔNG dựng bước nào', async () => {
    signedIn({
      onboardingState: SHOP_ONBOARDING_STATE.COMMISSION,
      billingMode: BILLING_MODE.COMMISSION,
      publicVehicleCount: 0,
    });
    renderPage();

    await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
    expect(router.replace.mock.calls[0]![0]).toBe('/account/registration');
    expect(screen.queryByTestId('shop-registration')).toBeNull();
  });

  it('đã có xe trên chợ ⇒ danh sách xe', async () => {
    signedIn({
      onboardingState: SHOP_ONBOARDING_STATE.COMMISSION,
      billingMode: BILLING_MODE.COMMISSION,
      publicVehicleCount: 2,
    });
    renderPage();

    await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
    expect(router.replace.mock.calls[0]![0]).toBe('/account/vehicles');
  });

  /*
   * NHÂN VIÊN không có Owner Lite — đó là bộ công cụ của CHỦ XE. Thả họ vào `/account/registration`
   * là mời họ điền hồ sơ chủ xe của một gian hàng không phải của họ.
   */
  it('nhân viên của gian hàng hết gói ⇒ khu tài khoản cá nhân', async () => {
    signedIn({
      onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
      billingMode: BILLING_MODE.COMMISSION,
      roleKey: TENANT_ROLE.SHOP_STAFF,
    });
    renderPage();

    await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
    expect(router.replace.mock.calls[0]![0]).toBe('/account');
  });
});
