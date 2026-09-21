import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BILLING_MODE,
  SHOP_ONBOARDING_STATE,
  SHOP_VERIFICATION,
  SUBSCRIPTION_INVOICE_STATUS,
  TENANT_STATUS,
} from '@xeprime/types';

import type { Branch } from '@/features/branches/types';
import type { MyShop } from '@/features/shop/types';

import type { SubscriptionInvoice, TenantPlan } from '../types';
import { PackageUpgradeWizard } from './PackageUpgradeWizard';

/**
 * LUỒNG NÂNG CẤP chủ xe tuyến hoa hồng → gian hàng tuyến gói (ADR 0028 điều 1 · ADR 0040).
 *
 * Bộ này khoá đúng những chỗ mà một bản "làm cho xong" sẽ làm sai:
 *
 *  1. **Thứ tự.** Bảng giá TRƯỚC, form hồ sơ SAU. Hỏi tên gian hàng trước khi cho xem giá là
 *     dựng một bức tường trước một quyết định chưa ai đưa ra.
 *  2. **Không có luồng đăng ký thứ hai.** Tenant đã tồn tại: `registerShop`/`POST /tenants` không
 *     được gọi ở bất kỳ nhánh nào, và form phải điền sẵn từ hồ sơ + chi nhánh mặc định.
 *  3. **Tiền đi SAU cùng.** Lưu hồ sơ hoặc chi nhánh hỏng ⇒ KHÔNG tạo hoá đơn. Bán một gói cho
 *     một gian hàng chưa có mặt tiền là để cổng đăng xe từ chối họ ngay sau khi tiền về.
 *  4. **Quay lại không mất lựa chọn**, và **hoá đơn chờ sống qua F5** — trạng thái đến từ server,
 *     không từ `useState`.
 */

const pendingInvoice = vi.hoisted(() => ({
  data: null as SubscriptionInvoice | null,
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
const purchase = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: null as unknown,
}));

vi.mock('../hooks/use-subscription', () => ({
  usePendingInvoice: () => pendingInvoice,
  useTenantPlans: () => plans,
  usePurchaseSubscription: () => purchase,
  usePaymentInfo: () => ({ data: undefined, isLoading: false, isError: false }),
  /* Làm mới scope khi tiền về — hành vi của nó thuộc về hook, có spec riêng ở tầng query. */
  useSyncScopeWhenInvoiceSettles: () => undefined,
}));

const shopQuery = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const branchQuery = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const updateProfile = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  isPending: false,
  isError: false,
  error: null as unknown,
}));
const updateBranch = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
/** Hook đăng ký gian hàng — ở đây nó phải KHÔNG BAO GIỜ được gọi, kể cả chỉ để dựng mutation. */
const useRegisterShop = vi.hoisted(() => vi.fn(() => ({ mutate: vi.fn(), isPending: false })));

vi.mock('@/features/shop/hooks/use-shop', () => ({
  useMyShop: () => shopQuery,
  useUpdateShopProfile: () => updateProfile,
  useRegisterShop,
}));
vi.mock('@/features/branches/hooks/use-branches', () => ({
  useBranches: () => branchQuery,
  useUpdateBranch: () => updateBranch,
}));

/*
 * Danh mục hành chính + bản đồ: stub như mọi test có `AddressField`. Hành vi của ô địa chỉ được
 * khoá ở `components/form/AddressField.test.tsx`; ở đây nó chỉ cần dựng được mà không đòi một
 * QueryClientProvider và một khoá bản đồ.
 */
vi.mock('@/features/locations/hooks/use-provinces', () => ({
  useProvinceOptions: () => ({
    options: [
      { value: '01', label: 'Hà Nội' },
      { value: '79', label: 'Hồ Chí Minh' },
    ],
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

function makePlan(over: Partial<TenantPlan> = {}): TenantPlan {
  return {
    id: 'plan-basic',
    code: 'shop-basic',
    name: 'Gói cơ bản',
    description: 'Cho cửa hàng nhỏ',
    billingMode: BILLING_MODE.PACKAGE,
    commissionPercent: null,
    status: 'active',
    currency: 'VND',
    sortOrder: 1,
    limits: {
      maxVehicles: 3,
      maxBranches: 1,
      maxMembers: null,
      termPrices: [
        { months: 1, price: '100000' },
        { months: 3, price: '250000' },
      ],
      salesOnly: false,
      recommended: false,
      graceDays: 7,
      features: [],
    },
    ...over,
  } as TenantPlan;
}

/** Chủ xe cá nhân đang chạy thật: có hồ sơ, có chi nhánh mặc định, có xe. */
const SHOP: MyShop = {
  id: '01HSHOP00000000000000000A',
  code: 'SHOP-1',
  slug: 'xe-cua-minh',
  name: 'Xe của Minh',
  tenantType: 'individual',
  status: TENANT_STATUS.ACTIVE,
  onboardingState: SHOP_ONBOARDING_STATE.COMMISSION,
  verification: SHOP_VERIFICATION.UNVERIFIED,
  phone: null,
  email: null,
  latestApproval: null,
  ownerAccount: {
    userId: '01HUSER000000000000000000',
    displayName: 'Nguyễn Văn Minh',
    email: 'minh@xeprime.test',
    phone: '84901234567',
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
    displayName: 'Xe của Minh',
    bio: 'Cho thuê xe tự lái',
    logoUrl: null,
    coverUrl: null,
    address: '12 Nguyễn Thái Học, Hà Nội',
    provinceCode: '01',
    provinceName: 'Hà Nội',
    taxCode: null,
    businessLicenseNo: null,
  },
};

const BRANCH = {
  id: '01HBRANCH0000000000000000',
  code: 'CN01',
  name: 'Chi nhánh Hà Nội',
  provinceCode: '01',
  provinceName: 'Hà Nội',
  wardCode: null,
  address: '12 Nguyễn Thái Học, Hà Nội',
  addressLine: '12 Nguyễn Thái Học',
  phone: '0901234567',
  isDefault: true,
  status: 'active',
  vehicleCount: 2,
  needsLocationReview: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as Branch;

const INVOICE = {
  id: 'INV1',
  code: 'XPG123456',
  planId: 'plan-basic',
  planCode: 'shop-basic',
  termMonths: 3,
  quota: { maxVehicles: 3, maxBranches: 1, maxMembers: null },
  status: SUBSCRIPTION_INVOICE_STATUS.ISSUED,
  totalAmount: '250000',
  paidAmount: '0',
  periodFrom: '2026-09-01T00:00:00.000Z',
  periodTo: '2026-12-01T00:00:00.000Z',
  createdAt: '2026-09-01T00:00:00.000Z',
} as unknown as SubscriptionInvoice;

function renderWizard() {
  return render(
    <App>
      <PackageUpgradeWizard />
    </App>,
  );
}

/** Thẻ kỳ hạn = radio bên trong nhóm "Chọn thời hạn"; thẻ BẬC nằm ở nhóm còn lại. */
function termCards(): HTMLElement[] {
  const group = screen.getByRole('radiogroup', { name: 'Chọn thời hạn' });
  return Array.from(group.querySelectorAll('[role="radio"]')) as HTMLElement[];
}

/** Đi hết bước 1: chọn bậc, chọn kỳ 3 tháng, rồi bấm Tiếp tục. */
function pickPlanAndContinue() {
  fireEvent.click(screen.getByRole('radio', { name: /Chọn gói/ }));
  fireEvent.click(termCards()[1]!);
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
}

const displayNameInput = () => screen.getByLabelText(/Tên hiển thị/) as HTMLInputElement;
const phoneInput = () => screen.getByLabelText(/Số điện thoại/) as HTMLInputElement;
/** Ô địa chỉ là AutoComplete (role `combobox`) — `getByLabelText` còn khớp cả aria-label của khối. */
const addressInput = () =>
  screen.getByRole('combobox', { name: /Địa chỉ/ }) as HTMLInputElement;
const submitButton = () => screen.getByRole('button', { name: /Lưu thông tin và tạo hoá đơn/ });

beforeEach(() => {
  pendingInvoice.data = null;
  pendingInvoice.isLoading = false;
  pendingInvoice.isError = false;
  plans.data = [makePlan()];
  plans.isLoading = false;
  plans.isError = false;
  shopQuery.data = SHOP;
  shopQuery.isLoading = false;
  shopQuery.isError = false;
  branchQuery.data = { items: [BRANCH], total: 1, activeCount: 1, needsReviewCount: 0 };
  branchQuery.isLoading = false;
  branchQuery.isError = false;
  updateProfile.mutateAsync.mockReset().mockResolvedValue(SHOP);
  updateBranch.mutateAsync.mockReset().mockResolvedValue(BRANCH);
  purchase.mutate.mockReset();
  purchase.isError = false;
  useRegisterShop.mockClear();
});

afterEach(cleanup);

describe('PackageUpgradeWizard — bảng giá đứng trước form', () => {
  it('mở màn: thấy bậc, hạn mức và giá — KHÔNG thấy ô nào của hồ sơ gian hàng', () => {
    renderWizard();

    expect(screen.getByText('Gói cơ bản')).toBeTruthy();
    expect(screen.getByText('Tối đa 3 xe')).toBeTruthy();
    expect(screen.queryByLabelText(/Tên hiển thị/)).toBeNull();
    expect(screen.queryByLabelText(/Số điện thoại/)).toBeNull();
  });

  /**
   * Chưa chọn bậc nào thì KHÔNG có nút "Tiếp tục" — mỗi thẻ bậc đã mang nút riêng, và một nút
   * thứ tư nằm sẵn bên dưới là một hành động chưa có đối tượng. Chọn bậc rồi nó mới xuất hiện,
   * và vẫn mờ cho tới khi có kỳ hạn: kỳ hạn là một cam kết riêng, không được mặc định sẵn.
   */
  it('chưa chọn bậc: không có nút đi tiếp; chọn bậc rồi nút hiện nhưng còn mờ và nói vì sao', () => {
    renderWizard();

    expect(screen.queryByRole('button', { name: 'Tiếp tục' })).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: /Chọn gói/ }));

    expect(screen.getByRole('button', { name: /Tiếp tục/ }).getAttribute('disabled')).not.toBeNull();
    // Dải chốt đơn nói ra VÌ SAO nút còn mờ, ngay cạnh chỗ tổng tiền sẽ hiện.
    expect(screen.getByText(/Chọn một thời hạn/)).toBeTruthy();
  });

  /** Bậc `salesOnly` bán bằng tư vấn — không có đường tự tạo hoá đơn (ADR 0041 điều 5). */
  it('bậc tư vấn: chỉ có liên kết liên hệ, không đi tiếp được', () => {
    plans.data = [
      makePlan({
        id: 'plan-pro',
        code: 'shop-pro',
        name: 'Gói chuyên nghiệp',
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
      } as Partial<TenantPlan>),
    ];
    renderWizard();

    expect(screen.getByRole('link', { name: 'Liên hệ tư vấn' }).getAttribute('href')).toBe(
      '/support',
    );
    expect(screen.queryByRole('radio')).toBeNull();
    // Không bậc nào tự mua được ⇒ không có đường đi tiếp nào để mở ra.
    expect(screen.queryByRole('button', { name: 'Tiếp tục' })).toBeNull();
  });

  it('chọn bậc + kỳ hạn rồi "Tiếp tục" mới hiện form gian hàng', () => {
    renderWizard();
    pickPlanAndContinue();

    expect(displayNameInput()).toBeTruthy();
    expect(phoneInput()).toBeTruthy();
    // Bảng giá nhường chỗ, nhưng lựa chọn vẫn được nhắc lại để không ai quên mình đang mua gì.
    expect(screen.getByText(/Gói đã chọn: Gói cơ bản · 3 tháng/)).toBeTruthy();
  });

  /**
   * Bước ĐÃ QUA trên thanh chỉ dẫn bấm lùi được — nhưng chỉ khi chưa có hoá đơn. Từ bước thanh
   * toán thì không: hoá đơn đã tồn tại ở server với một mã mà khách có thể đã chuyển khoản theo.
   */
  it('bấm vào bước 1 trên thanh chỉ dẫn thì lùi về bảng giá', () => {
    renderWizard();
    pickPlanAndContinue();
    expect(displayNameInput()).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Chọn gói dịch vụ/ }));

    expect(screen.queryByLabelText(/Tên hiển thị/)).toBeNull();
    expect(termCards()[1]!.getAttribute('aria-checked')).toBe('true');
  });

  it('đang chờ chuyển khoản: số bước KHÔNG bấm lùi được, lối sửa đi qua nút riêng', () => {
    pendingInvoice.data = INVOICE;
    renderWizard();

    expect(screen.queryByRole('button', { name: /Chọn gói dịch vụ/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Thông tin gian hàng/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Chọn lại gói' })).toBeTruthy();
  });

  /**
   * "Chọn lại gói" mở lại hai bước đầu và NÓI THẲNG hệ quả: `purchase()` ở server void hoá đơn
   * `issued` rồi tạo mã mới, nên ai đã chuyển khoản theo mã cũ phải biết để quay lại.
   */
  it('bấm "Chọn lại gói": về bảng giá, kèm cảnh báo mã cũ sẽ bị huỷ và đường quay lại', () => {
    pendingInvoice.data = INVOICE;
    renderWizard();

    fireEvent.click(screen.getByRole('button', { name: 'Chọn lại gói' }));

    // Bảng giá phải CÓ HÀNG: danh mục gói vẫn tải được dù hoá đơn cũ chưa mất đi đâu cả.
    expect(screen.getByRole('radiogroup', { name: /Chọn gói dịch vụ/ })).toBeTruthy();
    expect(screen.queryByText(/Chưa có gói nào đang bán/)).toBeNull();
    expect(screen.getByText(/XPG123456 chờ chuyển khoản/)).toBeTruthy();
    // Nói rõ mã cũ chỉ bị huỷ Ở BƯỚC TẠO HOÁ ĐƠN MỚI, không phải ngay lúc bấm "Chọn lại gói".
    expect(screen.getByText(/VẪN dùng được cho tới khi bạn tạo hoá đơn mới/)).toBeTruthy();

    // Và quay lại được đúng mã đang chờ, không mất dấu nó.
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại mã đang chờ' }));
    expect(screen.getByText('XPG123456')).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: /Chọn gói dịch vụ/ })).toBeNull();
  });

  /**
   * Hoá đơn ĐÃ NHẬN MỘT PHẦN thì server từ chối tạo mã mới
   * (`SUBSCRIPTION_INVOICE_PARTIALLY_PAID`) và bắt chuyển nốt theo mã cũ — void một hoá đơn đã
   * nhận tiền là xoá dấu vết khoản khách đã chuyển. Giao diện phải nói cùng một luật.
   */
  it('đã nhận một phần: KHÔNG có lối chọn lại gói', () => {
    pendingInvoice.data = {
      ...INVOICE,
      status: SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID,
      paidAmount: '100000',
    };
    renderWizard();

    expect(screen.queryByRole('button', { name: 'Chọn lại gói' })).toBeNull();
  });

  it('quay lại bước chọn gói KHÔNG làm mất bậc và kỳ hạn đã chọn', () => {
    renderWizard();
    pickPlanAndContinue();

    fireEvent.click(screen.getByRole('button', { name: 'Quay lại chọn gói' }));

    expect(termCards()[1]!.getAttribute('aria-checked')).toBe('true');
    // Đi tiếp lại được ngay, không phải chọn lại từ đầu.
    expect(screen.getByRole('button', { name: 'Tiếp tục' }).getAttribute('disabled')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(displayNameInput()).toBeTruthy();
  });
});

describe('PackageUpgradeWizard — bước thông tin gian hàng', () => {
  it('điền sẵn từ hồ sơ và CHI NHÁNH MẶC ĐỊNH đang có', () => {
    renderWizard();
    pickPlanAndContinue();

    expect(displayNameInput().value).toBe('Xe của Minh');
    // SĐT thuộc chi nhánh, không thuộc hồ sơ — đọc đúng nguồn.
    expect(phoneInput().value).toBe('0901234567');
    // `addressLine` thật của chi nhánh, không phải chuỗi hiển thị đã ghép cả tỉnh vào.
    expect(addressInput().value).toBe('12 Nguyễn Thái Học');
    expect(screen.getByText('Hà Nội')).toBeTruthy();
  });

  /**
   * Tenant, chi nhánh và xe đã tồn tại. Một luồng nâng cấp gọi `POST /tenants` sẽ tạo ra một gian
   * hàng thứ hai cho cùng một người — và bỏ lại toàn bộ xe ở gian hàng cũ.
   */
  it('KHÔNG đụng tới luồng đăng ký gian hàng ở bất kỳ bước nào', async () => {
    renderWizard();
    pickPlanAndContinue();
    fireEvent.click(submitButton());

    await waitFor(() => expect(purchase.mutate).toHaveBeenCalled());
    expect(useRegisterShop).not.toHaveBeenCalled();
  });

  it('lưu xong hồ sơ VÀ chi nhánh mới tạo hoá đơn, với đúng bậc + kỳ hạn', async () => {
    renderWizard();
    pickPlanAndContinue();
    fireEvent.click(submitButton());

    await waitFor(() =>
      // Tham số thứ hai là callback dọn cờ "đang sửa" sau khi hoá đơn mới về.
      expect(purchase.mutate).toHaveBeenCalledWith(
        { planId: 'plan-basic', termMonths: 3 },
        expect.anything(),
      ),
    );

    // Hồ sơ giữ nguyên những ô form này không hỏi (giới thiệu, ảnh bìa, giấy tờ).
    expect(updateProfile.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'Xe của Minh',
        provinceCode: '01',
        addressLine: '12 Nguyễn Thái Học',
        bio: 'Cho thuê xe tự lái',
      }),
    );
    // SĐT đi đường CHI NHÁNH, kèm đúng id chi nhánh mặc định.
    expect(updateBranch.mutateAsync).toHaveBeenCalledWith({
      id: BRANCH.id,
      phone: '0901234567',
    });
    // Client KHÔNG gửi giá: server đọc lại bảng giá của chính bậc + kỳ hạn này.
    expect(purchase.mutate.mock.calls[0]![0]).not.toHaveProperty('price');
  });

  /**
   * Chi nhánh ghi TRƯỚC hồ sơ, có chủ đích: lượt ghi hồ sơ kéo theo việc dời địa chỉ CÔNG KHAI
   * của gian hàng (backend chuyển tiếp cho chi nhánh mặc định và đồng bộ vị trí xe trên chợ), nên
   * nó phải là lượt CUỐI — hỏng ở đó thì chưa có gì nhìn thấy được từ ngoài chợ bị đổi.
   */
  it('lưu CHI NHÁNH hỏng ⇒ dừng ngay, không đụng hồ sơ và không tạo hoá đơn', async () => {
    updateBranch.mutateAsync.mockRejectedValue(new Error('500'));
    renderWizard();
    pickPlanAndContinue();
    fireEvent.click(submitButton());

    await waitFor(() => expect(updateBranch.mutateAsync).toHaveBeenCalled());
    expect(updateProfile.mutateAsync).not.toHaveBeenCalled();
    expect(purchase.mutate).not.toHaveBeenCalled();
  });

  it('lưu HỒ SƠ hỏng ⇒ không tạo hoá đơn', async () => {
    updateProfile.mutateAsync.mockRejectedValue(new Error('500'));
    renderWizard();
    pickPlanAndContinue();
    fireEvent.click(submitButton());

    await waitFor(() => expect(updateProfile.mutateAsync).toHaveBeenCalled());
    expect(purchase.mutate).not.toHaveBeenCalled();
  });

  /**
   * Bộ trường bắt buộc là luật DÙNG CHUNG với backend (`missingPackageShopRegistrationFields`),
   * nên ô trống phải bị chặn NGAY — không phải sau khi tiền đã về và cổng đăng xe từ chối.
   */
  it('thiếu SĐT liên hệ ⇒ chặn tại chỗ, không lưu và không tạo hoá đơn', async () => {
    branchQuery.data = {
      items: [{ ...BRANCH, phone: null }],
      total: 1,
      activeCount: 1,
      needsReviewCount: 0,
    };
    renderWizard();
    pickPlanAndContinue();
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(screen.getByText('Nhập số điện thoại liên hệ của gian hàng')).toBeTruthy(),
    );
    expect(updateProfile.mutateAsync).not.toHaveBeenCalled();
    expect(purchase.mutate).not.toHaveBeenCalled();
  });

  /** Logo là cổng của việc ĐĂNG XE, không phải cổng của việc mua gói (ADR 0040 điều 7). */
  it('thiếu logo vẫn mua gói được, kèm câu nói rõ nó sẽ bị đòi lúc nào', async () => {
    renderWizard();
    pickPlanAndContinue();

    expect(screen.getByText(/gian hàng phải có logo trước khi gửi xe lên chợ/)).toBeTruthy();

    fireEvent.click(submitButton());
    await waitFor(() => expect(purchase.mutate).toHaveBeenCalled());
  });

  it('gian hàng không có chi nhánh nào ⇒ nói thẳng, không âm thầm bỏ qua SĐT', () => {
    branchQuery.data = { items: [], total: 0, activeCount: 0, needsReviewCount: 0 };
    renderWizard();
    pickPlanAndContinue();

    expect(screen.getByText('Không tìm thấy chi nhánh của gian hàng')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Lưu thông tin/ })).toBeNull();
  });
});

describe('PackageUpgradeWizard — bước thanh toán', () => {
  /**
   * Hoá đơn chờ đến từ `GET /subscription/invoices/pending`, nên F5 / đổi máy đều rơi thẳng vào
   * màn chuyển khoản với ĐÚNG mã cũ — không ai bị mời tạo hoá đơn thứ hai cho cùng một khoản.
   */
  it('đang có hoá đơn chờ: vào thẳng màn chuyển khoản dùng chung, không hiện bảng giá', () => {
    pendingInvoice.data = INVOICE;
    renderWizard();

    expect(screen.getByText('XPG123456')).toBeTruthy();
    expect(screen.getByText('Nội dung chuyển khoản (mã đối soát)')).toBeTruthy();
    expect(screen.getByText(/Đang chờ tiền về/)).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: /Chọn gói dịch vụ/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tiếp tục' })).toBeNull();

    /*
     * Và màn này phải NÓI RA đang mua gì: nó sống qua F5 và qua một lần đăng nhập ở máy khác,
     * nên không có gì bảo đảm người đang đọc còn nhớ mình đã chọn bậc nào.
     */
    expect(screen.getByText('Gói đang mua')).toBeTruthy();
    expect(screen.getByText(/Gói cơ bản/)).toBeTruthy();
    expect(screen.getByText('3 tháng')).toBeTruthy();
    expect(screen.getByText(/Tối đa 3 xe/)).toBeTruthy();
  });

  it('chuyển thiếu: vẫn ở màn đó, nói số còn thiếu chứ không gọi là đã thanh toán', () => {
    pendingInvoice.data = {
      ...INVOICE,
      status: SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID,
      paidAmount: '100000',
    };
    renderWizard();

    expect(screen.getByText(/Đã nhận một phần/)).toBeTruthy();
    expect(screen.getByText('XPG123456')).toBeTruthy();
  });
});
