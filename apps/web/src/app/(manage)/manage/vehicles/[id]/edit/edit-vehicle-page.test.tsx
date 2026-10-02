import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ERROR_CODE, PERMISSION, SUPPORT_WORKSPACE } from '@xeprime/types';
import { adminTenantSupportPath } from '@/constants/routes';
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
vi.mock('@/hooks/use-feature', () => ({
  useFeature: () => ({ state: 'enabled', canWrite: true, isVisible: true, planEndsAt: null }),
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
  validateDocumentFile: () => null,
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

/** Chi nhánh của xe — bộ chọn ở tab Thông tin đọc danh sách này. */
vi.mock('@/features/branches/hooks/use-branches', () => ({
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

function renderPage() {
  return render(
    <App>
      <EditVehiclePage />
    </App>,
  );
}

/**
 * Mục vận hành dựng section của khu tài khoản, và chúng tự gọi TanStack Query (thiết lập dịch
 * vụ, khung giờ). Ca nào mở thẳng các mục đó thì dựng provider — không gọi mạng nào vì `retry`
 * tắt và `fetch` không có máy chủ, section chỉ đứng ở trạng thái đang tải.
 */
function renderPageWithQuery() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App>
        <EditVehiclePage />
      </App>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
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

describe('/manage/vehicles/[id]/edit — Wave 3 tab workspace', () => {
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
   * MENU TRÁI 10 mục (30/09/2026) — mục là NÚT, không còn `role=tab`.
   *
   * Khoá lại rằng không khối nào của develop BIẾN MẤT: bảy tab cũ + năm khối trong `Collapse`
   * của tab "Vận hành & điều kiện thuê" đều còn đường tới — thủ tục cho thuê nằm chung mục
   * "Nhận chuyến & thủ tục" với tối ưu nhận chuyến của cùng dịch vụ.
   */
  it('menu trái có đủ 10 mục, xếp theo nhóm dịch vụ', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: vehicle.name })).toBeTruthy();
    expect(screen.getByDisplayValue(vehicle.name)).toBeTruthy();
    expect((screen.getByDisplayValue(vehicle.code) as HTMLInputElement).disabled).toBe(true);

    const menu = screen.getByRole('navigation', { name: 'Mục của xe' });
    // Mục đang mở nói ra bằng `aria-current`, không phải `aria-selected` của tab.
    expect(
      within(menu)
        .getByRole('button', { name: 'Thông tin xe & tiện ích' })
        .getAttribute('aria-current'),
    ).toBe('page');
    expect(
      within(menu)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([
      'Thông tin xe & tiện ích',
      'Hình ảnh',
      'Giấy tờ xe',
      'Giá & chính sách',
      'Thời gian giao nhận',
      'Nhận chuyến & thủ tục',
      'Nhận chuyến & thủ tục',
      'Phụ phí',
      // Nhóm dài hạn không có mục — chỉ công tắc và lời nhắc dẫn về Giá & chính sách.
      'Giá thuê tháng nằm ở Giá & chính sách',
      'Nguồn xe & tài chính',
      'Bảo dưỡng & KM',
    ]);
  });

  it('công tắc dịch vụ trên tiêu đề nhóm phản ánh dịch vụ của xe và ghi đủ mảng serviceTypes', async () => {
    renderPage();
    const selfDrive = screen.getByRole('switch', { name: 'Bật hoặc tắt dịch vụ Tự lái' });
    const withDriver = screen.getByRole('switch', { name: 'Bật hoặc tắt dịch vụ Có tài xế' });
    const longTerm = screen.getByRole('switch', { name: 'Bật hoặc tắt dịch vụ Thuê dài hạn' });
    expect(selfDrive.getAttribute('aria-checked')).toBe('true');
    // Dịch vụ cuối cùng của xe không tắt được — xe phải giữ ít nhất một dịch vụ.
    expect((selfDrive as HTMLButtonElement).disabled).toBe(true);
    expect(withDriver.getAttribute('aria-checked')).toBe('false');
    expect(longTerm.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(withDriver);
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));
    expect(update.mutateAsync.mock.calls[0]![0]).toEqual({
      serviceTypes: ['self_drive', 'with_driver'],
    });
  });

  it('Loại dịch vụ là nhãn LƯU NGAY — lưu form Thông tin KHÔNG gửi serviceTypes', async () => {
    renderPage();
    expect(screen.getByRole('group', { name: 'Loại dịch vụ' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Tên xe/), { target: { value: 'Toyota Vios mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));
    expect(update.mutateAsync.mock.calls[0]![0]).not.toHaveProperty('serviceTypes');
  });

  it('mục của dịch vụ đang tắt: nói ra và mời bật qua CÙNG công tắc', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Phụ phí' }));
    expect(await screen.findByText('Dịch vụ Có tài xế đang tắt')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bật Có tài xế' }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));
    expect(update.mutateAsync.mock.calls[0]![0]).toEqual({
      serviceTypes: ['self_drive', 'with_driver'],
    });
  });

  it.each([
    // Tab `operations` của develop mở khối đầu tiên của nó.
    ['operations', 'Thời gian giao nhận', 0],
    // Thủ tục tự lái nằm chung mục với tối ưu nhận chuyến tự lái (mục đầu trong hai mục cùng tên).
    ['self-drive-terms', 'Nhận chuyến & thủ tục', 0],
    ['with-driver-terms', 'Nhận chuyến & thủ tục', 1],
  ])('link cũ ?tab=%s mở đúng mục "%s"', (tab, label, index) => {
    url.search = `tab=${tab}`;
    renderPageWithQuery();
    const menu = screen.getByRole('navigation', { name: 'Mục của xe' });
    expect(
      within(menu).getAllByRole('button', { name: label })[index]!.getAttribute('aria-current'),
    ).toBe('page');
  });

  it('?tab=pricing vẫn mở màn Giá & chính sách (một màn, một nút Lưu như develop)', async () => {
    url.search = 'tab=pricing';
    renderPage();
    expect(await screen.findByText('Không tải được giá & chính sách')).toBeTruthy();
  });

  it('Giá & chính sách được nhúng trực tiếp trong tab, không qua màn trung gian', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Giá & chính sách' }));
    expect(await screen.findByText('Không tải được giá & chính sách')).toBeTruthy();
    expect(screen.queryByText('Mở Giá & chính sách')).toBeNull();
  });

  /**
   * Mục Thông tin xe có HAI tab ngang (30/09/2026): "Thông tin xe cơ bản" gom các ô theo nhóm
   * card, "Thông số kỹ thuật nâng cao" thay vùng thu gọn cũ. Cùng một form, một nút Lưu.
   */
  it('tab cơ bản gom ô theo nhóm card; tab nâng cao là tab ngang riêng', () => {
    renderPage();
    const basic = screen.getByRole('tab', { name: /Thông tin xe cơ bản/ });
    expect(basic.getAttribute('aria-selected')).toBe('true');
    for (const title of [
      'Thông tin chung',
      'Nhận dạng xe',
      'Động cơ & nhiên liệu',
      'Tiện ích & mô tả',
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    // Trạng thái vận hành đổi trên chip thẻ đầu xe — không còn card/ô trong form.
    expect(screen.queryByText('Quản lý trạng thái')).toBeNull();
    expect(screen.queryByLabelText('Chiều dài (mm)')).toBeNull();
  });

  /**
   * Thẻ đầu xe + cột xem nhanh (30/09/2026): chỉ đọc. Nút "Chỉnh sửa" ảnh dẫn tới mục Hình
   * ảnh — không có lối ghi ảnh thứ hai ở đây.
   */
  it('thẻ đầu xe + cột tóm tắt; "Chỉnh sửa" ảnh mở mục Hình ảnh', async () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: vehicle.name })).toBeTruthy();
    expect(screen.getByText('Thông tin tóm tắt')).toBeTruthy();
    expect(screen.getByText('5 chỗ')).toBeTruthy();
    // Xe đã duyệt: thông báo khoá trường nằm ở cột tóm tắt.
    expect(screen.getByText(/^Xe đang hiển thị trên chợ: biển số/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa hình ảnh xe' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(String(nav.replace.mock.calls[0]?.[0])).toContain('tab=media');
  });

  /**
   * Trạng thái vận hành đổi TẠI CHỖ trên chip của thẻ đầu xe (30/09/2026) — lưu ngay, chỉ gửi
   * `operationStatus`. Form Thông tin không còn ô đó và không gửi nó (không ghi đè lần đổi này).
   */
  it('bấm chip "Vận hành" đổi trạng thái — lưu ngay, form không gửi operationStatus', async () => {
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
    fireEvent.click(screen.getByRole('tab', { name: /Thông số kỹ thuật nâng cao/ }));
    expect(await screen.findByText('Kích thước & Trọng lượng')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Chiều dài (mm)'), { target: { value: '4500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));
    expect(update.mutateAsync.mock.calls[0]![0].lengthMm).toBe(4500);
  });

  it('lỗi ở tab nâng cao khi đang đứng tab cơ bản: tự mở đúng tab có lỗi', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Thông số kỹ thuật nâng cao/ }));
    fireEvent.change(await screen.findByLabelText('Trong đô thị'), { target: { value: '1.233' } });
    fireEvent.click(screen.getByRole('tab', { name: /Thông tin xe cơ bản/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() =>
      expect(
        screen
          .getByRole('tab', { name: /Thông số kỹ thuật nâng cao/ })
          .getAttribute('aria-selected'),
      ).toBe('true'),
    );
    expect(await screen.findByText(/2 chữ số thập phân/)).toBeTruthy();
    expect(update.mutateAsync).not.toHaveBeenCalled();
  });

  it('tab Thông tin chỉ gửi field thuộc tab, không ghi đè media hay giá', async () => {
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
  });

  it('chuyển xe sang chi nhánh tỉnh khác PHẢI gửi branchId — vị trí công khai đổi thật', async () => {
    renderPage();
    fireEvent.mouseDown(screen.getByLabelText(/Chi nhánh giữ xe/));
    fireEvent.click(await screen.findByTitle('Chi nhánh Hà Nội · Hà Nội'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));
    expect(update.mutateAsync.mock.calls[0]![0].branchId).toBe('branch-2');
  });

  /**
   * Tiện ích + mô tả dời sang mục "Thông tin xe & tiện ích" (30/09/2026) — và PHẢI vào payload.
   *
   * Đây là ca khoá lỗi mất dữ liệu có thật trong đợt đổi cấu trúc: hai ô đã dời sang mục này
   * nhưng hàm lưu của mục (`informationValuesToInput`) chưa mang chúng theo, nên form báo lưu
   * thành công trong khi mô tả không đổi.
   */
  it('mô tả sửa ở mục Thông tin xe & tiện ích THỰC SỰ đi vào payload', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Mô tả/), { target: { value: 'Mô tả mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));
    const payload = update.mutateAsync.mock.calls[0]![0];
    expect(payload.description).toBe('Mô tả mới');
    expect(payload.features).toEqual(vehicle.features);
    // Vẫn KHÔNG mang ảnh: ảnh có mục và đường lưu riêng.
    expect(payload).not.toHaveProperty('mainImageUrl');
    expect(payload).not.toHaveProperty('media');
  });

  /**
   * Mục ảnh dùng NGUYÊN `ImagesSection` của khu tài khoản (30/09/2026), không còn là một phần
   * form RHF. Hành vi xoá/thay/lưu ảnh (gồm ADR 0030 — xoá ảnh đại diện gửi `null`) được khoá
   * ở bộ test của chính section đó (`vehicle-manage-sections.test.tsx`), nơi nó sống.
   *
   * Ở đây khoá ranh giới: mở mục ảnh thì form "Thông tin xe" biến mất — hai đường lưu không bao
   * giờ cùng hiện trên một màn.
   */
  it('mục Hình ảnh dùng section ảnh dùng chung, không dựng form thông tin', async () => {
    renderPage();
    expect(screen.getByLabelText(/Tên xe/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hình ảnh' }));
    await waitFor(() => expect(screen.queryByLabelText(/Tên xe/)).toBeNull());
  });

  it('tab Nguồn xe (Wave 4): sửa dở rồi chuyển tab phải qua xác nhận bỏ thay đổi', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Nguồn xe & tài chính' }));
    fireEvent.change(await screen.findByLabelText(/Nơi mua/), {
      target: { value: 'Toyota Đông Sài Gòn' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thông tin xe & tiện ích' }));
    expect(await screen.findByText('Bỏ các thay đổi chưa lưu?')).toBeTruthy();
  });

  it('không cho đổi tab làm mất dữ liệu chưa lưu', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Tên xe/), { target: { value: 'Chưa lưu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hình ảnh' }));
    expect(await screen.findByText('Bỏ các thay đổi chưa lưu?')).toBeTruthy();
    expect(screen.getByDisplayValue('Chưa lưu')).toBeTruthy();
  });

  /*
   * ADR 0030: xe đã lên chợ thì CĂN CƯỚC của nó (biển số · hộp số · nhiên liệu · năm sản xuất)
   * bị khoá ngay tại ô nhập, thay cho luật cũ "sửa được nhưng phải duyệt lại". Server vẫn là
   * chốt chặn thật (`VEHICLE_FIELD_LOCKED`); ô khoá chỉ để người dùng khỏi gõ xong mới biết.
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
   * Lỗi có thật từ staging: nhập mức tiêu thụ `1.233` thì Lưu chỉ hiện toast "Dữ liệu gửi lên
   * không hợp lệ" — không ô nào đỏ, người dùng không biết sai ở đâu (nhập `1.23` lại lưu được).
   * Cột là `Decimal(6, 2)` và DTO có `maxDecimalPlaces: 2`, nhưng yup thì không, nên giá trị đi
   * lọt xuống server. Hai test dưới khoá cả hai lớp phòng thủ.
   */
  it('mức tiêu thụ quá 2 chữ số thập phân: báo NGAY dưới ô, không gọi API', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Thông số kỹ thuật nâng cao/ }));
    const field = await screen.findByLabelText('Trong đô thị');
    fireEvent.change(field, { target: { value: '1.233' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(await screen.findByText(/2 chữ số thập phân/)).toBeTruthy();
    expect(update.mutateAsync).not.toHaveBeenCalled();

    // …và 1.23 thì đi tiếp bình thường.
    fireEvent.change(field, { target: { value: '1.23' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));
  });

  it('server trả lỗi cấp trường: gắn vào ĐÚNG ô, ở đúng tab đang chứa nó', async () => {
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

    // Dung tích động cơ ở khối năng lượng của tab cơ bản — lỗi phải hiện ngay tại ô đó.
    const field = await screen.findByLabelText('Dung tích động cơ (cc)');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(
      await screen.findByText('Giá trị này chưa hợp lệ. Kiểm tra lại giúp bạn nhé.'),
    ).toBeTruthy();
  });
});

/**
 * CÙNG trang, dựng trong phiên hỗ trợ gian hàng tuyến gói (ADR 0050): không có bản admin nào của
 * màn này. Trang tự thu về các tab của Đợt 1 và khoá các ô "ghim" nhờ đọc ngữ cảnh phiên.
 */
describe('/manage/vehicles/[id]/edit — trong phiên hỗ trợ của nhân sự nền tảng', () => {
  function renderInSupport() {
    const context = supportContextFixture({ workspace: SUPPORT_WORKSPACE.MANAGE });
    return render(
      <App>
        <SupportSessionScope session={supportSessionOf(context)}>
          <WorkspaceScope value={supportWorkspaceValue(context)}>
            <EditVehiclePage />
          </WorkspaceScope>
        </SupportSessionScope>
      </App>,
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

  it('chỉ còn ba mục của Đợt 1 — giá, nguồn xe, giấy tờ, vận hành không có mặt', () => {
    renderInSupport();
    /*
     * Đọc trong CHÍNH thanh menu, không quét cả trang: vùng thu gọn "thông số nâng cao" và các
     * nút hành động cũng là `button`, và một phép đếm toàn trang sẽ gộp chúng vào.
     *
     * Ba mục này suy ra từ capability của phiên (`supportContextFixture` bộ MANAGE cấp
     * `VEHICLE_VIEW` + `MAINTENANCE_VIEW`), KHÔNG phải từ hình thái menu — nên đổi tab ngang
     * thành menu trái không được làm danh sách này dài hay ngắn đi một mục nào.
     */
    const menu = screen.getByRole('navigation', { name: 'Mục của xe' });
    const items = within(menu)
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(items).toEqual(['Thông tin xe & tiện ích', 'Hình ảnh', 'Bảo dưỡng & KM']);
  });

  it('chi nhánh, loại xe, trạng thái vận hành bị khoá; không có công tắc dịch vụ; tên xe vẫn sửa được', () => {
    renderInSupport();
    expect(fieldDisabled('Chi nhánh giữ xe')).toBe(true);
    expect(fieldDisabled('Loại xe')).toBe(true);
    // Dịch vụ không còn là ô của form, và phiên hỗ trợ không có công tắc dịch vụ nào.
    // Phiên hỗ trợ không bật/tắt dịch vụ thay chủ xe — nhãn có mặt nhưng bấm không ghi gì.
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Loại dịch vụ' })).getByText('Có tài xế'),
    );
    expect(update.mutateAsync).not.toHaveBeenCalled();
    expect(screen.queryAllByRole('switch', { name: /Bật hoặc tắt dịch vụ/ })).toHaveLength(0);
    // Trạng thái vận hành: phiên thiếu capability riêng → chip TĨNH, không có nút đổi.
    expect(screen.queryByRole('button', { name: /Trạng thái vận hành: .* bấm để đổi/ })).toBeNull();
    expect((screen.getByDisplayValue(vehicle.name) as HTMLInputElement).disabled).toBe(false);
  });

  it('đổi tab ghi URL của PHIÊN, không nhảy sang /manage/vehicles', async () => {
    renderInSupport();
    fireEvent.click(screen.getByRole('button', { name: 'Hình ảnh' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(nav.replace.mock.calls[0]?.[0]).toBe(
      `${adminTenantSupportPath.vehicleEdit(CONTEXT_A, 'vehicle-1')}?tab=media`,
    );
  });
});
