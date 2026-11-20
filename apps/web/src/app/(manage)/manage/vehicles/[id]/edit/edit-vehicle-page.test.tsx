import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ERROR_CODE, PERMISSION, SUPPORT_WORKSPACE } from '@xeprime/types';
import {
  WORKSPACE,
  adminTenantSupportPath,
  workspacePaths,
  workspaceVehiclePaths,
} from '@/constants/routes';
import { supportWorkspaceValue } from '@/features/tenant-support/components/SupportWorkspaceProvider';
import { SupportSessionScope, supportSessionOf } from '@/features/tenant-support/support-session';
import { CONTEXT_A, supportContextFixture } from '@/features/tenant-support/test-utils';
import { WorkspaceScope } from '@/hooks/use-workspace';
import EditVehiclePage from './page';

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
/** `?…` của URL hiện tại — test bí danh tab ghi vào đây trước khi render. */
const url = vi.hoisted(() => ({ search: '' }));
/**
 * Trục NĂNG LỰC theo gói — mặc định gian hàng đủ cờ.
 *
 * `useVehicleCapabilities` kiểm quyền ∧ cờ gói, và `useFeature` đọc `/auth/me` qua TanStack
 * Query. Test này mock `use-permissions` nên không dựng `QueryClientProvider`; thiếu mock
 * ở đây thì component chết vì hạ tầng, không vì thứ đang kiểm.
 */
const plan = vi.hoisted(() => ({ fullManage: true }));
vi.mock('@/hooks/use-feature', () => ({
  useFeature: () => ({
    state: plan.fullManage ? 'enabled' : 'hidden',
    canWrite: plan.fullManage,
    isVisible: plan.fullManage,
    planEndsAt: null,
  }),
  useFeatureStates: () => ({}),
  usePlanEndsAt: () => null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  useParams: () => ({ id: 'vehicle-1' }),
  usePathname: () => '/manage/vehicles/vehicle-1/edit',
  useSearchParams: () => new URLSearchParams(url.search),
}));
vi.mock('@/features/catalog/use-catalog-models', async () =>
  (await import('@/features/catalog/test-catalog')).catalogModelsModuleMock(),
);
vi.mock('@/features/catalog/use-catalog', async () =>
  (await import('@/features/catalog/test-catalog')).catalogModuleMock(),
);
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));
vi.mock('@/services/upload', () => ({
  presignVehicleImage: vi.fn(),
  presignVehicleContract: vi.fn(),
  uploadImage: vi.fn(),
  uploadToR2: vi.fn(),
  validateImageFile: () => null,
  validateImageSelection: () => null,
  validateDocumentFile: () => null,
  validateDocumentSelection: () => null,
}));
vi.mock('@/features/rental-policies/hooks/use-vehicle-pricing', () => ({
  useVehiclePricing: () => ({
    data: undefined,
    isLoading: false,
    isError: true,
    refetch: vi.fn(),
  }),
  useSaveVehiclePricing: () => ({ mutate: vi.fn(), isPending: false }),
}));
/** Tab Bảo dưỡng & KM (Wave 6) gọi TanStack Query — test này không dựng provider. */
vi.mock('@/features/vehicle-maintenance/hooks', () => ({
  useMaintenanceProfile: () => ({ data: undefined, isLoading: false, isError: false }),
  useMaintenanceRecords: () => ({ data: undefined, isLoading: false, isError: false }),
  useOdometerHistory: () => ({ data: undefined, isLoading: false, isError: false }),
  useInvalidateMaintenance: () => vi.fn(),
}));

vi.mock('@/features/vehicles/hooks/use-vehicle-source', () => ({
  useVehicleSource: () => ({
    data: { sourceType: 'owned', detail: null },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSaveVehicleSource: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

/**
 * Quyền của một CHỦ GIAN HÀNG — bộ đủ, đúng như dữ liệu thật.
 *
 * Danh sách này nới ra ngày 29/09/2026 cùng lúc với việc gác tab theo năng lực. Trước đó nó chỉ
 * có `vehicles.update` + `finance.view`, và các tab Giấy tờ / Bảo dưỡng vẫn dựng — vì chúng
 * chưa gác quyền gì cả. Giữ bộ hẹp đó bây giờ nghĩa là khoá lại một tình huống KHÔNG tồn tại:
 * đối chiếu trên DB, cả chủ xe cá nhân lẫn chủ gian hàng đều có đủ `vehicles.documents.view` và
 * `vehicles.maintenance.view` (cùng vai `shop_owner` — ADR 0014). Thứ tách hai tuyến là cờ gói,
 * và đó là thứ `plan.hasFullManage` ở trên mô tả.
 */
const permissions = vi.hoisted(() => ({ allow: true }));
const OWNER_PERMISSIONS: readonly string[] = [
  PERMISSION.VEHICLE_UPDATE,
  PERMISSION.FINANCE_VIEW,
  PERMISSION.VEHICLE_DOCUMENT_VIEW,
  PERMISSION.VEHICLE_MAINTENANCE_VIEW,
];
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (permission: string) => permissions.allow && OWNER_PERMISSIONS.includes(permission),
    hasAny: () => permissions.allow,
    isLoading: false,
  }),
}));

/** Giấy tờ: menu đếm loại cốt lõi đã có file — xe mẫu có 2/3. */
vi.mock('@/features/vehicle-documents/hooks', () => ({
  useVehicleDocuments: () => ({
    data: [
      { id: 'd1', type: 'registration', hasFile: true, presentation: 'valid', updatedAt: '' },
      { id: 'd2', type: 'insurance', hasFile: true, presentation: 'valid', updatedAt: '' },
      { id: 'd3', type: 'inspection', hasFile: false, presentation: 'missing', updatedAt: '' },
    ],
    isLoading: false,
    isError: false,
  }),
}));
/** Thiết lập dịch vụ + khung giờ của các mục "Hình thức cho thuê". */
vi.mock('@/features/vehicle-manage/hooks', () => ({
  useVehicleServiceSettings: () => ({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  usePatchVehicleServiceSetting: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useVehicleOperationSettings: () => ({ data: undefined, isLoading: true, isError: false }),
  useSaveVehicleOperationSettings: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useVehicleTripHistoryFilters: () => ({ filters: {}, setFilters: vi.fn() }),
  useVehicleTripHistory: () => ({ data: undefined, isLoading: true, isError: false }),
}));
vi.mock('@/features/drivers/components/WithDriverWageNote', () => ({
  WithDriverWageNote: () => null,
}));

/** Chi nhánh của xe — bộ chọn ở mục Thông tin đọc danh sách này. */
vi.mock('@/features/branches/hooks/use-branches', () => ({
  useBranches: () => ({ data: { items: [] }, isLoading: false, isError: false }),
  useActiveBranches: () => ({
    data: {
      items: [
        { id: 'branch-1', name: 'Chi nhánh HCM', provinceName: 'Hồ Chí Minh', isDefault: true },
        { id: 'branch-2', name: 'Chi nhánh Hà Nội', provinceName: 'Hà Nội', isDefault: false },
      ],
      total: 2,
      activeCount: 2,
    },
    isLoading: false,
    isError: false,
  }),
}));

const vehicle = {
  id: 'vehicle-1',
  code: 'XP-001',
  name: 'Toyota Vios 2024',
  // Xe luôn thuộc một chi nhánh — đây là vị trí công khai của nó (wave chi nhánh).
  branch: {
    id: 'branch-1',
    name: 'Chi nhánh HCM',
    provinceCode: '79',
    provinceName: 'Hồ Chí Minh',
  },
  plateNumber: '51A-123.45',
  vehicleType: 'car' as const,
  serviceTypes: ['self_drive'] as const,
  sourceType: 'owned' as const,
  brand: 'toyota',
  model: 'Vios',
  manufactureYear: 2024,
  seatCount: 5,
  bodyType: 'sedan',
  discountPercent: null,
  operationStatus: 'available' as const,
  publicStatus: 'approved_public' as const,
  mainImageUrl: 'https://cdn.test/main.jpg',
  weekdayPrice: '850000',
  weekendPrice: '1000000',
  updatedAt: new Date().toISOString(),
  color: 'Trắng',
  fuelType: 'gasoline',
  description: 'Xe gia đình',
  hourlyPrice: null,
  deliveryEnabled: true,
  noCollateral: false,
  createdAt: new Date().toISOString(),
  images: ['https://cdn.test/gallery.jpg'],
  features: ['bluetooth'],
  latestPublicReview: null,
  lengthMm: 4425,
  widthMm: 1730,
  heightMm: 1475,
  curbWeightKg: 1110,
  engineDisplacementCc: 1496,
  horsepowerHp: 107,
  transmission: 'automatic' as const,
  fuelConsumptionCity: '7.5',
  fuelConsumptionHighway: '5.1',
  fuelConsumptionCombined: '6.0',
};

const query = vi.hoisted(() => ({
  data: undefined as typeof vehicle | undefined,
  isLoading: false,
  isError: false,
  error: undefined as unknown,
  refetch: vi.fn(),
  requestedId: undefined as string | undefined,
}));
vi.mock('@/features/vehicles/hooks/use-vehicle', () => ({
  useVehicle: (id?: string) => {
    query.requestedId = id;
    return query;
  },
}));

const update = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  isPending: false,
  isError: false,
  error: undefined as unknown,
}));
vi.mock('@/features/vehicles/hooks/use-vehicle-mutations', () => ({
  useUpdateVehicle: () => update,
  // Công tắc "Trên chợ" trên thẻ đầu xe (30/09/2026) — không bấm trong bộ này.
  useSetVehicleMarketplaceVisibility: () => ({ mutate: vi.fn(), isPending: false }),
}));
/** Số KM ở thẻ đầu xe + cột tóm tắt đọc tổng hợp 360 — test này không dựng QueryClient. */
vi.mock('@/features/vehicles/hooks/use-vehicle-summary', () => ({
  useVehicleSummary: () => ({ data: undefined, isLoading: false, isError: false }),
}));

vi.mock('@/services/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/api-client')>()),
  getErrorCode: (error: { code?: string }) => error?.code,
  getErrorMessage: () => 'Không thể lưu xe',
}));

/** Màn sửa đọc vài truy vấn chưa mock (giấy tờ của mục Giấy tờ…) — dựng provider, `retry` tắt. */
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App>
        <EditVehiclePage />
      </App>
    </QueryClientProvider>,
  );
}

const ownerWorkspace = {
  workspace: WORKSPACE.ACCOUNT,
  paths: workspacePaths(WORKSPACE.ACCOUNT),
  vehicles: workspaceVehiclePaths(WORKSPACE.ACCOUNT),
  isManage: false,
};

beforeEach(() => {
  plan.fullManage = true;
  permissions.allow = true;
  query.data = vehicle;
  query.isLoading = false;
  query.isError = false;
  query.error = undefined;
  query.refetch.mockReset();
  update.mutateAsync.mockReset();
  update.mutateAsync.mockResolvedValue(vehicle);
  update.isPending = false;
  update.isError = false;
  update.error = undefined;
  nav.push.mockReset();
  nav.replace.mockReset();
  url.search = '';
});
afterEach(cleanup);

/** Tên mục trên menu, bỏ phần số đếm ("5 thiếu", "2/3") ở cuối. */
function menuLabels(menu: HTMLElement): string[] {
  return within(menu)
    .getAllByRole('button')
    .map((button) => (button.textContent ?? '').replace(/(\d+ thiếu|\d+\/\d+)$/, ''));
}

describe('/manage/vehicles/[id]/edit - màn sửa xe (design 23731:37932)', () => {
  it('không có quyền thì không gọi API và hiện màn 403', () => {
    permissions.allow = false;
    renderPage();
    expect(query.requestedId).toBeUndefined();
    expect(screen.getByText('Không có quyền sửa xe')).toBeTruthy();
  });

  it('có loading và deleted/not-found state rõ ràng', () => {
    query.data = undefined;
    query.isLoading = true;
    const view = renderPage();
    expect(screen.getByText('Đang tải thông tin xe…')).toBeTruthy();
    view.unmount();
    query.isLoading = false;
    query.isError = true;
    query.error = { code: API_ERROR_CODE.NOT_FOUND };
    renderPage();
    expect(screen.getByText('Không tìm thấy xe')).toBeTruthy();
  });

  /**
   * Menu trái ba nhóm (03/11/2026). Không khối nào của bản 30/09 biến mất: giá + tự nhận chuyến
   * nằm trong "Dịch vụ & giá"; cọc, giao xe, thời gian chuẩn bị xe và điều khoản ở "Chính sách thuê".
   */
  it('menu trái ba nhóm, mục là nút có aria-current; số đếm giấy tờ x/3', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: vehicle.name })).toBeTruthy();
    expect(screen.getByDisplayValue(vehicle.name)).toBeTruthy();
    expect((screen.getByDisplayValue(vehicle.code) as HTMLInputElement).disabled).toBe(true);

    const menu = screen.getByRole('navigation', { name: 'Mục hồ sơ xe' });
    expect(
      within(menu).getByRole('button', { name: 'Thông tin chung' }).getAttribute('aria-current'),
    ).toBe('page');
    expect(menuLabels(menu)).toEqual([
      'Thông tin chung',
      'Hình ảnh',
      'Giấy tờ xe',
      'Dịch vụ & giá',
      'Chính sách thuê',
      'Bảo dưỡng & số KM',
      'Nguồn gốc & tài chính xe',
    ]);
    expect(within(menu).getByText('2/3')).toBeTruthy();
    expect(within(menu).getByRole('button', { name: /^Hình ảnh/ }).textContent).toMatch(/thiếu$/);
  });

  it('cột phải: tóm tắt xe + Hoàn tác · Lưu thay đổi (khoá khi chưa đổi gì)', () => {
    renderPage();
    const aside = screen.getByRole('complementary', { name: 'Tóm tắt xe và lưu thay đổi' });
    expect(within(aside).getByText('Ô tô · 5 chỗ')).toBeTruthy();
    expect(within(aside).getByText('Kiểm duyệt')).toBeTruthy();
    // Công tắc "Trên chợ" lên góc phải đầu trang (03/11/2026) — không còn trong cột phải.
    expect(within(aside).queryByText('Trên chợ')).toBeNull();
    expect(screen.getByText('Trên chợ')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Xem trang xe/ })).toBeTruthy();
    expect(within(aside).getByRole('progressbar', { name: 'Hoàn thiện' })).toBeTruthy();
    const save = within(aside).getByRole('button', { name: 'Lưu thay đổi' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it('bấm ảnh ở cột phải mở mục Hình ảnh', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Mở mục Hình ảnh' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(String(nav.replace.mock.calls[0]?.[0])).toContain('tab=media');
  });

  it.each([
    ['pricing', 'Dịch vụ & giá'],
    ['self-drive-optimization', 'Dịch vụ & giá'],
    ['with-driver-surcharges', 'Dịch vụ & giá'],
    // Hai mục của menu sáng 03/11 gộp thành "Chính sách thuê" — link cũ tới chúng vẫn mở đúng chỗ.
    ['conditions', 'Chính sách thuê'],
    ['handover', 'Chính sách thuê'],
    ['operations', 'Chính sách thuê'],
    ['handover-time', 'Chính sách thuê'],
    ['self-drive-terms', 'Chính sách thuê'],
    ['with-driver-terms', 'Chính sách thuê'],
  ])('link cũ ?tab=%s mở đúng mục "%s"', (tab, label) => {
    url.search = `tab=${tab}`;
    renderPage();
    const menu = screen.getByRole('navigation', { name: 'Mục hồ sơ xe' });
    expect(within(menu).getByRole('button', { name: label }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('?tab=with-driver-surcharges mở tab Có tài xế của mục Dịch vụ & giá', () => {
    url.search = 'tab=with-driver-surcharges';
    renderPage();
    expect(screen.getByRole('tab', { name: /Xe có tài xế/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('Dịch vụ & giá: giá nhúng thẳng trong tab dịch vụ - lỗi tải giá chỉ chặn phần giá', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Dịch vụ & giá' }));
    expect(await screen.findByText('Không tải được giá & chính sách')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Cho thuê tự lái' })).toBeTruthy();
  });

  it('Thông tin chung gom ô theo thẻ của design + hai thẻ design không vẽ', () => {
    renderPage();
    for (const title of [
      'Kiểu dáng xe',
      'Động cơ & nhiên liệu',
      'Tiện ích xe',
      'Thông số nâng cao',
      'Mô tả xe',
    ]) {
      expect(screen.getByRole('region', { name: title })).toBeTruthy();
    }
    // Trạng thái vận hành đổi ở cột phải — không có ô trong form.
    expect(screen.queryByText('Quản lý trạng thái')).toBeNull();
    // Thông số nâng cao là một thẻ trên cùng trang, không còn tab ngang.
    expect(screen.getByLabelText('Chiều dài (mm)')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Thông số kỹ thuật nâng cao/ })).toBeNull();
  });

  it('đổi "Vận hành" ở cột phải - lưu ngay, form không gửi operationStatus', async () => {
    renderPage();
    expect(screen.queryByLabelText('Trạng thái vận hành')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Trạng thái vận hành: Sẵn sàng/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Bảo dưỡng/ }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));
    expect(update.mutateAsync.mock.calls[0]![0]).toEqual({ operationStatus: 'maintenance' });

    fireEvent.change(screen.getByLabelText(/Tên xe/), { target: { value: 'Toyota Vios mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(2));
    expect(update.mutateAsync.mock.calls[1]![0]).not.toHaveProperty('operationStatus');
  });

  it('sửa thông số nâng cao rồi lưu: cùng MỘT lần lưu với form Thông tin', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Chiều dài (mm)'), { target: { value: '4500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));
    expect(update.mutateAsync.mock.calls[0]![0].lengthMm).toBe(4500);
  });

  it('Hoàn tác ở cột phải trả form về bản đã lưu', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Tên xe/), { target: { value: 'Sửa dở' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hoàn tác' }));
    await waitFor(() => expect(screen.getByDisplayValue(vehicle.name)).toBeTruthy());
    expect(update.mutateAsync).not.toHaveBeenCalled();
  });

  it('mục Thông tin chỉ gửi field thuộc mục, không ghi đè media, giá hay dịch vụ', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Tên xe/), { target: { value: 'Toyota Vios mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));
    const payload = update.mutateAsync.mock.calls[0]![0];
    expect(payload.name).toBe('Toyota Vios mới');
    expect(payload).not.toHaveProperty('images');
    expect(payload).not.toHaveProperty('mainImageUrl');
    expect(payload).not.toHaveProperty('weekdayPrice');
    expect(payload).not.toHaveProperty('sourceType');
    expect(payload).not.toHaveProperty('serviceTypes');
  });

  it('chuyển xe sang chi nhánh tỉnh khác PHẢI gửi branchId - vị trí công khai đổi thật', async () => {
    renderPage();
    fireEvent.mouseDown(screen.getByLabelText(/Chi nhánh giữ xe/));
    fireEvent.click(await screen.findByTitle('Chi nhánh Hà Nội · Hà Nội'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));
    expect(update.mutateAsync.mock.calls[0]![0].branchId).toBe('branch-2');
  });

  /** Khoá lỗi mất dữ liệu có thật: mô tả + tiện ích phải đi vào payload của mục này. */
  it('mô tả sửa ở mục Thông tin chung THỰC SỰ đi vào payload', async () => {
    renderPage();
    fireEvent.change(screen.getByRole('textbox', { name: 'Mô tả xe' }), {
      target: { value: 'Mô tả mới' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));
    const payload = update.mutateAsync.mock.calls[0]![0];
    expect(payload.description).toBe('Mô tả mới');
    expect(payload.features).toEqual(vehicle.features);
    expect(payload).not.toHaveProperty('mainImageUrl');
    expect(payload).not.toHaveProperty('media');
  });

  it('mục Hình ảnh: không dựng form thông tin; nút lưu ở cột phải chờ có thay đổi ảnh', async () => {
    renderPage();
    expect(screen.getByLabelText(/Tên xe/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Hình ảnh/ }));
    await waitFor(() => expect(screen.queryByLabelText(/Tên xe/)).toBeNull());
    expect(
      (screen.getByRole('button', { name: 'Lưu thay đổi' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('Nguồn gốc & tài chính: sửa dở rồi chuyển mục phải qua xác nhận bỏ thay đổi', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Nguồn gốc & tài chính xe' }));
    fireEvent.change(await screen.findByLabelText(/Nơi mua/), {
      target: { value: 'Toyota Đông Sài Gòn' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thông tin chung' }));
    expect(await screen.findByText('Bỏ các thay đổi chưa lưu?')).toBeTruthy();
  });

  it('không cho đổi mục làm mất dữ liệu chưa lưu', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Tên xe/), { target: { value: 'Chưa lưu' } });
    fireEvent.click(screen.getByRole('button', { name: /^Hình ảnh/ }));
    expect(await screen.findByText('Bỏ các thay đổi chưa lưu?')).toBeTruthy();
    expect(screen.getByDisplayValue('Chưa lưu')).toBeTruthy();
  });

  /*
   * ADR 0030: xe đã lên chợ thì CĂN CƯỚC của nó (biển số · hộp số · nhiên liệu · năm sản xuất)
   * bị khoá ngay tại ô nhập. Server vẫn là chốt chặn thật (`VEHICLE_FIELD_LOCKED`).
   */
  it('xe công khai: ô biển số bị khoá và nói rõ lý do', () => {
    renderPage();
    const plate = screen.getByLabelText(/Biển số xe/);
    expect(plate.hasAttribute('disabled')).toBe(true);
    expect(screen.getAllByText(/Đã khoá vì xe đang trên chợ/).length).toBeGreaterThan(0);
  });

  it('xe công khai: sửa trường khác lưu thẳng, không hộp xác nhận nào', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/^Màu sắc/), { target: { value: 'Xanh rêu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Xác nhận thay đổi nhạy cảm')).toBeNull();
  });

  /*
   * Lỗi có thật từ staging: mức tiêu thụ `1.233` chỉ hiện toast "Dữ liệu gửi lên không hợp lệ".
   * Cột là `Decimal(6, 2)` — yup phải báo ngay dưới ô.
   */
  it('mức tiêu thụ quá 2 chữ số thập phân: báo NGAY dưới ô, không gọi API', async () => {
    renderPage();
    const field = screen.getByLabelText('Trong đô thị');
    fireEvent.change(field, { target: { value: '1.233' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(await screen.findByText(/2 chữ số thập phân/)).toBeTruthy();
    expect(update.mutateAsync).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: '1.23' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));
  });

  it('server trả lỗi cấp trường: gắn vào ĐÚNG ô', async () => {
    const { ApiClientError } = await import('@/services/api-client');
    update.mutateAsync.mockRejectedValue(
      new ApiClientError({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Dữ liệu gửi lên không hợp lệ',
        status: 400,
        details: [{ field: 'engineDisplacementCc', constraints: ['must be an integer number'] }],
      }),
    );
    renderPage();
    fireEvent.change(screen.getByLabelText(/Tên xe/), { target: { value: 'Toyota Vios mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));

    const field = await screen.findByLabelText('Dung tích động cơ (cc)');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(
      await screen.findByText('Giá trị này chưa hợp lệ. Kiểm tra lại giúp bạn nhé.'),
    ).toBeTruthy();
  });
});

/**
 * Tuyến hoa hồng (sổ cái §3.6 E24): CÙNG màn sửa, không còn không gian "Quản lý xe" riêng. Chủ xe
 * có "Lịch sử chuyến", không có nhóm Vận hành nâng cao (năng lực gói), sửa đúng bộ ô cũ của họ và
 * địa chỉ xe ngay trong Thông tin chung.
 */
describe('/vehicles/[id]/edit - chủ xe tuyến hoa hồng', () => {
  function renderOwner() {
    plan.fullManage = false;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <App>
          <WorkspaceScope value={ownerWorkspace}>
            <EditVehiclePage />
          </WorkspaceScope>
        </App>
      </QueryClientProvider>,
    );
  }

  it('menu có Lịch sử chuyến, không có nhóm nâng cao; không có ô tên/chi nhánh', () => {
    renderOwner();
    const menu = screen.getByRole('navigation', { name: 'Mục hồ sơ xe' });
    expect(menuLabels(menu)).toEqual([
      'Thông tin chung',
      'Hình ảnh',
      'Giấy tờ xe',
      'Lịch sử chuyến',
      'Dịch vụ & giá',
      'Chính sách thuê',
    ]);
    expect(screen.queryByLabelText(/Tên xe/)).toBeNull();
    expect(screen.queryByLabelText(/Chi nhánh giữ xe/)).toBeNull();
    expect(screen.getByRole('region', { name: 'Địa chỉ xe hiện tại' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Thông số nâng cao' })).toBeNull();
  });

  it('lưu chỉ gửi đúng bộ ô của chủ xe - không gửi tên, chi nhánh, kích thước', async () => {
    renderOwner();
    fireEvent.change(screen.getByLabelText(/^Màu sắc/), { target: { value: 'Xanh rêu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));
    const payload = update.mutateAsync.mock.calls[0]![0];
    expect(payload.color).toBe('Xanh rêu');
    expect(payload).not.toHaveProperty('name');
    expect(payload).not.toHaveProperty('branchId');
    expect(payload).not.toHaveProperty('lengthMm');
  });

  it('link cũ ?tab=source của tuyến gói rơi về Thông tin chung', () => {
    url.search = 'tab=source';
    renderOwner();
    const menu = screen.getByRole('navigation', { name: 'Mục hồ sơ xe' });
    expect(
      within(menu).getByRole('button', { name: 'Thông tin chung' }).getAttribute('aria-current'),
    ).toBe('page');
  });
});

/**
 * CÙNG trang, dựng trong phiên hỗ trợ gian hàng tuyến gói (ADR 0050): trang tự thu về các mục
 * phiên được mở và khoá các ô "ghim" nhờ đọc ngữ cảnh phiên.
 */
describe('/manage/vehicles/[id]/edit - trong phiên hỗ trợ của nhân sự nền tảng', () => {
  function renderInSupport() {
    const context = supportContextFixture({ workspace: SUPPORT_WORKSPACE.MANAGE });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <App>
          <SupportSessionScope session={supportSessionOf(context)}>
            <WorkspaceScope value={supportWorkspaceValue(context)}>
              <EditVehiclePage />
            </WorkspaceScope>
          </SupportSessionScope>
        </App>
      </QueryClientProvider>,
    );
  }

  function fieldDisabled(label: string): boolean {
    // Chỉ tìm NHÃN Ô form — cột tóm tắt bên phải cũng có dòng "Loại xe" (chỉ đọc).
    const item = screen
      .getAllByText(label)
      .map((node) => node.closest('.ant-form-item'))
      .find(Boolean);
    return Boolean(item?.querySelector('.ant-select-disabled'));
  }

  it('chỉ các mục phiên được mở - giá, điều kiện, nguồn xe, giấy tờ, vận hành không có mặt', () => {
    renderInSupport();
    // Suy từ capability của phiên (`VEHICLE_VIEW` + `MAINTENANCE_VIEW`), không từ hình thái menu.
    const menu = screen.getByRole('navigation', { name: 'Mục hồ sơ xe' });
    expect(menuLabels(menu)).toEqual(['Thông tin chung', 'Hình ảnh', 'Bảo dưỡng & số KM']);
  });

  it('chi nhánh, loại xe, trạng thái vận hành bị khoá; tên xe vẫn sửa được', () => {
    renderInSupport();
    expect(fieldDisabled('Chi nhánh giữ xe')).toBe(true);
    expect(fieldDisabled('Loại xe')).toBe(true);
    expect(screen.queryByRole('button', { name: /Trạng thái vận hành: .* bấm để đổi/ })).toBeNull();
    expect((screen.getByDisplayValue(vehicle.name) as HTMLInputElement).disabled).toBe(false);
  });

  it('đổi mục ghi URL của PHIÊN, không nhảy sang /manage/vehicles', async () => {
    renderInSupport();
    fireEvent.click(screen.getByRole('button', { name: /^Hình ảnh/ }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(nav.replace.mock.calls[0]?.[0]).toBe(
      `${adminTenantSupportPath.vehicleEdit(CONTEXT_A, 'vehicle-1')}?tab=media`,
    );
  });
});
