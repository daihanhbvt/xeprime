import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
 *  1. Chưa có gian hàng ⇒ chuyển sang form đăng ký một trang `/register?track=`.
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

const logout = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@/features/auth/hooks/use-portal-logout', () => ({ usePortalLogout: () => logout }));

const currentUser = vi.hoisted(() => ({ data: undefined as unknown, isLoading: false }));
vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => currentUser }));

/**
 * Cả nhánh hook của gói được thay một lần: trang và `PackageShopCheckout` cùng gọi
 * `usePendingInvoices` (chung query key, chung cache), nên mock ở tầng hook giữ cho hai chỗ luôn
 * thấy CÙNG một câu trả lời — đúng như TanStack Query làm thật.
 */
const subscription = vi.hoisted(() => ({
  pending: { data: [] as unknown[], isLoading: false, isError: false, refetch: vi.fn() },
  plans: {
    data: [] as unknown[],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  purchase: {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null as unknown,
  },
  paymentInfo: { data: { configured: false } as unknown },
}));
vi.mock('@/features/subscription/hooks/use-subscription', () => ({
  usePendingInvoices: () => subscription.pending,
  useTenantPlans: () => subscription.plans,
  usePurchaseSubscription: () => subscription.purchase,
  usePaymentInfo: () => subscription.paymentInfo,
  /* Làm mới scope khi tiền về — hành vi của nó thuộc về hook, không phải trang này. */
  useSyncScopeWhenInvoiceSettles: () => undefined,
}));

const PLAN = {
  id: 'PLAN1',
  name: 'Gói cơ bản',
  billingMode: BILLING_MODE.PACKAGE,
  vehicleScope: 'motorbike',
  limits: {
    maxVehicles: 3,
    maxBranches: 1,
    maxMembers: null,
    termPrices: [{ months: 3, price: '250000' }],
    salesOnly: false,
    recommended: false,
    graceDays: 7,
    features: [],
  },
};

const INVOICE = {
  id: 'INV1',
  code: 'XPGABC1234',
  planId: 'plan-basic',
  planCode: 'moto_5',
  vehicleScope: 'motorbike',
  termMonths: 3,
  quota: { maxVehicles: 3, maxBranches: 1, maxMembers: null },
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
  router.push.mockReset();
  search.value = '';
  subscription.pending.data = [];
  subscription.pending.isLoading = false;
  subscription.pending.isError = false;
  subscription.plans.data = [PLAN];
  subscription.plans.isLoading = false;
  subscription.plans.isError = false;
  subscription.purchase.mutate.mockReset();
  subscription.purchase.mutateAsync.mockReset();
  subscription.purchase.isError = false;
});

afterEach(cleanup);

describe('Bước 1 — chưa có gian hàng: form đăng ký một trang ở /register', () => {
  /*
   * Form tạo hồ sơ không còn sống ở đây: nó gộp với phần tài khoản ở `/register?track=` để họ
   * tên/SĐT/email chỉ hỏi một lần. Trang này chỉ còn bước 2 của tuyến gói.
   */
  it.each([
    ['track=package', 'package'],
    ['', 'commission'],
    // Tham số rác rơi về cửa mặc định, không dựng một tuyến thứ ba.
    ['track=vip', 'commission'],
  ])('`?%s` ⇒ chuyển sang /register?track=%s', async (query, track) => {
    search.value = query;
    signedIn(null);
    renderPage();

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(`/manage/register?track=${track}`),
    );
    expect(screen.queryByRole('textbox')).toBeNull();
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
  it('lối ra là Đăng xuất, không còn "Quay lại marketplace"', () => {
    renderPage();

    expect(screen.queryByText('Quay lại marketplace')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Đăng xuất/ }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('chưa có hoá đơn: hiện bộ chọn gói, không hiện form tạo gian hàng', () => {
    renderPage();

    // Bảng giá BẬC là bước đầu; kỳ hạn chỉ mở ra sau khi chọn bậc (ADR 0041).
    expect(screen.getByRole('radiogroup', { name: 'Gói xe máy' })).toBeTruthy();
    expect(screen.getByText('Gói cơ bản')).toBeTruthy();
    expect(screen.getByText('Tối đa 3 xe máy')).toBeTruthy();
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
    expect(screen.getByText(/Chọn ít nhất một gói \(xe máy hoặc ô tô\)/)).toBeTruthy();
  });

  /**
   * F5 giữa lúc chờ chuyển khoản: hoá đơn đến từ SERVER, nên đúng mã cũ hiện lại — không có form
   * mua gói nào mời người dùng tạo mã thứ hai cho cùng một khoản.
   */
  it('CÓ hoá đơn chờ: hiện lại đúng mã + trạng thái chờ, không hiện bộ chọn gói', () => {
    subscription.pending.data = [INVOICE];
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
    subscription.pending.data = [
      {
        ...INVOICE,
        status: SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID,
        paidAmount: '100000',
      },
    ];
    renderPage();

    expect(screen.getByText(/Đã nhận một phần/)).toBeTruthy();
    expect(screen.getByText('XPGABC1234')).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('Bước 2 — gói theo loại xe (ADR 0065)', () => {
  const CAR_PLAN = { ...PLAN, id: 'PLAN-CAR', name: 'Ô tô 5 xe', vehicleScope: 'car' };
  const ENTERPRISE = {
    ...PLAN,
    id: 'PLAN-E',
    name: 'Gói doanh nghiệp',
    vehicleScope: 'all',
    limits: { ...PLAN.limits, maxVehicles: null, termPrices: [], salesOnly: true },
  };

  beforeEach(() => {
    signedIn({ onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_PENDING, billingMode: null });
    subscription.plans.data = [PLAN, CAR_PLAN, ENTERPRISE];
  });

  function pick(lane: string) {
    const group = screen.getByRole('radiogroup', { name: lane });
    fireEvent.click(group.querySelector('[role="radio"]') as HTMLElement);
    const terms = screen.getAllByRole('radiogroup', { name: 'Chọn thời hạn' });
    fireEvent.click(terms[terms.length - 1]!.querySelector('[role="radio"]') as HTMLElement);
  }

  it('hai làn + thẻ doanh nghiệp "Liên hệ tư vấn" — doanh nghiệp không mua trực tiếp được', () => {
    renderPage();
    expect(screen.getByRole('radiogroup', { name: 'Gói xe máy' })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'Gói ô tô' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Liên hệ tư vấn' })).toBeTruthy();
  });

  it('chỉ chọn MỘT làn ⇒ một hoá đơn, sang thẳng trang thanh toán của nó', async () => {
    subscription.purchase.mutateAsync.mockResolvedValue({ ...INVOICE, id: 'INV-NEW' });
    renderPage();
    pick('Gói ô tô');
    fireEvent.click(screen.getByRole('button', { name: /Tạo hoá đơn và lấy mã chuyển khoản/ }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/manage/payment/INV-NEW'));
    expect(subscription.purchase.mutateAsync).toHaveBeenCalledWith({
      planId: 'PLAN-CAR',
      termMonths: 3,
    });
  });

  it('chọn CẢ HAI làn ⇒ hai hoá đơn tạo lần lượt, ở lại trang để trả từng mã', async () => {
    subscription.purchase.mutateAsync
      .mockResolvedValueOnce({ ...INVOICE, id: 'INV-M' })
      .mockResolvedValueOnce({ ...INVOICE, id: 'INV-C', vehicleScope: 'car' });
    renderPage();
    pick('Gói xe máy');
    pick('Gói ô tô');
    expect(screen.getByText(/Sẽ tạo 2 hoá đơn/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Tạo hoá đơn và lấy mã chuyển khoản/ }));

    await waitFor(() => expect(subscription.purchase.mutateAsync).toHaveBeenCalledTimes(2));
    expect(router.push).not.toHaveBeenCalled();
  });

  it('đã có hoá đơn xe máy chờ: lối thêm gói ô tô, KHÔNG mời mua lại xe máy', () => {
    subscription.pending.data = [INVOICE];
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Thêm gói ô tô' }));
    expect(screen.getByRole('radiogroup', { name: 'Gói ô tô' })).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: 'Gói xe máy' })).toBeNull();
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
   * Scope CHƯA cập nhật (`package_pending` + hoá đơn đã rời trạng thái chờ): KHÔNG điều hướng.
   * Đây là nhịp giữa webhook và lượt fetch scope kế tiếp.
   *
   * Việc LÀM MỚI scope ở nhịp đó nay do `useSyncScopeWhenInvoiceSettles` lo — một hook dùng chung
   * với luồng nâng cấp ở `/account/subscription`, và nó có spec riêng ở
   * `features/subscription/hooks/use-subscription.test.tsx`. Ở đây chỉ còn phần thuộc về TRANG:
   * đứng yên cho tới khi scope thật sự đổi.
   */
  it('hoá đơn rời trạng thái chờ mà scope chưa kịp: chưa điều hướng đi đâu', async () => {
    signedIn({
      onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_PENDING,
      billingMode: null,
    });
    subscription.pending.data = [INVOICE];
    const view = renderPage();

    subscription.pending.data = [];
    view.rerender(
      <App>
        <OwnerOnboardingPage />
      </App>,
    );

    // Vẫn đứng ở bước 2 (bộ chọn gói hiện lại vì hoá đơn đã rời danh sách chờ), chưa đi đâu cả.
    await waitFor(() =>
      expect(screen.getByRole('radiogroup', { name: 'Gói xe máy' })).toBeTruthy(),
    );
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('Tuyến hoa hồng đã có gian hàng: không thuộc màn này', () => {
  /*
   * Đích do `resolveWorkspaceHref` quyết định, KHÔNG do bảng đường dẫn theo khu:
   * `workspacePaths` mặc định về `/manage` khi chưa biết người dùng thuộc đâu, nên đi qua nó ở
   * đây sẽ đẩy một chủ xe hoa hồng vào cổng quản lý rồi để `AppShell` đá họ ra — hai cú nhảy và
   * một lần nháy màn hình.
   */
  it('chưa có xe trên chợ ⇒ trang chủ (màn tiến trình đăng ký), KHÔNG dựng bước nào', async () => {
    signedIn({
      onboardingState: SHOP_ONBOARDING_STATE.COMMISSION,
      billingMode: BILLING_MODE.COMMISSION,
      publicVehicleCount: 0,
    });
    renderPage();

    await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
    expect(router.replace.mock.calls[0]![0]).toBe('/manage');
  });

  it('đã có xe trên chợ ⇒ danh sách xe', async () => {
    signedIn({
      onboardingState: SHOP_ONBOARDING_STATE.COMMISSION,
      billingMode: BILLING_MODE.COMMISSION,
      publicVehicleCount: 2,
    });
    renderPage();

    await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
    expect(router.replace.mock.calls[0]![0]).toBe('/manage/vehicles');
  });

  /*
   * NHÂN VIÊN không có Owner Lite — đó là bộ công cụ của CHỦ XE. Thả họ vào màn đăng ký
   * là mời họ điền hồ sơ chủ xe của một gian hàng không phải của họ.
   */
  it('nhân viên của gian hàng hết gói ⇒ trang chủ site partner (cổng chủ xe giải thích, không form)', async () => {
    signedIn({
      onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
      billingMode: BILLING_MODE.COMMISSION,
      roleKey: TENANT_ROLE.SHOP_STAFF,
    });
    renderPage();

    await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
    expect(router.replace.mock.calls[0]![0]).toBe('/manage');
  });
});
