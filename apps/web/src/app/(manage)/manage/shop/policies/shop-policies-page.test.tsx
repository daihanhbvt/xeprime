import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEPOSIT_POLICY_REASON, PERMISSION, type Permission } from '@xeprime/types';
import type {
  ShopOperationDefaults,
  ShopRentalPolicy,
  TenantRentalTerms,
} from '@/features/rental-policies/types';
import type { PaymentSettings } from '@/features/shop/types';

import ShopPoliciesPage from './page';

/**
 * Đặc tả trang Cấu hình › Chính sách thuê (design `23874:63907`, ráp 06/11/2026).
 *
 * Khoá các hợp đồng: gate quyền, tab Ô tô · Xe máy mang số xe từ API, null-policy, hai API một nút
 * "Lưu thay đổi" (mỗi API chỉ gửi khi phần của nó đổi), bước xác nhận nhạy cảm, công tắc quá giờ, ưu
 * đãi dài hạn không còn công tắc (có mốc = bật), và thẻ thanh toán giữ chỗ sống độc lập.
 */
const perms = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.has(p),
    hasAny: (...ps: string[]) => ps.some((p) => perms.granted.has(p)),
    isLoading: false,
  }),
}));

const nav = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  usePathname: () => '/manage/shop/policies',
  useSearchParams: () => nav.params,
}));

const query = vi.hoisted(() => ({
  data: undefined as ShopRentalPolicy | undefined,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const defaultsQuery = vi.hoisted(() => ({
  data: undefined as ShopOperationDefaults | undefined,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const save = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
/** Điều khoản thuê của GIAN HÀNG (ADR 0112 điều 3) - chung mọi loại xe. */
const termsQuery = vi.hoisted(() => ({
  data: undefined as TenantRentalTerms | undefined,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const saveTerms = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const saveDefaults = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));

/** Cảnh báo đổi chế độ bảo hiểm (ADR 0091) — mặc định nền tảng CHƯA bán theo bậc ⇒ ẩn khối. */
const impactQuery = vi.hoisted(() => ({
  data: { applies: false, total: 0, vehicles: [] } as {
    applies: boolean;
    total: number;
    vehicles: { id: string; name: string; plateNumber: string | null; gaps: string[] }[];
  },
}));

vi.mock('@/features/rental-policies/hooks/use-shop-policy', () => ({
  useShopPolicy: () => query,
  useSaveShopPolicy: () => save,
  useShopOperationDefaults: () => defaultsQuery,
  useSaveShopOperationDefaults: () => saveDefaults,
  useShopInsuranceImpact: () => impactQuery,
  useShopRentalTerms: () => termsQuery,
  useSaveShopRentalTerms: () => saveTerms,
}));

const paymentQuery = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const updatePayment = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('@/hooks/use-tenant-scope', () => ({
  useTenantScope: () => ({ tenant: { id: 'TENANT_1' } }),
}));

vi.mock('@/features/shop/hooks/use-shop', () => ({
  usePaymentSettings: () => paymentQuery,
  useUpdatePaymentSettings: () => updatePayment,
  // Hoá đơn VAT (ADR 0059) - hành vi riêng ở `VatInvoiceSetting.test.tsx`.
  useVatInvoiceSetting: () => ({
    data: { vatInvoiceSupported: false },
    isError: false,
    refetch: vi.fn(),
  }),
  useUpdateVatInvoiceSetting: () => ({ mutate: vi.fn(), isPending: false }),
}));

function paymentFixture(over: Partial<PaymentSettings> = {}): PaymentSettings {
  return {
    billingMode: 'package',
    depositRequired: true,
    depositCollectionEnabled: true,
    planAllows: true,
    editable: true,
    reason: DEPOSIT_POLICY_REASON.PACKAGE_ENABLED,
    ...over,
  };
}

function policyFixture(over: Partial<ShopRentalPolicy> = {}): ShopRentalPolicy {
  return {
    policy: {
      collateralMode: 'required',
      collateralCashEnabled: true,
      collateralAssetEnabled: false,
      collateralCombination: 'any_one',
      collateralAssetTypes: [],
      depositAmount: '5000000',
      insuranceMode: 'optional',
      deliveryEnabled: true,
      deliveryMaxRadiusKm: 10,
      deliveryTiers: [
        { toKm: 3, fee: '0' },
        { toKm: 5, fee: '30000' },
        { toKm: 10, fee: '50000' },
      ],
      includedDistanceKmPerDay: null,
      excessDistanceFeePerKm: null,
      overtimeFeePerHour: '100000',
      overtimeGraceMinutes: null,
      overtimeRoundingMinutes: 15,
      discountEnabled: true,
      discountTiers: [{ minMonths: 1, percent: 5, note: 'Ưu đãi cam kết 1 tháng' }],
      legacyDiscountTiers: [],
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
    inheritingVehicles: 12,
    overriddenVehicles: 3,
    ...over,
  };
}

function defaultsFixture(over: Partial<ShopOperationDefaults> = {}): ShopOperationDefaults {
  return {
    vehicleType: 'car',
    turnaroundBufferMinutes: null,
    inheritingVehicles: 14,
    overriddenVehicles: 1,
    updatedAt: null,
    ...over,
  };
}

function termsFixture(): TenantRentalTerms {
  return {
    items: [
      { serviceType: 'self_drive', termsText: 'Không hút thuốc.', requireTermsAcceptance: true, updatedAt: null },
      { serviceType: 'with_driver', termsText: null, requireTermsAcceptance: false, updatedAt: null },
    ],
  };
}

function grant(...permissions: Permission[]) {
  perms.granted = new Set<string>(permissions);
}

function renderPage() {
  return render(
    <App>
      <ShopPoliciesPage />
    </App>,
  );
}

async function saveAndConfirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
  expect((await screen.findAllByText('Xác nhận thay đổi chính sách thuê?')).length).toBeGreaterThan(
    0,
  );
  const ok = screen.getAllByRole('button', { name: 'Xác nhận thay đổi' });
  fireEvent.click(ok[ok.length - 1]!);
}

beforeEach(() => {
  query.data = policyFixture();
  query.isError = false;
  query.refetch.mockReset();
  defaultsQuery.data = defaultsFixture();
  termsQuery.data = termsFixture();
  termsQuery.isError = false;
  saveTerms.mutateAsync.mockReset().mockImplementation(async () => termsFixture());
  saveTerms.isPending = false;
  defaultsQuery.isError = false;
  defaultsQuery.refetch.mockReset();
  save.mutateAsync.mockReset().mockImplementation(async () => policyFixture());
  save.isPending = false;
  saveDefaults.mutateAsync
    .mockReset()
    .mockImplementation(async (body: { turnaroundBufferMinutes: number }) =>
      defaultsFixture({ turnaroundBufferMinutes: body.turnaroundBufferMinutes }),
    );
  saveDefaults.isPending = false;
  nav.replace.mockReset();
  nav.params = new URLSearchParams();
  paymentQuery.data = paymentFixture();
  paymentQuery.isLoading = false;
  paymentQuery.isError = false;
  paymentQuery.refetch.mockReset();
  updatePayment.mutate.mockReset();
  grant(
    PERMISSION.TENANT_VIEW,
    PERMISSION.TENANT_UPDATE,
    PERMISSION.SELLER_PROFILE_VIEW,
    PERMISSION.SELLER_PROFILE_MANAGE,
  );
});

afterEach(cleanup);

describe('Chính sách thuê - quyền, tải, loại xe', () => {
  it('thiếu tenant.view: thay TOÀN BỘ trang bằng khối quyền', () => {
    grant();
    renderPage();
    expect(screen.getByText('Không có quyền truy cập')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Chính sách thuê' })).toBeNull();
  });

  it('lỗi tải: thẻ thanh toán vẫn dùng được, nút thử lại gọi refetch', () => {
    query.data = undefined;
    query.isError = true;
    renderPage();
    expect(screen.getByRole('switch', { name: /XePrime thu khoản giữ chỗ hộ tôi/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });

  it('tab Ô tô · Xe máy mang tổng số xe của loại; bấm Xe máy ghi ?type= vào URL', () => {
    renderPage();
    const car = screen.getByRole('tab', { name: /Ô tô/ });
    expect(within(car).getByText('15')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Xe máy/ }));
    expect(nav.replace).toHaveBeenCalledWith('/manage/shop/policies?type=motorbike', {
      scroll: false,
    });
  });

  it('đang sửa dở mà đổi loại xe: hỏi trước khi bỏ thay đổi', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Số tiền cọc mặc định'), {
      target: { value: '4000000' },
    });
    fireEvent.click(screen.getByRole('tab', { name: /Xe máy/ }));
    expect((await screen.findAllByText('Bỏ thay đổi chưa lưu?')).length).toBeGreaterThan(0);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('mục lục cột phải có bảy mục theo design; ẩn mục bảo hiểm khi không có thẻ đó', () => {
    impactQuery.data = { applies: true, total: 0, vehicles: [] };
    const { unmount } = renderPage();
    const toc = screen.getByRole('navigation', { name: 'Mục lục chính sách thuê' });
    const labels = [
      'Thanh toán & hóa đơn',
      'Bảo hiểm vật chất xe',
      'Hình thức cọc xe (Thế chấp)',
      'Giới hạn km & Phụ phí quá giờ',
      'Giao nhận xe',
      'Ưu đãi dài hạn',
      'Điều kiện cho thuê',
    ];
    expect(within(toc).getAllByRole('link').map((link) => link.textContent)).toEqual(labels);
    unmount();

    impactQuery.data = { applies: false, total: 0, vehicles: [] };
    renderPage();
    const toc2 = screen.getByRole('navigation', { name: 'Mục lục chính sách thuê' });
    expect(within(toc2).queryByRole('link', { name: 'Bảo hiểm vật chất xe' })).toBeNull();
    expect(within(toc2).getAllByRole('link')).toHaveLength(6);
  });
});

describe('Chính sách thuê - dữ liệu', () => {
  it('giá trị từ API: cọc, số xe dùng mức cọc, bậc giao xe, quá giờ đang bật', () => {
    renderPage();
    expect((screen.getByLabelText('Số tiền cọc mặc định') as HTMLInputElement).value).toBe(
      '5.000.000',
    );
    expect(screen.getByText('12 xe đang dùng mức cọc này')).toBeTruthy();
    expect(screen.getByText('Không có khoảng cách nào trùng nhau')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Hạn mức & phí trả xe quá giờ' })).toHaveProperty(
      'ariaChecked',
      'true',
    );
    expect((screen.getByLabelText('Phí mỗi giờ phát sinh') as HTMLInputElement).value).toBe(
      '100.000',
    );
    // Ô làm tròn đã gỡ - chỉ còn công thức trong ⓘ.
    expect(screen.queryByLabelText('Đơn vị làm tròn tối thiểu')).toBeNull();
  });

  it('chưa có chính sách (null-policy): thông báo + form trống, không bịa mặc định', () => {
    query.data = policyFixture({ policy: null, inheritingVehicles: 0, overriddenVehicles: 0 });
    renderPage();
    expect(screen.getByText('Gian hàng chưa cấu hình chính sách thuê')).toBeTruthy();
    expect((screen.getByLabelText('Số tiền cọc mặc định') as HTMLInputElement).value).toBe('');
  });

  it('cọc kết hợp: bật cọc tài sản mở danh mục tài sản; "Bắt buộc cả 2" chỉ chọn được khi bật cả hai', () => {
    renderPage();
    const card = screen.getByRole('region', { name: 'Hình thức cọc xe (Thế chấp)' });
    const all = within(card).getByRole('radio', { name: 'Bắt buộc cả 2' }) as HTMLInputElement;
    expect(all.disabled).toBe(true);
    fireEvent.click(within(card).getByRole('checkbox', { name: 'Cọc tài sản' }));
    expect(within(card).getByText('Loại tài sản nhận thế chấp')).toBeTruthy();
    expect(within(card).getByLabelText('Số tiền cọc mặc định')).toBeTruthy();
    expect(within(card).getByText('Đang bật 2 hình thức cọc')).toBeTruthy();
    expect(
      (within(card).getByRole('radio', { name: 'Bắt buộc cả 2' }) as HTMLInputElement).disabled,
    ).toBe(false);
  });

  it('miễn thế chấp: ẩn hai hình thức, hiện khối huy hiệu - không eKYC, không "+40%"', () => {
    renderPage();
    const card = screen.getByRole('region', { name: 'Hình thức cọc xe (Thế chấp)' });
    fireEvent.click(within(card).getByRole('radio', { name: /Miễn thế chấp/ }));
    expect(within(card).queryByLabelText('Số tiền cọc mặc định')).toBeNull();
    expect(within(card).getByText(/huy hiệu "Miễn thế chấp"/)).toBeTruthy();
    expect(within(card).queryByText(/eKYC|\+40%/)).toBeNull();
  });

  it('điều kiện cho thuê: giấy tờ + cách đối chiếu chỉ đọc từ luật chuẩn nền tảng', () => {
    renderPage();
    const card = screen.getByRole('region', { name: 'Điều kiện cho thuê' });
    expect(within(card).getAllByText('CMND/CCCD còn hạn hoặc Hộ chiếu còn hạn')).toHaveLength(2);
    expect(within(card).getAllByText('Đối chiếu qua VNeID hoặc bản gốc trực tiếp')).toHaveLength(2);
    // Không phải ô nhập: không ai sửa được giấy tờ.
    expect(within(card).queryByRole('combobox')).toBeNull();
    expect(within(card).getByRole('link', { name: 'Hợp đồng & Chứng từ' })).toBeTruthy();
  });
});

describe('Chính sách thuê - ưu đãi dài hạn', () => {
  it('công thức tính giá gói đứng dưới bảng mốc (khung xem trước giá gói đã gỡ)', () => {
    renderPage();
    const card = screen.getByRole('region', { name: 'Ưu đãi thuê dài hạn (trên 1 tháng)' });
    expect(within(card).getByText('Công thức tính giá gói:')).toBeTruthy();
    expect(screen.queryByRole('complementary', { name: 'Xem trước giá gói thuê dài hạn' })).toBeNull();
  });
});

describe('Chính sách thuê - lưu', () => {
  it('chưa sửa gì: Hủy và Lưu thay đổi đều khoá', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Huỷ' })).toHaveProperty('disabled', true);
  });

  it('sửa cọc → xác nhận nêu phạm vi → chỉ gửi chính sách, tiền là CHUỖI, làm tròn về mặc định', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Số tiền cọc mặc định'), {
      target: { value: '4000000' },
    });
    await saveAndConfirm();
    expect(screen.getAllByText(/12 xe đang kế thừa/).length).toBeGreaterThan(0);
    await waitFor(() => expect(save.mutateAsync).toHaveBeenCalledTimes(1));
    const body = save.mutateAsync.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.depositAmount).toBe('4000000');
    expect(body.overtimeRoundingMinutes).toBeNull();
    expect(body.discountEnabled).toBe(true);
    expect(body.deliveryTiers).toEqual([
      { toKm: 3, fee: '0' },
      { toKm: 5, fee: '30000' },
      { toKm: 10, fee: '50000' },
    ]);
    expect(saveDefaults.mutateAsync).not.toHaveBeenCalled();
  });

  it('nền tảng chưa bán bảo hiểm theo bậc: không có khối chọn Bắt buộc/Tuỳ chọn', () => {
    renderPage();
    expect(screen.queryByRole('radiogroup', { name: 'Bảo hiểm vật chất xe' })).toBeNull();
  });

  it('chọn bảo hiểm Bắt buộc → cảnh báo xe thiếu dữ liệu, xác nhận nêu số xe, gửi insuranceMode', async () => {
    impactQuery.data = {
      applies: true,
      total: 2,
      vehicles: [
        { id: 'V1', name: 'Vios 01', plateNumber: null, gaps: ['insured_value_missing'] },
        { id: 'V2', name: 'City 02', plateNumber: null, gaps: ['photos_missing'] },
      ],
    };
    renderPage();
    const group = screen.getByRole('radiogroup', { name: 'Bảo hiểm vật chất xe' });
    /*
     * Chính sách đang lưu là Tuỳ chọn ⇒ ô đó được chọn sẵn. Đọc class của antd chứ không đọc
     * `:checked`: môi trường test đặt chung `name` cho mọi nhóm radio, nên jsdom chỉ giữ MỘT ô được
     * chọn trên cả trang (nhóm thế chấp giành mất).
     */
    expect(group.querySelector('.ant-radio-wrapper-checked')?.textContent).toMatch(/^Tuỳ chọn/);
    fireEvent.click(within(group).getByRole('radio', { name: /Bắt buộc/ }));
    expect(
      screen.getByText('2 xe chưa đủ dữ liệu bảo hiểm sẽ ngừng nhận đặt tự lái'),
    ).toBeTruthy();
    await saveAndConfirm();
    expect(screen.getAllByText(/2 xe đang dùng chính sách này/).length).toBeGreaterThan(0);
    await waitFor(() => expect(save.mutateAsync).toHaveBeenCalledTimes(1));
    const body = save.mutateAsync.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.insuranceMode).toBe('required');
    impactQuery.data = { applies: false, total: 0, vehicles: [] };
  });

  it('đổi thời gian chết → chỉ gửi mặc định gian hàng', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('radio', { name: '1 giờ' }));
    await saveAndConfirm();
    await waitFor(() =>
      expect(saveDefaults.mutateAsync).toHaveBeenCalledWith({ turnaroundBufferMinutes: 60 }),
    );
    expect(save.mutateAsync).not.toHaveBeenCalled();
  });

  it('tắt quá giờ → phí và thời gian miễn phí gửi null', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('switch', { name: 'Hạn mức & phí trả xe quá giờ' }));
    expect(screen.queryByLabelText('Phí mỗi giờ phát sinh')).toBeNull();
    await saveAndConfirm();
    await waitFor(() => expect(save.mutateAsync).toHaveBeenCalledTimes(1));
    const body = save.mutateAsync.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.overtimeFeePerHour).toBeNull();
    expect(body.overtimeGraceMinutes).toBeNull();
  });

  it('xoá hết mốc ưu đãi → ưu đãi tắt', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Xoá mốc ưu đãi 1' }));
    expect(
      screen.getByText('Chưa có mốc ưu đãi - khách thuê dài hạn trả nguyên giá gói.'),
    ).toBeTruthy();
    await saveAndConfirm();
    await waitFor(() => expect(save.mutateAsync).toHaveBeenCalledTimes(1));
    const body = save.mutateAsync.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.discountEnabled).toBe(false);
    expect(body.discountTiers).toEqual([]);
  });

  it('bán kính lệch mốc cuối → đúng câu chữ server, KHÔNG gửi API', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Bán kính hỗ trợ tối đa tự giao'), {
      target: { value: '12' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(
      await screen.findByText(/Có khoảng trống cấu hình giữa mốc 10 km và 12 km/),
    ).toBeTruthy();
    expect(save.mutateAsync).not.toHaveBeenCalled();
  });

  it('thiếu tenant.update: chỉ xem - ô bị khoá, có lời nói rõ', () => {
    grant(PERMISSION.TENANT_VIEW);
    renderPage();
    expect(screen.getByText('Bạn chỉ có quyền xem chính sách thuê của gian hàng.')).toBeTruthy();
    expect((screen.getByLabelText('Số tiền cọc mặc định') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toHaveProperty('disabled', true);
  });
});

describe('Chính sách thuê - thanh toán giữ chỗ (lưu ngay, quyền riêng)', () => {
  it('thẻ có anchor để route cũ /shop/payment-settings tới đúng chỗ', () => {
    const { container } = renderPage();
    const card = container.querySelector('#deposit-collection');
    expect(card?.textContent).toContain('Thanh toán & hóa đơn');
    expect(card?.textContent).toMatch(/Hỗ trợ xuất ho[áa] đơn VAT/);
  });

  it('giai đoạn nền tảng (không ai bật/tắt được): ẩn hẳn hàng giữ chỗ, VAT vẫn còn', () => {
    paymentQuery.data = paymentFixture({
      editable: false,
      reason: DEPOSIT_POLICY_REASON.PLATFORM_MANDATORY,
    });
    renderPage();
    expect(screen.queryByRole('switch', { name: /XePrime thu khoản giữ chỗ hộ tôi/ })).toBeNull();
    expect(screen.queryByText(/XePrime đang áp dụng thu tiền giữ chỗ/)).toBeNull();
    expect(screen.getByRole('switch', { name: /hỗ trợ xuất hoá đơn VAT/ })).toBeTruthy();
  });

  it('tuyến/gói khoá công tắc: vẫn hiện, khoá, kèm lý do', () => {
    paymentQuery.data = paymentFixture({
      editable: false,
      depositRequired: false,
      reason: DEPOSIT_POLICY_REASON.PACKAGE_FEATURE_MISSING,
    });
    renderPage();
    expect(screen.getByText('Gói hiện tại chưa có tính năng này')).toBeTruthy();
    expect(
      screen.getByRole('switch', { name: /XePrime thu khoản giữ chỗ hộ tôi/ }),
    ).toHaveProperty('disabled', true);
  });

  it('có quyền sửa: bật/tắt gọi đúng mutation', () => {
    renderPage();
    fireEvent.click(screen.getByRole('switch', { name: /XePrime thu khoản giữ chỗ hộ tôi/ }));
    expect(updatePayment.mutate.mock.calls[0]?.[0]).toEqual({ depositCollectionEnabled: false });
  });

  it('không có seller_profile.view: vắng hàng giữ chỗ, KHÔNG chặn cả trang', () => {
    grant(PERMISSION.TENANT_VIEW, PERMISSION.TENANT_UPDATE);
    renderPage();
    expect(screen.queryByRole('switch', { name: /XePrime thu khoản giữ chỗ hộ tôi/ })).toBeNull();
    expect(screen.getByLabelText('Số tiền cọc mặc định')).toBeTruthy();
  });

  it('lỗi tải cấu hình giữ chỗ KHÔNG làm hỏng phần chính sách', () => {
    paymentQuery.data = undefined;
    paymentQuery.isError = true;
    renderPage();
    expect(screen.getByText('Không tải được cấu hình thanh toán giữ chỗ')).toBeTruthy();
    expect(screen.getByLabelText('Số tiền cọc mặc định')).toBeTruthy();
  });
});

describe('Chính sách thuê - điều khoản của gian hàng (ADR 0112 điều 3)', () => {
  it('sửa điều khoản: CHỈ gọi endpoint điều khoản, gửi đủ hai nhóm, chữ rỗng là null', async () => {
    renderPage();
    const card = screen.getByRole('region', { name: 'Điều kiện cho thuê' });
    const [selfDrive] = within(card).getAllByRole('textbox');
    fireEvent.change(selfDrive!, { target: { value: 'Không hút thuốc trong xe.' } });
    await saveAndConfirm();
    await waitFor(() => expect(saveTerms.mutateAsync).toHaveBeenCalledTimes(1));
    expect(saveTerms.mutateAsync.mock.calls[0]![0]).toEqual({
      items: [
        { serviceType: 'self_drive', termsText: 'Không hút thuốc trong xe.', requireTermsAcceptance: true },
        { serviceType: 'with_driver', termsText: null, requireTermsAcceptance: false },
      ],
    });
    expect(save.mutateAsync).not.toHaveBeenCalled();
    expect(saveDefaults.mutateAsync).not.toHaveBeenCalled();
  });
});
