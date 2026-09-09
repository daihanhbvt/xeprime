import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IDENTITY_VERIFY_METHOD,
  SERVICE_TYPE,
  VEHICLE_OPERATION_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';

import type { VehicleDetail } from '@/features/vehicles/types';
import { renderWithIntl } from '@/i18n/test-utils';

import { VehicleManageProvider } from '../VehicleManageContext';
import { AutoAcceptSection } from './AutoAcceptSection';
import { DocumentsSection } from './DocumentsSection';
import { InformationSection } from './InformationSection';
import { TermsSection } from './TermsSection';

/**
 * Các mục con của không gian "Quản lý xe".
 *
 * Điều quan trọng nhất ở đây là **một màn nhỏ không được làm mất thiết lập của màn khác**: cả ba
 * màn tự lái (tối ưu nhận chuyến, thủ tục, giá) cùng ghi vào MỘT bản ghi thiết lập dịch vụ, nên
 * mỗi màn chỉ được gửi đúng phần của nó (PATCH), không gửi cả bộ nó đang thấy.
 *
 * Ngoài ra: giấy tờ xe đi qua đúng workspace bảo mật đang có (không có luồng upload thứ hai),
 * và địa chỉ xe vẫn sửa được khi chưa cấu hình khoá bản đồ.
 */
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => '/account/vehicles/v1/manage/self-drive/optimization',
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
vi.mock('../../hooks', () => ({
  useVehicleServiceSettings: () => serviceSettings,
  usePatchVehicleServiceSetting: (_id: string, serviceType: string) => {
    patchCalls.serviceTypes.push(serviceType);
    return patch;
  },
  useVehicleOperationSettings: () => ({ data: undefined, isLoading: false, isError: false }),
  useSaveVehicleOperationSettings: () => patch,
  useDriverSurchargeRules: () => ({ data: [], isLoading: false, isError: false }),
  useSaveDriverSurchargeRules: () => patch,
}));

const pricing = vi.hoisted(() => ({
  data: {
    source: 'shop',
    serviceTypes: ['self_drive'],
    weekdayPrice: '700000',
    weekendPrice: null,
    hourlyPrice: null,
    monthlyPrice: null,
    withDriverDailyPrice: null,
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
  mutateAsync: vi.fn(async () => undefined),
  mutate: vi.fn(),
  isPending: false,
}));
vi.mock('@/features/rental-policies/hooks/use-vehicle-pricing', () => ({
  useVehiclePricing: () => pricing,
  useSaveVehiclePricing: () => savePricing,
}));

const updateVehicle = vi.hoisted(() => ({
  mutateAsync: vi.fn(async () => undefined),
  isPending: false,
}));
vi.mock('@/features/vehicles/hooks/use-vehicle-mutations', () => ({
  useUpdateVehicle: () => updateVehicle,
}));

const branches = vi.hoisted(() => ({
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
}));
vi.mock('@/features/branches/hooks/use-branches', () => ({
  useBranches: () => branches,
  useActiveBranches: () => branches,
}));

/** Hộp sửa chi nhánh là màn DÙNG CHUNG (đã có test riêng) — ở đây chỉ cần biết nó mở ra. */
vi.mock('@/features/branches/components/BranchFormDialog', () => ({
  BranchFormDialog: ({ open, notice }: { open: boolean; notice?: React.ReactNode }) =>
    open ? <div data-testid="branch-dialog">{notice}</div> : null,
}));

/** Giấy tờ xe: workspace bảo mật dùng chung — marker để khẳng định KHÔNG có luồng thứ hai. */
vi.mock('@/features/vehicle-documents/components/VehicleDocumentsWorkspace', () => ({
  VehicleDocumentsWorkspace: ({ vehicle }: { vehicle: { id: string } }) => (
    <div data-testid="documents-workspace">{vehicle.id}</div>
  ),
}));

/** Danh mục hãng/tiện ích là truy vấn dùng chung — cắt ở biên để không phải dựng QueryClient. */
vi.mock('@/features/catalog/use-catalog', () => ({
  useCatalog: () => ({ catalog: {}, isLoading: false }),
  useCatalogItems: () => ({ items: [], isLoading: false }),
  useCatalogLabels: () => ({ brand: () => '', feature: () => '', fuel: () => '', body: () => '' }),
  useCatalogOptions: () => [],
}));

function setting(overrides: Record<string, unknown> = {}) {
  return {
    serviceType: SERVICE_TYPE.SELF_DRIVE,
    autoAcceptEnabled: false,
    autoAcceptMinLeadMinutes: 360,
    autoAcceptMaxLeadMinutes: 10080,
    minRentalMinutes: null,
    preferredRouteTypes: [],
    requiredDocuments: [],
    effectiveRequiredDocuments: ['driver_licence', 'citizen_id'],
    identityVerifyMethod: IDENTITY_VERIFY_METHOD.IN_PERSON,
    termsText: 'Điều khoản gốc',
    requireTermsAcceptance: false,
    depositMode: 'none',
    supportedDepositModes: ['none'],
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

function renderSection(node: React.ReactNode, canEdit = true, v = vehicle()) {
  return renderWithIntl(
    <App>
      <VehicleManageProvider value={{ vehicle: v, canEdit }}>{node}</VehicleManageProvider>
    </App>,
  );
}

beforeEach(() => {
  serviceSettings.data = [setting(), setting({ serviceType: SERVICE_TYPE.WITH_DRIVER })];
  serviceSettings.isLoading = false;
  serviceSettings.isError = false;
  patch.mutateAsync = vi.fn(async (_body?: Record<string, unknown>) => undefined);
  patch.isPending = false;
  patchCalls.serviceTypes = [];
  savePricing.mutateAsync = vi.fn(async () => undefined);
  updateVehicle.mutateAsync = vi.fn(async () => undefined);
});

afterEach(cleanup);

describe('Tối ưu nhận chuyến — lưu một màn không xoá thiết lập màn khác', () => {
  it('chỉ gửi các trường của chính nó, KHÔNG gửi điều khoản/giấy tờ đang có', async () => {
    renderSection(<AutoAcceptSection serviceType={SERVICE_TYPE.SELF_DRIVE} />);

    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(patch.mutateAsync).toHaveBeenCalled());
    const sent = patch.mutateAsync.mock.calls[0]![0]!;
    expect(sent.autoAcceptEnabled).toBe(true);
    expect(Object.keys(sent)).not.toContain('termsText');
    expect(Object.keys(sent)).not.toContain('requiredDocuments');
    expect(Object.keys(sent)).not.toContain('requireTermsAcceptance');
  });

  it('tự lái KHÔNG gửi trường riêng của có tài xế', async () => {
    renderSection(<AutoAcceptSection serviceType={SERVICE_TYPE.SELF_DRIVE} />);
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(patch.mutateAsync).toHaveBeenCalled());
    const sent = patch.mutateAsync.mock.calls[0]![0]!;
    expect(Object.keys(sent)).not.toContain('minRentalMinutes');
    expect(Object.keys(sent)).not.toContain('preferredRouteTypes');
  });

  it('ghi vào đúng dịch vụ đang mở', () => {
    renderSection(<AutoAcceptSection serviceType={SERVICE_TYPE.WITH_DRIVER} />);
    expect(patchCalls.serviceTypes).toContain(SERVICE_TYPE.WITH_DRIVER);
  });

  it('có tài xế mà gian hàng chưa có tài xế: nói rõ lý do chưa bật được', () => {
    serviceSettings.data = [
      setting(),
      setting({
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        withDriverAutoAccept: { available: false, activeDrivers: 0, driversFeatureEnabled: true },
      }),
    ];
    renderSection(<AutoAcceptSection serviceType={SERVICE_TYPE.WITH_DRIVER} />);
    expect(screen.getAllByText(/chưa có tài xế|cần ít nhất một tài xế/i).length).toBeGreaterThan(0);
  });

  it('lỗi tải thiết lập: hiện trạng thái lỗi có nút thử lại, không hiện form rỗng', () => {
    serviceSettings.data = undefined;
    serviceSettings.isError = true;
    renderSection(<AutoAcceptSection serviceType={SERVICE_TYPE.SELF_DRIVE} />);

    expect(screen.getByRole('button', { name: /thử lại/i })).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('chỉ có quyền xem: nút lưu bị khoá', () => {
    renderSection(<AutoAcceptSection serviceType={SERVICE_TYPE.SELF_DRIVE} />, false);
    const save = screen.getByRole('button', { name: 'Lưu thay đổi' });
    expect(save.getAttribute('disabled')).not.toBeNull();
  });
});

describe('Thủ tục cho thuê', () => {
  it('không ghi chính sách bảo đảm khi chủ xe chỉ sửa điều khoản', async () => {
    renderSection(<TermsSection serviceType={SERVICE_TYPE.SELF_DRIVE} />);

    const textarea = screen.getByRole('textbox', { name: /điều khoản/i });
    fireEvent.change(textarea, { target: { value: 'Điều khoản mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(patch.mutateAsync).toHaveBeenCalled());
    const sent = patch.mutateAsync.mock.calls[0]![0]!;
    expect(sent.termsText).toBe('Điều khoản mới');
    // Không đụng tới giá/chính sách: đó là màn khác và là một bản ghi khác.
    expect(savePricing.mutateAsync).not.toHaveBeenCalled();
  });

  it('có tài xế: 30%/50% hiện nhưng bị khoá kèm lý do — không lưu một % không thu được', () => {
    renderSection(<TermsSection serviceType={SERVICE_TYPE.WITH_DRIVER} />);

    const options = screen.getAllByRole('radio');
    const disabled = options.filter((el) => el.hasAttribute('disabled'));
    expect(disabled.length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/chưa thu được|chưa hỗ trợ|chưa dùng được/i).length).toBeGreaterThan(
      0,
    );
  });

  it('không hứa đối chiếu VNeID tự động', () => {
    renderSection(<TermsSection serviceType={SERVICE_TYPE.SELF_DRIVE} />);
    expect(screen.queryByText(/tự động (tra cứu|xác thực|định danh)/i)).toBeNull();
  });
});

describe('Giấy tờ xe — không có luồng upload thứ hai', () => {
  it('mục giấy tờ chỉ bọc workspace bảo mật dùng chung', () => {
    renderSection(<DocumentsSection />);
    expect(screen.getByTestId('documents-workspace').textContent).toBe('v1');
  });
});

describe('Địa chỉ xe', () => {
  it('thiếu khoá bản đồ: vẫn hiện địa chỉ và vẫn sửa được', async () => {
    renderSection(<InformationSection />);

    expect(screen.getByText(/12 Lê Lợi/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));
    expect(await screen.findByTestId('branch-dialog')).toBeTruthy();
  });

  it('chi nhánh đang giữ nhiều xe: cảnh báo trước khi đổi địa chỉ', async () => {
    renderSection(<InformationSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));

    const dialog = await screen.findByTestId('branch-dialog');
    expect(dialog.textContent).toMatch(/3 xe/);
  });
});
