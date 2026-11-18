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
  checkout: { mutate: vi.fn(), isPending: false },
  /** Gian hàng mới: chưa có gói nào, chưa có xe nào. */
  me: {
    data: {
      currentPlans: [],
      vehicleQuotas: {
        motorbike: { kind: 'scope_required', limit: 0, used: 0, countedScope: 'motorbike' },
        car: { kind: 'scope_required', limit: 0, used: 0, countedScope: 'car' },
      },
    } as unknown,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  preview: {
    data: { items: [] as unknown[], total: '250000', vehicleSlots: [] as unknown[] },
    isSuccess: true,
    isPlaceholderData: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  },
  paymentInfo: { data: { configured: false } as unknown },
}));
vi.mock('@/features/subscription/hooks/use-subscription', () => ({
  usePendingInvoices: () => subscription.pending,
  useTenantPlans: () => subscription.plans,
  useMySubscription: () => subscription.me,
  usePurchasePreview: () => subscription.preview,
  usePurchaseSubscription: () => subscription.purchase,
  useCreateSubscriptionCheckout: () => subscription.checkout,
  usePaymentInfo: () => subscription.paymentInfo,
  /* Làm mới scope khi tiền về — hành vi của nó thuộc về hook, không phải trang này. */
  useSyncScopeWhenInvoiceSettles: () => undefined,
}));

/** Hồ sơ gian hàng - mặc định ĐÃ có logo (ADR 0103); test bước logo tự gỡ nó. */
const shop = vi.hoisted(() => ({
  data: { id: 'T1', profile: { logoUrl: 'https://cdn.xeprime.test/logo.png' } } as
    { profile: { logoUrl: string | null } } | undefined,
  isLoading: false,
  update: vi.fn(),
  upload: vi.fn(),
}));
vi.mock('@/features/shop/hooks/use-shop', () => ({
  useMyShop: () => ({ data: shop.data, isLoading: shop.isLoading }),
  useUpdateShopProfile: () => ({ mutateAsync: shop.update, isPending: false }),
}));
vi.mock('@/services/upload', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  uploadImage: shop.upload,
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
  subscription.checkout.mutate.mockReset();
  subscription.me.isLoading = false;
  shop.data = { profile: { logoUrl: 'https://cdn.xeprime.test/logo.png' } };
  shop.isLoading = false;
  shop.update.mockReset().mockResolvedValue({});
  shop.upload.mockReset().mockResolvedValue('https://cdn.xeprime.test/new-logo.png');
  URL.createObjectURL = vi.fn(() => 'blob:logo-preview');
  URL.revokeObjectURL = vi.fn();
});

afterEach(cleanup);

describe('Bước 1 - chưa có gian hàng: form đăng ký một trang ở /register', () => {
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

describe('Bước 2 - đã tạo gian hàng, chưa thanh toán', () => {
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

  /*
   * Cùng luồng hai bước với hộp "Mua hoặc gia hạn gói" của trang Gian hàng - nhưng là TRANG, không
   * phải popup (người dùng 18/11/2026).
   */
  it('chưa có hoá đơn: luồng "Chọn gói → Kỳ hạn và xác nhận" ngay trên trang, không popup', () => {
    renderPage();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('list', { name: 'Các bước mua gói' })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'Xe máy' })).toBeTruthy();
    expect(screen.getByText('Chưa có gói xe máy')).toBeTruthy();
    // Gian hàng chưa có gói, chưa có xe: không có viên "0/0 đang dùng".
    expect(screen.queryByText(/đang dùng/)).toBeNull();
  });

  /*
   * Nút mờ phải NÓI VÌ SAO. Và không có lối "Huỷ" - chưa có mã nào để quay về.
   */
  it('chưa chọn gói: "Tiếp tục" mờ VÀ có lý do đọc được, không có nút Huỷ', () => {
    renderPage();

    const next = screen.getByRole('button', { name: 'Tiếp tục' });
    expect(next.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Chọn ít nhất một gói để tạo hoá đơn.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Huỷ' })).toBeNull();
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
    expect(screen.queryByRole('radiogroup', { name: 'Xe máy' })).toBeNull();
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

describe('Bước 2 - gói theo loại xe (ADR 0065)', () => {
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

  /** Bấm "Chọn gói" của bậc đầu tiên trong làn. */
  function pick(lane: 'Xe máy' | 'Ô tô') {
    const group = screen.getByRole('radiogroup', { name: lane });
    fireEvent.click(group.querySelector('[role="radio"]') as HTMLElement);
  }

  /** Bước 1 → bước 2 → "Tạo hóa đơn". */
  function confirm() {
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tạo hóa đơn' }));
  }

  it('hai làn + dải doanh nghiệp "Liên hệ tư vấn" - doanh nghiệp không mua trực tiếp được', () => {
    renderPage();
    expect(screen.getByRole('radiogroup', { name: 'Xe máy' })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'Ô tô' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Liên hệ tư vấn/ })).toBeTruthy();
  });

  it('chỉ chọn MỘT làn ⇒ một hoá đơn, sang thẳng trang thanh toán không khung', () => {
    renderPage();
    pick('Ô tô');
    confirm();

    expect(subscription.checkout.mutate).not.toHaveBeenCalled();
    const [body, options] = subscription.purchase.mutate.mock.calls[0]! as [
      unknown,
      { onSuccess: (created: { id: string }) => void },
    ];
    expect(body).toMatchObject({ planId: 'PLAN-CAR', termMonths: 3 });
    options.onSuccess({ id: 'INV-NEW' });
    expect(router.push).toHaveBeenCalledWith('/manage/payment/INV-NEW');
  });

  /*
   * Hai gói = MỘT kỳ hạn chung + MỘT phiếu thanh toán gộp (ADR 0083) - cùng luật với hộp "Mua hoặc
   * gia hạn gói" của trang Gian hàng.
   */
  it('chọn CẢ HAI làn ⇒ một phiếu gộp, sang trang thanh toán phiếu', () => {
    renderPage();
    pick('Xe máy');
    pick('Ô tô');
    confirm();

    expect(subscription.purchase.mutate).not.toHaveBeenCalled();
    const [body, options] = subscription.checkout.mutate.mock.calls[0]! as [
      unknown,
      { onSuccess: (created: { id: string }) => void },
    ];
    // Thứ tự hoá đơn con do SERVER sắp theo loại xe - ở đây chỉ khoá TẬP gói + kỳ hạn chung.
    expect((body as { items: unknown[] }).items).toEqual(
      expect.arrayContaining([
        { planId: 'PLAN1', termMonths: 3 },
        { planId: 'PLAN-CAR', termMonths: 3 },
      ]),
    );
    expect((body as { items: unknown[] }).items).toHaveLength(2);
    options.onSuccess({ id: 'CHK1' });
    expect(router.push).toHaveBeenCalledWith('/manage/payment/checkout/CHK1');
  });

  it('đã có hoá đơn xe máy chờ: "Thêm gói ô tô" mở luồng, "Huỷ" quay về mã đang chờ', () => {
    subscription.pending.data = [INVOICE];
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Thêm gói ô tô' }));
    expect(screen.getByRole('radiogroup', { name: 'Ô tô' })).toBeTruthy();
    expect(screen.queryByText('XPGABC1234')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(screen.getByText('XPGABC1234')).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: 'Ô tô' })).toBeNull();
  });

  /*
   * Hai hoá đơn rời từ trước (hoặc chọn nhầm gói): "Chọn lại gói" mở lại luồng; bước xác nhận
   * cảnh báo mã cũ của loại xe chọn lại sẽ bị huỷ - đường để gộp chúng thành một phiếu.
   */
  it('hoá đơn chờ chưa nhận tiền ở cả hai loại xe: "Chọn lại gói" mở lại luồng', () => {
    subscription.pending.data = [
      INVOICE,
      { ...INVOICE, id: 'INV-C', code: 'XPGCAR0001', vehicleScope: 'car' },
    ];
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Chọn lại gói' }));
    expect(screen.getByRole('radiogroup', { name: 'Xe máy' })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'Ô tô' })).toBeTruthy();
    pick('Xe máy');
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(screen.getByText(/Hoá đơn XPGABC1234 của loại xe này đang chờ thanh toán/)).toBeTruthy();
  });

  it('cả hai hoá đơn đã nhận một phần: KHÔNG có lối mở lại luồng chọn gói', () => {
    const partial = { status: SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID, paidAmount: '100000' };
    subscription.pending.data = [
      { ...INVOICE, ...partial },
      { ...INVOICE, ...partial, id: 'INV-C', code: 'XPGCAR0001', vehicleScope: 'car' },
    ];
    renderPage();

    expect(screen.queryByRole('button', { name: 'Chọn lại gói' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Thêm gói/ })).toBeNull();
  });
});

/*
 * Lưới an toàn của ADR 0103: gian hàng tuyến gói chưa có logo (đăng ký từ app, đăng ký trước ADR,
 * tải logo hỏng rồi rời trang) đứng lại ở bước 1 và chưa chọn gói được.
 */
describe('Bước 1 - gian hàng chưa có logo (ADR 0103)', () => {
  beforeEach(() => {
    signedIn({ onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_PENDING, billingMode: null });
    shop.data = { profile: { logoUrl: null } };
  });

  it('đứng ở bước 1 với ô logo, KHÔNG có luồng chọn gói', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Thêm logo gian hàng' })).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: 'Xe máy' })).toBeNull();
    const current = document.querySelector('[aria-current="step"]');
    expect(current?.textContent).toContain('Thông tin gian hàng');
  });

  it('bấm lưu khi chưa chọn ảnh: báo lỗi, không tải gì', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Lưu logo và chọn gói/ }));
    expect(screen.getByText('Tải logo gian hàng lên để tiếp tục')).toBeTruthy();
    expect(shop.upload).not.toHaveBeenCalled();
  });

  it('chọn ảnh rồi lưu: tải lên và gắn logo vào hồ sơ gian hàng', async () => {
    renderPage();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['logo'], 'logo.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(screen.getByAltText('Logo gian hàng đã chọn')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Lưu logo và chọn gói/ }));

    await waitFor(() =>
      expect(shop.update).toHaveBeenCalledWith({
        logoUrl: 'https://cdn.xeprime.test/new-logo.png',
      }),
    );
  });

  it('đã có mã chờ chuyển khoản: mã vẫn hiện dưới ô logo, không có lối chọn lại gói', () => {
    subscription.pending.data = [INVOICE];
    renderPage();

    expect(screen.getByRole('heading', { name: 'Thêm logo gian hàng' })).toBeTruthy();
    expect(screen.getByText('XPGABC1234')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Thêm gói|Chọn lại gói/ })).toBeNull();
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
    await waitFor(() => expect(screen.getByRole('radiogroup', { name: 'Xe máy' })).toBeTruthy());
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
