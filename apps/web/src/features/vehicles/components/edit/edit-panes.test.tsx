import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IDENTITY_VERIFY_METHOD,
  SERVICE_TYPE,
  VEHICLE_OPERATION_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';

import {
  VEHICLE_EDIT_TAB,
  WORKSPACE,
  editTabOfLegacyManageSection,
  workspacePaths,
  workspaceVehiclePaths,
} from '@/constants/routes';
import { WorkspaceScope } from '@/hooks/use-workspace';
import type { VehicleDetail } from '@/features/vehicles/types';
import { renderWithIntl } from '@/i18n/test-utils';

import { EditActionsProvider, useEditActions } from './edit-actions';
import { OwnerAddressCard } from './OwnerAddressCard';
import { PolicyPane } from './PolicyPane';
import { ServicesPane } from './ServicesPane';

vi.mock('@/features/vehicle-data/hooks', async () =>
  (await import('@/features/vehicle-data/test-vehicle-data')).vehicleDataHooksMock(),
);
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/manage/vehicles/v1/edit',
  useSearchParams: () => new URLSearchParams(),
}));

const serviceSettings = vi.hoisted(() => ({
  data: undefined as unknown[] | undefined,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const patch = vi.hoisted(() => ({
  mutateAsync: vi.fn(async (_body?: Record<string, unknown>) => undefined),
  isPending: false,
}));
const patchCalls = vi.hoisted(() => ({ serviceTypes: [] as string[] }));
vi.mock('@/features/vehicle-manage/hooks', () => ({
  useVehicleServiceSettings: () => serviceSettings,
  usePatchVehicleServiceSetting: (_id: string, serviceType: string) => {
    patchCalls.serviceTypes.push(serviceType);
    return patch;
  },
  useVehicleOperationSettings: () => operationSettings,
  useSaveVehicleOperationSettings: () => saveOperation,
}));
const operationSettings = vi.hoisted(() => ({
  data: {
    turnaroundBufferMinutes: 0,
    useShopDefault: false,
    shopDefaultMinutes: 120 as number | null,
    pickupWindows: [],
    returnWindows: [],
    updatedAt: null,
  },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const saveOperation = vi.hoisted(() => ({
  mutateAsync: vi.fn(async (body?: Record<string, unknown>) => ({
    turnaroundBufferMinutes: body?.useShopDefault
      ? 120
      : Number(body?.turnaroundBufferMinutes ?? 0),
    useShopDefault: body?.useShopDefault === true,
    shopDefaultMinutes: 120,
    pickupWindows: [],
    returnWindows: [],
    updatedAt: null,
  })),
  isPending: false,
}));

const pricing = vi.hoisted(() => ({
  data: {
    source: 'shop',
    serviceTypes: ['self_drive', 'with_driver'],
    weekdayPrice: '700000',
    weekendPrice: null,
    hourlyPrice: null,
    monthlyPrice: null,
    withDriverDailyPrice: '1200000',
    withDriverInterCityPrice: null,
    withDriverOneWayPrice: null,
    discountPercent: null,
    policy: null,
    shopPolicy: null,
  } as unknown,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const savePricing = vi.hoisted(() => ({
  mutateAsync: vi.fn(async (_body?: Record<string, unknown>) => undefined),
  isPending: false,
}));
vi.mock('@/features/rental-policies/hooks/use-vehicle-pricing', () => ({
  useVehiclePricing: () => pricing,
  useSaveVehiclePricing: () => savePricing,
}));

/** Tình trạng bảo hiểm của xe (ADR 0091) — mặc định nền tảng CHƯA bán theo bậc ⇒ không có khối chọn. */
const insuranceStatus = vi.hoisted(() => ({
  data: { applies: false, eligible: false, gaps: [] as string[] },
}));
vi.mock('@/features/vehicle-documents/hooks', () => ({
  useVehicleInsuranceStatus: () => insuranceStatus,
}));

const updateVehicle = vi.hoisted(() => ({
  mutateAsync: vi.fn(async (_body?: Record<string, unknown>) => undefined),
  isPending: false,
}));
vi.mock('@/features/vehicles/hooks/use-vehicle-mutations', () => ({
  useUpdateVehicle: () => updateVehicle,
}));
vi.mock('@/features/drivers/components/WithDriverWageNote', () => ({
  WithDriverWageNote: () => <p>wage-note</p>,
}));

vi.mock('@/features/branches/hooks/use-branches', () => ({
  useBranches: () => ({
    data: {
      items: [
        {
          id: 'b1',
          name: 'Chi nhánh Quận 1',
          address: '12 Lê Lợi',
          provinceName: 'Hồ Chí Minh',
          latitude: null,
          longitude: null,
          vehicleCount: 3,
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}));
/** Hộp sửa chi nhánh là màn DÙNG CHUNG (đã có test riêng) - ở đây chỉ cần biết nó mở ra. */
vi.mock('@/features/branches/components/BranchFormDialog', () => ({
  BranchFormDialog: ({ open, notice }: { open: boolean; notice?: ReactNode }) =>
    open ? <div data-testid="branch-dialog">{notice}</div> : null,
}));

function setting(overrides: Record<string, unknown> = {}) {
  return {
    serviceType: SERVICE_TYPE.SELF_DRIVE,
    autoAcceptEnabled: false,
    minRentalMinutes: null,
    preferredRouteTypes: [],
    requiredDocuments: [],
    effectiveRequiredDocuments: ['driver_licence', 'citizen_id'],
    identityVerifyMethod: IDENTITY_VERIFY_METHOD.IN_PERSON,
    termsText: 'Điều khoản gốc',
    requireTermsAcceptance: false,
    withDriverAutoAccept: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function vehicle(overrides: Partial<VehicleDetail> = {}): VehicleDetail {
  return {
    id: 'v1',
    code: 'XE-01',
    name: 'Toyota Vios 2023',
    plateNumber: '51A-123.45',
    vehicleType: VEHICLE_TYPE.CAR,
    serviceTypes: [SERVICE_TYPE.SELF_DRIVE, SERVICE_TYPE.WITH_DRIVER],
    operationStatus: VEHICLE_OPERATION_STATUS.AVAILABLE,
    publicStatus: VEHICLE_PUBLIC_STATUS.DRAFT,
    mainImageUrl: null,
    images: [],
    media: [],
    features: [],
    branch: { id: 'b1', name: 'Chi nhánh Quận 1', provinceName: 'Hồ Chí Minh' },
    ...(overrides as Record<string, unknown>),
  } as unknown as VehicleDetail;
}

/** Nút lưu của cột phải - cùng `useEditActions` mà màn sửa xe dùng. */
function SaveBar() {
  const actions = useEditActions();
  return (
    <>
      <button type="button" disabled={!actions?.dirty} onClick={() => void actions?.save()}>
        Lưu ở cột phải
      </button>
      <button type="button" disabled={!actions?.dirty} onClick={() => actions?.undo()}>
        Hoàn tác ở cột phải
      </button>
    </>
  );
}

function renderPane(node: ReactNode) {
  return renderWithIntl(
    <App>
      <EditActionsProvider>
        {node}
        <SaveBar />
      </EditActionsProvider>
    </App>,
  );
}

const onTab = vi.fn();

beforeEach(() => {
  serviceSettings.data = [setting(), setting({ serviceType: SERVICE_TYPE.WITH_DRIVER })];
  serviceSettings.isLoading = false;
  serviceSettings.isError = false;
  patch.mutateAsync = vi.fn(async (_body?: Record<string, unknown>) => undefined);
  patchCalls.serviceTypes = [];
  savePricing.mutateAsync = vi.fn(async (_body?: Record<string, unknown>) => undefined);
  updateVehicle.mutateAsync = vi.fn(async (_body?: Record<string, unknown>) => undefined);
  pricing.isError = false;
  (pricing.data as Record<string, unknown>).source = 'shop';
  (pricing.data as Record<string, unknown>).policy = null;
  (pricing.data as Record<string, unknown>).ownPolicy = null;
  (pricing.data as Record<string, unknown>).inheritedSections = undefined;
  saveOperation.mutateAsync.mockClear();
  insuranceStatus.data = { applies: false, eligible: false, gaps: [] };
  onTab.mockReset();
});
afterEach(cleanup);

describe('Dịch vụ xe - ba tab dịch vụ', () => {
  it('tab dịch vụ nói đúng bật/tắt; công tắc dịch vụ ghi đủ mảng serviceTypes', async () => {
    renderPane(
      <ServicesPane
        // Đủ ba giá có tài xế ⇒ bật là lưu ngay (thiếu giá thì mở hộp nhập giá - test riêng dưới).
        vehicle={vehicle({
          serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
          withDriverDailyPrice: '1200000',
          withDriverInterCityPrice: '2000000',
          withDriverOneWayPrice: '1500000',
        })}
        tab={VEHICLE_EDIT_TAB.WITH_DRIVER}
        canUpdate
        onTab={onTab}
      />,
    );
    const tabs = screen.getByRole('tablist', { name: 'Dịch vụ của xe' });
    const driverTab = within(tabs).getByRole('tab', { name: /Xe có tài xế/ });
    expect(driverTab.getAttribute('aria-selected')).toBe('true');
    expect(within(driverTab).getByRole('img', { name: 'Đang tắt' })).toBeTruthy();
    expect(
      within(within(tabs).getByRole('tab', { name: /Thuê xe tự lái/ })).getByRole('img', {
        name: 'Đang bật',
      }),
    ).toBeTruthy();
    // Dịch vụ đang tắt: không dựng giá (server từ chối giá của dịch vụ xe không phục vụ).
    expect(screen.getByText(/Dịch vụ đang tắt/)).toBeTruthy();
    expect(screen.queryByLabelText(/Nội thành/)).toBeNull();

    fireEvent.click(screen.getByRole('switch', { name: 'Xe có tài xế' }));
    await waitFor(() => expect(updateVehicle.mutateAsync).toHaveBeenCalledTimes(1));
    expect(updateVehicle.mutateAsync.mock.calls[0]![0]).toEqual({
      serviceTypes: ['self_drive', 'with_driver'],
    });

    fireEvent.click(within(tabs).getByRole('tab', { name: /Thuê xe dài hạn/ }));
    expect(onTab).toHaveBeenCalledWith(VEHICLE_EDIT_TAB.LONG_TERM);
  });

  /**
   * Công tắc tự nhận LƯU NGAY - payload chỉ mang `autoAcceptEnabled` (server gộp từng trường).
   * Không có khoảng đặt trước (bỏ 17/09/2026): bật là nhận.
   */
  it('tự động đồng ý nhận chuyến: bấm là lưu ngay, chỉ gửi autoAcceptEnabled', async () => {
    renderPane(
      <ServicesPane
        vehicle={vehicle()}
        tab={VEHICLE_EDIT_TAB.SELF_DRIVE}
        canUpdate
        onTab={onTab}
      />,
    );
    expect(screen.queryByText(/Khoảng thời gian cho phép/i)).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Tự động nhận chuyến' }));
    await waitFor(() => expect(patch.mutateAsync).toHaveBeenCalledTimes(1));
    expect(patch.mutateAsync.mock.calls[0]![0]).toEqual({ autoAcceptEnabled: true });
    // Lưu ngay = không có gì dở cho nút ở cột phải.
    expect(
      (screen.getByRole('button', { name: 'Lưu ở cột phải' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('điều kiện tự nhận mở ra dưới công tắc, và mở ra KHÔNG lật công tắc', async () => {
    renderPane(
      <ServicesPane
        vehicle={vehicle()}
        tab={VEHICLE_EDIT_TAB.SELF_DRIVE}
        canUpdate
        onTab={onTab}
      />,
    );
    const toggle = screen.getByRole('switch', { name: 'Tự động nhận chuyến' });
    const before = toggle.getAttribute('aria-checked');
    expect(screen.queryByText(/kể cả thời gian chết giữa hai chuyến/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Điều kiện để hệ thống tự nhận' }));
    expect(await screen.findByText(/kể cả thời gian chết giữa hai chuyến/i)).toBeTruthy();
    // Khung giờ giao nhận đã gỡ (ADR 0078) - không còn là một điều kiện tự nhận.
    expect(screen.queryByText(/khung giờ/i)).toBeNull();
    expect(toggle.getAttribute('aria-checked')).toBe(before);
    expect(patch.mutateAsync).not.toHaveBeenCalled();
  });

  it('có tài xế: lộ trình ưu tiên lưu qua nút ở cột phải, chỉ mang hai ô của có tài xế', async () => {
    renderPane(
      <ServicesPane
        vehicle={vehicle()}
        tab={VEHICLE_EDIT_TAB.WITH_DRIVER}
        canUpdate
        onTab={onTab}
      />,
    );
    expect(screen.getByText('wage-note')).toBeTruthy();
    // Không có phụ phí tài xế (ADR 0075).
    expect(screen.queryByText(/Phụ phí/)).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Nội thành' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ở cột phải' }));
    await waitFor(() => expect(patch.mutateAsync).toHaveBeenCalledTimes(1));
    expect(patchCalls.serviceTypes).toContain(SERVICE_TYPE.WITH_DRIVER);
    expect(Object.keys(patch.mutateAsync.mock.calls[0]![0]!).sort()).toEqual([
      'minRentalMinutes',
      'preferredRouteTypes',
    ]);
    // Giá không đổi gì thì không ghi giá.
    expect(savePricing.mutateAsync).not.toHaveBeenCalled();
  });

  it('bật có tài xế khi xe chưa có giá: bật NGAY, không hộp nhập giá - giá nhập ở tab (20/11/2026)', async () => {
    renderPane(
      <ServicesPane
        vehicle={vehicle({ serviceTypes: [SERVICE_TYPE.SELF_DRIVE] })}
        tab={VEHICLE_EDIT_TAB.WITH_DRIVER}
        canUpdate
        onTab={onTab}
      />,
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Xe có tài xế' }));
    await waitFor(() => expect(updateVehicle.mutateAsync).toHaveBeenCalledTimes(1));
    expect(updateVehicle.mutateAsync.mock.calls[0]![0]).toEqual({
      serviceTypes: [SERVICE_TYPE.SELF_DRIVE, SERVICE_TYPE.WITH_DRIVER],
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('tab có tài xế nhắc chủ xe khách đang thấy giá nào: chưa có giá ⇒ giá tự lái, chưa gồm tài xế', () => {
    const data = pricing.data as Record<string, unknown>;
    data.withDriverDailyPrice = null;
    try {
      renderPane(
        <ServicesPane
          vehicle={vehicle()}
          tab={VEHICLE_EDIT_TAB.WITH_DRIVER}
          canUpdate
          onTab={onTab}
        />,
      );
      expect(screen.getByText('Khách chưa thấy giá trọn gói có tài xế')).toBeTruthy();
      expect(screen.getByText(/giá thuê tự lái 700\.000/)).toBeTruthy();
      // Không còn dấu * bắt buộc ở ba ô giá có tài xế.
      expect(
        (screen.getByRole('spinbutton', { name: /Nội thành/ }) as HTMLInputElement).required,
      ).toBe(false);
    } finally {
      data.withDriverDailyPrice = '1200000';
    }
  });

  it('tab có tài xế: có giá nội thành, thiếu lộ trình ⇒ nhắc lộ trình đó tính theo mức gần nhất', () => {
    renderPane(
      <ServicesPane
        vehicle={vehicle()}
        tab={VEHICLE_EDIT_TAB.WITH_DRIVER}
        canUpdate
        onTab={onTab}
      />,
    );
    expect(screen.getByText(/tính theo mức gần nhất bạn đã nhập/)).toBeTruthy();
  });

  it('có tài xế: không có công tắc tự nhận chuyến (luôn duyệt tay)', () => {
    serviceSettings.data = [
      setting(),
      setting({
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        withDriverAutoAccept: { available: false, activeDrivers: 0, driversFeatureEnabled: true },
      }),
    ];
    renderPane(
      <ServicesPane
        vehicle={vehicle()}
        tab={VEHICLE_EDIT_TAB.WITH_DRIVER}
        canUpdate
        onTab={onTab}
      />,
    );
    expect(screen.queryByText('Tự động đồng ý nhận chuyến')).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Tự động nhận chuyến' })).toBeNull();
    expect(screen.queryByText(/không tự động nhận/i)).toBeNull();
  });

  it('tab tự lái: giá + khuyến mãi, thẻ hạn mức km & quá giờ có công tắc kế thừa RIÊNG, dải cọc hiện tại', () => {
    renderPane(
      <ServicesPane
        vehicle={vehicle()}
        tab={VEHICLE_EDIT_TAB.SELF_DRIVE}
        canUpdate
        onTab={onTab}
        onOpenPolicy={vi.fn()}
      />,
    );
    expect(screen.getByRole('region', { name: 'Giá thuê & Khuyến mãi' })).toBeTruthy();
    const limits = screen.getByRole('region', { name: 'Giới hạn quãng đường & Phụ phí quá giờ' });
    expect(within(limits).getAllByRole('switch', { name: 'Áp dụng chính sách của gian hàng' })).toHaveLength(1);
    expect(within(limits).getByText(/Hình thức cọc xe hiện tại:/)).toBeTruthy();
    expect(within(limits).getByRole('button', { name: /Thiết lập tại Bảo hiểm & Giao nhận/ })).toBeTruthy();
  });

  it('tải giá lỗi: chỉ phần giá báo lỗi - công tắc dịch vụ và tự nhận vẫn dùng được', () => {
    pricing.isError = true;
    renderPane(
      <ServicesPane
        vehicle={vehicle()}
        tab={VEHICLE_EDIT_TAB.SELF_DRIVE}
        canUpdate
        onTab={onTab}
      />,
    );
    expect(screen.getByText('Không tải được giá & chính sách')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Tự động nhận chuyến' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Cho thuê tự lái' })).toBeTruthy();
  });

  it('lỗi tải thiết lập dịch vụ: có nút thử lại thay cho công tắc tự nhận', () => {
    serviceSettings.data = undefined;
    serviceSettings.isError = true;
    renderPane(
      <ServicesPane
        vehicle={vehicle()}
        tab={VEHICLE_EDIT_TAB.SELF_DRIVE}
        canUpdate
        onTab={onTab}
      />,
    );
    expect(screen.getByRole('button', { name: /thử lại/i })).toBeTruthy();
    expect(screen.queryByRole('switch', { name: 'Tự động nhận chuyến' })).toBeNull();
  });

  it('chỉ có quyền xem: công tắc tự nhận bị khoá, bấm không gọi API', () => {
    renderPane(
      <ServicesPane
        vehicle={vehicle()}
        tab={VEHICLE_EDIT_TAB.SELF_DRIVE}
        canUpdate={false}
        onTab={onTab}
      />,
    );
    const toggle = screen.getByRole('switch', { name: 'Tự động nhận chuyến' }) as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    fireEvent.click(toggle);
    expect(patch.mutateAsync).not.toHaveBeenCalled();
    // Không có quyền sửa thì không có công tắc dịch vụ.
    expect(screen.queryByRole('switch', { name: 'Cho thuê tự lái' })).toBeNull();
  });
});

/** Chính sách riêng của xe - có một bậc theo km còn sót để soi form không đoán phí cho nó. */
const VEHICLE_POLICY = {
  collateralMode: 'required',
  collateralCashEnabled: true,
  collateralAssetEnabled: false,
  collateralCombination: 'any_one',
  collateralAssetTypes: [],
  depositAmount: '3000000',
  deliveryEnabled: true,
  deliveryMaxRadiusKm: 12,
  deliveryTiers: [
    { toKm: 5, fee: '0' },
    { toKm: 12, perKm: '7000' },
  ],
  includedDistanceKmPerDay: null,
  excessDistanceFeePerKm: null,
  overtimeFeePerHour: null,
  overtimeGraceMinutes: null,
  overtimeRoundingMinutes: null,
  discountEnabled: false,
  discountTiers: [],
  legacyDiscountTiers: [],
  insuranceMode: 'optional',
};

/** Xe có dòng chính sách riêng, riêng ở MỌI mục (ADR 0112 - `inheritedSections = []`). */
function ownPolicy(policy: Record<string, unknown> = VEHICLE_POLICY) {
  const data = pricing.data as Record<string, unknown>;
  data.source = 'vehicle';
  data.policy = policy;
  data.ownPolicy = policy;
  data.inheritedSections = [];
}

function renderPolicy(over: Partial<Parameters<typeof PolicyPane>[0]> = {}) {
  return renderPane(<PolicyPane vehicle={vehicle()} canUpdate canEditOperations {...over} />);
}

const INHERIT = 'Áp dụng chính sách của gian hàng';

describe('Bảo hiểm & Giao nhận xe - kế thừa gian hàng THEO MỤC (ADR 0112)', () => {
  it('mỗi thẻ một công tắc riêng; đang theo gian hàng thì ô của thẻ đó khoá', () => {
    renderPolicy();
    const collateral = screen.getByRole('region', { name: 'Hình thức cọc xe (Thế chấp)' });
    const delivery = screen.getByRole('region', { name: 'Giao nhận xe' });
    const collateralInherit = within(collateral).getByRole('switch', { name: INHERIT });
    expect(collateralInherit.getAttribute('aria-checked')).toBe('true');
    expect(within(delivery).getByRole('switch', { name: INHERIT }).getAttribute('aria-checked')).toBe(
      'true',
    );
    const deliverySwitch = within(delivery).getByRole('switch', {
      name: 'Dịch vụ giao nhận xe tận nơi',
    }) as HTMLButtonElement;
    expect(deliverySwitch.disabled).toBe(true);
    // Điều khoản/giấy tờ nay là của gian hàng - màn sửa xe không còn khối đó.
    expect(screen.queryByRole('region', { name: 'Thuê xe tự lái & Thuê xe dài hạn' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /điều khoản/i })).toBeNull();
  });

  it('tắt kế thừa MỘT mục: chỉ mục đó mở ra; lưu gửi các mục còn kế thừa', async () => {
    renderPolicy();
    const collateral = screen.getByRole('region', { name: 'Hình thức cọc xe (Thế chấp)' });
    fireEvent.click(within(collateral).getByRole('switch', { name: INHERIT }));
    fireEvent.click(within(collateral).getByRole('button', { name: '5 triệu' }));
    const delivery = screen.getByRole('region', { name: 'Giao nhận xe' });
    expect(
      (within(delivery).getByRole('switch', { name: 'Dịch vụ giao nhận xe tận nơi' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Lưu ở cột phải' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(savePricing.mutateAsync).toHaveBeenCalledTimes(1));
    const body = savePricing.mutateAsync.mock.calls[0]![0]!;
    expect(body.source).toBe('vehicle');
    expect([...(body.inheritedSections as string[])].sort()).toEqual(
      ['delivery', 'insurance', 'long_term_discount', 'usage_limits'].sort(),
    );
    expect(body.policy).toMatchObject({
      collateralMode: 'required',
      collateralCashEnabled: true,
      depositAmount: '5000000',
    });
  });

  it('bật lại kế thừa cho mục đang RIÊNG thì hỏi trước; Hoàn tác trả công tắc về bản đã lưu', async () => {
    ownPolicy();
    renderPolicy();
    const delivery = screen.getByRole('region', { name: 'Giao nhận xe' });
    const inherit = within(delivery).getByRole('switch', { name: INHERIT });
    expect(inherit.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(inherit);
    expect((await screen.findAllByText('Áp dụng lại chính sách của gian hàng?')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Đặt lại' }));
    await waitFor(() => expect(inherit.getAttribute('aria-checked')).toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: 'Hoàn tác ở cột phải' }));
    await waitFor(() => expect(inherit.getAttribute('aria-checked')).toBe('false'));
  });

  it('giao xe chỉ còn phí trọn gói - không có lựa chọn "Theo km"; bậc theo km còn sót hiện ô phí trống', () => {
    ownPolicy();
    renderPolicy();
    const delivery = screen.getByRole('region', { name: 'Giao nhận xe' });
    expect(within(delivery).queryByText(/Theo km/i)).toBeNull();
    const second = within(delivery).getByLabelText(/Phí của bậc 2/i) as HTMLInputElement;
    expect(second.value).toBe('');
  });

  it('thời gian chuẩn bị xe: lưu ở cột phải CHỈ gửi số phút - không còn khung giờ giao nhận', async () => {
    renderPolicy();
    expect(screen.queryByText(/Khung giờ giao/)).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: '1 giờ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ở cột phải' }));
    await waitFor(() => expect(saveOperation.mutateAsync).toHaveBeenCalledTimes(1));
    expect(saveOperation.mutateAsync.mock.calls[0]![0]).toEqual({
      turnaroundBufferMinutes: 60,
      useShopDefault: false,
    });
    expect(savePricing.mutateAsync).not.toHaveBeenCalled();
  });

  it('thời gian chuẩn bị xe: chọn "Theo gian hàng" gửi cờ kế thừa, nhãn nói số của gian hàng', async () => {
    renderPolicy();
    fireEvent.click(screen.getByRole('radio', { name: 'Theo gian hàng (2 giờ)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ở cột phải' }));
    await waitFor(() => expect(saveOperation.mutateAsync).toHaveBeenCalledTimes(1));
    expect(saveOperation.mutateAsync.mock.calls[0]![0]).toMatchObject({ useShopDefault: true });
  });

  it('xe có tài xế còn thiếu giá lộ trình: sửa chính sách vẫn lưu được (giá có tài xế không bắt buộc)', async () => {
    ownPolicy({ ...VEHICLE_POLICY, deliveryTiers: [{ toKm: 20, fee: '0' }] });
    renderPolicy();
    const radius = screen.getByRole('spinbutton', { name: /Bán kính hỗ trợ tối đa tự giao/i });
    fireEvent.change(radius, { target: { value: '20' } });
    fireEvent.blur(radius);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ở cột phải' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(savePricing.mutateAsync).toHaveBeenCalledTimes(1));
    const body = savePricing.mutateAsync.mock.calls[0]![0]!;
    expect(body.policy).toMatchObject({ deliveryMaxRadiusKm: 20 });
    expect(body.inheritedSections).toEqual([]);
    expect(body).toMatchObject({ withDriverDailyPrice: '1200000', withDriverInterCityPrice: null });
    expect(screen.queryByText(/còn ô (giá )?chưa hợp lệ/)).toBeNull();
  });

  it('ô giá ở mục khác chặn lượt lưu: thông báo nêu ĐÚNG tên ô đó, không đưa ví dụ đoán mò', async () => {
    ownPolicy({ ...VEHICLE_POLICY, deliveryTiers: [{ toKm: 20, fee: '0' }] });
    const data = pricing.data as Record<string, unknown>;
    data.weekdayPrice = null;
    try {
      renderPolicy();
      const radius = screen.getByRole('spinbutton', { name: /Bán kính hỗ trợ tối đa tự giao/i });
      fireEvent.change(radius, { target: { value: '20' } });
      fireEvent.blur(radius);
      fireEvent.click(screen.getByRole('button', { name: 'Lưu ở cột phải' }));

      expect(
        await screen.findByText(
          'Mục Dịch vụ xe còn ô chưa hợp lệ: Giá ngày thường - mở mục đó để sửa rồi lưu lại.',
        ),
      ).toBeTruthy();
      expect(savePricing.mutateAsync).not.toHaveBeenCalled();
    } finally {
      data.weekdayPrice = '700000';
    }
  });

  it('có tài xế: không có ô cọc giữ chuyến; không hứa đối chiếu VNeID tự động', () => {
    renderPolicy();
    expect(screen.queryByText(/cọc giữ chuyến/i)).toBeNull();
    expect(screen.queryByText(/30%|50%/)).toBeNull();
    expect(screen.queryByText(/tự động (tra cứu|xác thực|định danh)/i)).toBeNull();
  });

  it('miễn thế chấp: khối huy hiệu, không có ô eKYC hay con số "+40%"', () => {
    ownPolicy({ ...VEHICLE_POLICY, collateralMode: 'none', collateralCashEnabled: false, depositAmount: '0' });
    renderPolicy();
    expect(screen.getByText(/huy hiệu "Miễn thế chấp"/)).toBeTruthy();
    expect(screen.queryByText(/eKYC|\+40%/)).toBeNull();
  });
});

/**
 * Bảo hiểm Bắt buộc mà xe thiếu dữ liệu ⇒ xe ngừng nhận đặt tự lái (ADR 0091 điều 1). Chủ xe phải
 * thấy điều đó NGAY khi chọn, kèm đúng thứ còn thiếu và chỗ bổ sung — không phải đợi khách báo.
 */
describe('Bảo hiểm & Giao nhận xe - bảo hiểm Bắt buộc báo trước xe thiếu gì', () => {
  const BLOCKED = /chưa đủ dữ liệu bảo hiểm nên không nhận đặt tự lái/;

  beforeEach(() => ownPolicy());

  it('chọn Bắt buộc khi xe thiếu dữ liệu: liệt kê từng mục, mỗi mục dẫn tới đúng tab', () => {
    insuranceStatus.data = {
      applies: true,
      eligible: false,
      gaps: ['insured_value_missing', 'photos_missing', 'registration_missing'],
    };
    renderPolicy();
    expect(screen.getByRole('region', { name: 'Bảo hiểm vật chất xe' })).toBeTruthy();
    expect(screen.queryByText(BLOCKED)).toBeNull();

    fireEvent.click(
      within(screen.getByRole('region', { name: 'Bảo hiểm vật chất xe' })).getByRole('radio', {
        name: /Bắt buộc/,
      }),
    );

    expect(screen.getByText(BLOCKED)).toBeTruthy();
    const href = (name: string) => screen.getByRole('link', { name }).getAttribute('href');
    expect(href('Chưa khai giá trị xe')).toBe('/manage/vehicles/v1/edit?tab=information');
    expect(href('Thiếu ảnh bắt buộc của xe')).toBe('/manage/vehicles/v1/edit?tab=media');
    expect(href('Chưa có cà vẹt (số khung + tên chủ)')).toBe(
      '/manage/vehicles/v1/edit?tab=documents',
    );
  });

  it('xe đủ điều kiện: chọn Bắt buộc không có cảnh báo', () => {
    insuranceStatus.data = { applies: true, eligible: true, gaps: [] };
    renderPolicy();
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Bảo hiểm vật chất xe' })).getByRole('radio', {
        name: /Bắt buộc/,
      }),
    );
    expect(screen.queryByText(BLOCKED)).toBeNull();
  });
});

/**
 * Chủ xe tuyến hoa hồng cấu hình chính sách trên TỪNG xe (ADR 0085 điều 3): không công tắc chính sách
 * gian hàng, nhưng ĐỦ khối như gian hàng — kể cả phí quá giờ (nay ở mục Dịch vụ xe, ADR 0112).
 */
describe('Chính sách xe - chủ xe tuyến hoa hồng', () => {
  const ownerWorkspace = {
    workspace: WORKSPACE.ACCOUNT,
    paths: workspacePaths(WORKSPACE.ACCOUNT),
    vehicles: workspaceVehiclePaths(WORKSPACE.ACCOUNT),
    isManage: false,
  };

  it('không công tắc chính sách gian hàng; có khối cọc, giao nhận và phí quá giờ', () => {
    renderPane(
      <WorkspaceScope value={ownerWorkspace}>
        <PolicyPane vehicle={vehicle()} canUpdate canEditOperations />
        <ServicesPane
          vehicle={vehicle()}
          tab={VEHICLE_EDIT_TAB.SELF_DRIVE}
          canUpdate
          onTab={onTab}
        />
      </WorkspaceScope>,
    );
    expect(screen.queryByRole('switch', { name: INHERIT })).toBeNull();
    expect(screen.getAllByRole('region', { name: 'Hình thức cọc xe (Thế chấp)' }).length).toBe(1);
    expect(screen.getByRole('region', { name: 'Giao nhận xe' })).toBeTruthy();
    expect(screen.getAllByText(/quá giờ/i).length).toBeGreaterThan(0);
  });
});

describe('Địa chỉ xe (chủ xe tuyến hoa hồng)', () => {
  it('thiếu toạ độ / khoá bản đồ: vẫn hiện địa chỉ và vẫn sửa được', async () => {
    renderPane(<OwnerAddressCard vehicle={vehicle()} canEdit />);
    expect(screen.getByText(/12 Lê Lợi/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));
    expect(await screen.findByTestId('branch-dialog')).toBeTruthy();
  });

  it('chi nhánh đang giữ nhiều xe: cảnh báo trước khi đổi địa chỉ', async () => {
    renderPane(<OwnerAddressCard vehicle={vehicle()} canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));
    expect((await screen.findByTestId('branch-dialog')).textContent).toMatch(/3 xe/);
  });
});

describe('URL cũ của không gian "Quản lý xe"', () => {
  it.each([
    [[], VEHICLE_EDIT_TAB.INFORMATION],
    [['information'], VEHICLE_EDIT_TAB.INFORMATION],
    [['images'], VEHICLE_EDIT_TAB.MEDIA],
    [['trip-history'], VEHICLE_EDIT_TAB.TRIP_HISTORY],
    [['pricing'], VEHICLE_EDIT_TAB.PRICING],
    [['handover-time'], VEHICLE_EDIT_TAB.POLICY],
    [['self-drive', 'optimization'], VEHICLE_EDIT_TAB.SELF_DRIVE],
    [['self-drive', 'terms'], VEHICLE_EDIT_TAB.SELF_DRIVE_TERMS],
    [['self-drive', 'delivery'], VEHICLE_EDIT_TAB.POLICY],
    [['with-driver', 'surcharges'], VEHICLE_EDIT_TAB.WITH_DRIVER],
    [['with-driver', 'terms'], VEHICLE_EDIT_TAB.WITH_DRIVER_TERMS],
    [['không-có'], VEHICLE_EDIT_TAB.INFORMATION],
  ])('/manage/%j → ?tab=%s', (section, tab) => {
    expect(editTabOfLegacyManageSection(section)).toBe(tab);
  });
});
