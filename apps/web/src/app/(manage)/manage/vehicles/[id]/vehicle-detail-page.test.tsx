import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ERROR_CODE, PERMISSION, type Permission } from '@xeprime/types';

import { WORKSPACE, workspacePaths, workspaceVehiclePaths } from '@/constants/routes';
import { WorkspaceScope } from '@/hooks/use-workspace';
import { ApiClientError } from '@/services/api-client';
import type { Vehicle360Summary, VehicleDetail } from '@/features/vehicles/types';
import { getLinkByText, queryLinkByText } from '@/test-utils/queries';

import VehicleDetailPage from './page';

/**
 * `/manage/vehicles/[id]` — Hồ sơ xe (Figma Partner-XePrime section `23672:25621`, 03/11/2026;
 * quyết định ở `docs/design/09_PARTNER_REDESIGN.md` §3.6).
 *
 * Khẳng định trên hợp đồng: quyền nào mở hành động nào, khối nào hiện từ dữ liệu nào, tổng hợp
 * hỏng thì hồ sơ còn đứng không. KHÔNG khẳng định trên bố cục cột (đó là chuyện của CSS).
 */

/* ------------------------------------------------------------------ hạ tầng mock */

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

/**
 * Trục NĂNG LỰC theo gói — mặc định gian hàng đủ cờ (tuyến GÓI).
 *
 * Hai lý do phải có ở đây:
 *  1. `useVehicleCapabilities` gọi `useFeature`, thứ đọc `/auth/me` qua TanStack Query. Test này
 *     mock `use-permissions` nên không dựng `QueryClientProvider` — thiếu mock này thì component
 *     chết vì hạ tầng, không vì thứ đang kiểm.
 *  2. Từ 29/09/2026 khối TIỀN và thẻ BẢO DƯỠNG gác bằng quyền **và** cờ gói, nên bộ test phải
 *     nói rõ gian hàng đang ở tuyến nào — xem `describe('tuyến hoa hồng …')` ở cuối file.
 */
const plan = vi.hoisted(() => ({ hasFullManage: true }));

vi.mock('@/hooks/use-feature', () => ({
  useFeature: () => ({
    state: plan.hasFullManage ? 'enabled' : 'hidden',
    canWrite: plan.hasFullManage,
    isVisible: plan.hasFullManage,
    planEndsAt: null,
  }),
  useFeatureStates: () => ({}),
  usePlanEndsAt: () => null,
}));

// Danh mục lọc (hãng/kiểu dáng/nhiên liệu/tiện ích) tới từ API — test dùng bản cố định.
vi.mock('@/features/catalog/use-catalog', async () =>
  (await import('@/features/catalog/test-catalog')).catalogModuleMock(),
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useParams: () => ({ id: 'v1' }),
  usePathname: () => '/manage/vehicles/v1',
  useSearchParams: () => new URLSearchParams(),
}));

const detail = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  error: undefined as unknown,
  refetch: vi.fn(),
  requestedId: undefined as string | undefined,
}));

vi.mock('@/features/vehicles/hooks/use-vehicle', () => ({
  useVehicle: (id: string | undefined) => {
    detail.requestedId = id;
    return detail;
  },
}));

/** Tổng hợp 360 — mock ở tầng hook để không cần QueryClientProvider trong test trang. */
const summary = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  requestedId: undefined as string | undefined,
}));

vi.mock('@/features/vehicles/hooks/use-vehicle-summary', () => ({
  useVehicleSummary: (id: string | undefined) => {
    summary.requestedId = id;
    return summary;
  },
}));

// Tóm tắt nguồn xe (Wave 4) trong Hồ sơ 360 — mặc định "chưa khai báo hồ sơ chi tiết".
const sourceQuery = vi.hoisted(() => ({
  data: { sourceType: 'owned', detail: null } as unknown,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));

vi.mock('@/features/vehicles/hooks/use-vehicle-source', () => ({
  useVehicleSource: () => sourceQuery,
  useSaveVehicleSource: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

/**
 * Thẻ Bảo dưỡng & KM (Wave 6) trên hồ sơ 360 gọi TanStack Query — test này không dựng provider.
 * Trả hồ sơ RỖNG (mọi số là null) để kiểm đúng hành vi "chưa có dữ liệu thì nói chưa có".
 */
const emptyMaintenanceProfile = vi.hoisted(() => ({
  currentOdometerKm: null,
  currentOdometerSource: null,
  currentOdometerAt: null,
  currentOdometerRefLabel: null,
  oilChangeIntervalKm: null,
  lastServiceKm: null,
  lastServiceAt: null,
  notes: null,
  nextMaintenanceKm: null,
  remainingKm: null,
  usedKm: null,
  usedPercent: null,
  dueStatus: 'unknown',
  dueSoonKm: 500,
  rowVersion: 0,
  updatedAt: '2026-08-01T00:00:00.000Z',
}));
vi.mock('@/features/vehicle-maintenance/hooks', () => ({
  useMaintenanceProfile: () => ({
    data: emptyMaintenanceProfile,
    isLoading: false,
    isError: false,
  }),
  useMaintenanceRecords: () => ({ data: [], isLoading: false, isError: false }),
}));

const deleteVehicle = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const submitPublic = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

const setVisibility = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('@/features/vehicles/hooks/use-vehicle-mutations', () => ({
  useDeleteVehicle: () => deleteVehicle,
  useSubmitVehiclePublic: () => submitPublic,
  // Công tắc hiển thị trên chợ (ADR 0048) — hành vi riêng của nó ở
  // `marketplace-visibility-switch.test.tsx`; ở đây chỉ cần trang dựng được.
  useSetVehicleMarketplaceVisibility: () => setVisibility,
  // Sửa listing chỉ có trong phiên hỗ trợ (ADR 0050 §13) — ở đây trang của chủ xe, không dùng tới.
  useRepairVehicleListing: () => ({ mutate: vi.fn(), isPending: false }),
}));

const perms = vi.hoisted(() => ({ granted: new Set<string>() }));

/*
 * Thiết lập dịch vụ — thẻ "Tối ưu nhận chuyến" đọc nó để vẽ công tắc tự nhận ngay trên thẻ
 * (03/11/2026). Mặc định: tự lái đang bật, có tài xế chưa có tài xế nào nhận lượt.
 */
const serviceSettings = vi.hoisted(() => ({ patch: vi.fn() }));
vi.mock('@/features/vehicle-manage/hooks', () => ({
  useVehicleServiceSettings: () => ({
    isLoading: false,
    isError: false,
    data: [
      {
        serviceType: 'self_drive',
        autoAcceptEnabled: true,
        updatedAt: 'a',
        withDriverAutoAccept: null,
      },
      {
        serviceType: 'with_driver',
        autoAcceptEnabled: false,
        updatedAt: 'b',
        withDriverAutoAccept: { available: false, activeDrivers: 0, driversFeatureEnabled: true },
      },
    ],
  }),
  usePatchVehicleServiceSetting: () => ({ mutateAsync: serviceSettings.patch, isPending: false }),
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.has(p),
    hasAny: (...ps: string[]) => ps.some((p) => perms.granted.has(p)),
    isLoading: false,
  }),
}));

/**
 * Khối tiền của xe có bề mặt và test riêng (`FinanceEntityPanel`); ở đây chỉ cần chứng minh nó
 * được dựng hay không theo quyền. Mock luôn tránh phải bọc `QueryClientProvider` cho test trang.
 */
vi.mock('@/features/finance/components/FinanceEntityPanel', () => ({
  FinanceEntityPanel: ({ scope }: { scope: { vehicleId?: string } }) => (
    <div data-testid="vehicle-finance-panel">{scope.vehicleId}</div>
  ),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

/* ------------------------------------------------------------------ dữ liệu mẫu */

function vehicle(over: Partial<VehicleDetail> = {}): VehicleDetail {
  return {
    id: 'v1',
    code: 'XE-014',
    name: 'Ford Transit 2021',
    plateNumber: '51B-802.46',
    vehicleType: 'car',
    serviceTypes: ['self_drive'],
    operationStatus: 'available',
    publicStatus: 'draft',
    // Trục thứ ba (ADR 0048): xe nháp thì chưa qua cổng duyệt, công tắc của chủ xe bật sẵn.
    marketplaceEnabled: true,
    isMarketplaceVisible: false,
    marketplaceVisibilityReason: 'not_approved',
    brand: 'Ford',
    model: 'Transit',
    color: 'Trắng',
    fuelType: 'diesel',
    bodyType: 'van',
    manufactureYear: 2021,
    seatCount: 16,
    weekdayPrice: '1800000',
    weekendPrice: '2000000',
    hourlyPrice: null,
    deliveryEnabled: true,
    noCollateral: false,
    discountPercent: null,
    description: 'Xe 16 chỗ đời 2021.',
    transmission: 'manual',
    fuelConsumptionCombined: '9.50',
    mainImageUrl: 'https://cdn.test/1.jpg',
    // Đủ năm góc ảnh bắt buộc của ô tô (07/10/2026) — điều kiện lên chợ hỏi GÓC, không hỏi số lượng.
    media: [
      { url: 'https://cdn.test/1.jpg', type: 'front' },
      { url: 'https://cdn.test/2.jpg', type: 'rear' },
      { url: 'https://cdn.test/3.jpg', type: 'left' },
      { url: 'https://cdn.test/4.jpg', type: 'right' },
      { url: 'https://cdn.test/5.jpg', type: 'interior' },
    ],
    /*
     * Chi nhánh CÓ TỈNH: từ ADR 0036 "chi nhánh chưa có tỉnh" là một mục trong checklist chứ
     * không còn là một mã lỗi rời ở backend. Xe fixture đủ điều kiện thì phải đủ cả mục này.
     */
    branch: { id: 'b1', name: 'Chi nhánh chính', provinceCode: '79', provinceName: 'Hồ Chí Minh' },
    features: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  } as VehicleDetail;
}

/**
 * Tổng hợp KHÔNG có cảnh báo vận hành nào — để test khoá riêng phần "việc lên chợ" mà không bị
 * một cảnh báo bảo dưỡng của fixture khác chen vào.
 */
function emptyAlertSummary(): Vehicle360Summary {
  return {
    stats: { vehicleId: 'v1', activeBookings: 0, completedBookings: 0 },
    currentOdometerKm: null,
    alerts: [],
  } as unknown as Vehicle360Summary;
}

function summaryOf(over: Partial<Vehicle360Summary> = {}): Vehicle360Summary {
  return {
    stats: {
      vehicleId: 'v1',
      activeBookings: 1,
      completedBookings: 12,
      totalIncome: '12750000',
      totalExpense: '3200000',
    },
    upcomingBookings: [
      {
        id: 'b1',
        code: 'DH0001',
        customerName: 'Anh Tuấn',
        status: 'confirmed',
        pickupAt: '2026-10-25T01:00:00.000Z',
        returnAt: '2026-10-27T01:00:00.000Z',
        totalAmount: '1700000',
        updatedAt: '2026-10-20T01:00:00.000Z',
      },
    ],
    recentBookings: [
      {
        id: 'b2',
        code: 'DH0002',
        customerName: 'Chị Thảo',
        status: 'completed',
        pickupAt: '2026-10-20T01:00:00.000Z',
        returnAt: '2026-10-22T01:00:00.000Z',
        totalAmount: '2550000',
        updatedAt: '2026-10-24T05:30:00.000Z',
      },
    ],
    ...over,
  } as Vehicle360Summary;
}

function apiError(message: string, code: string, status = 400) {
  return new ApiClientError({ code, message, status });
}

function grant(...permissions: Permission[]) {
  perms.granted = new Set<string>([PERMISSION.VEHICLE_VIEW, ...permissions]);
}

function revokeAll() {
  perms.granted = new Set<string>();
}

function renderPage() {
  return render(
    <App>
      <VehicleDetailPage />
    </App>,
  );
}

/** Thẻ (khung `Panel`/section có tiêu đề) theo tên — thay cho `.closest('.ant-card')` của bố cục cũ. */
function panel(name: string | RegExp): HTMLElement {
  return screen.getByRole('region', { name });
}

/** Công tắc "Trên chợ" (ADR 0048) — phân biệt với công tắc tự nhận chuyến của thẻ Tối ưu. */
function marketplaceSwitches(): HTMLElement[] {
  return screen.queryAllByRole('switch', { name: /trên chợ/ });
}

beforeEach(() => {
  nav.push.mockReset();
  nav.replace.mockReset();
  deleteVehicle.mutate.mockReset();
  deleteVehicle.isPending = false;
  submitPublic.mutate.mockReset();
  submitPublic.isPending = false;
  detail.data = vehicle();
  detail.isLoading = false;
  detail.isError = false;
  detail.error = undefined;
  detail.refetch.mockReset();
  detail.requestedId = undefined;
  summary.data = summaryOf();
  summary.isLoading = false;
  summary.isError = false;
  summary.requestedId = undefined;
  plan.hasFullManage = true;
  grant();
});

afterEach(cleanup);

/* ------------------------------------------------------------------ quyền */

describe('/manage/vehicles/[id] — quyền', () => {
  it('không có `vehicles.view`: màn 403 và KHÔNG gọi API chi tiết lẫn tổng hợp', () => {
    revokeAll();
    renderPage();

    expect(screen.getByText('Không có quyền xem xe')).toBeTruthy();
    expect(detail.requestedId).toBeUndefined();
    expect(summary.requestedId).toBeUndefined();
  });

  it('màn 403 KHÔNG để lộ bất cứ thông tin nào của xe', () => {
    revokeAll();
    renderPage();

    expect(screen.queryByText('Ford Transit 2021')).toBeNull();
    expect(screen.queryByText('51B-802.46')).toBeNull();
  });

  /*
   * Hàng nút cạnh tiêu đề (Figma `23672:20509`): Xoá (biểu tượng) · Chỉnh sửa · Xem lịch xe. Nút
   * của hành động không mở thì VẮNG hẳn, không mờ đi.
   */
  it('chỉ có quyền xem: còn "Xem lịch xe", không có Chỉnh sửa/Xoá', () => {
    renderPage();

    expect(screen.getByRole('button', { name: /Xem lịch xe/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Chỉnh sửa/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Xoá xe/ })).toBeNull();
  });

  it('có quyền sửa: nút "Chỉnh sửa" dẫn tới đúng route sửa', () => {
    grant(PERMISSION.VEHICLE_UPDATE);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Chỉnh sửa/ }));
    expect(nav.push).toHaveBeenCalledWith('/manage/vehicles/v1/edit');
  });

  it('"Xem lịch xe" mở màn lịch đã lọc sẵn về đúng xe', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Xem lịch xe/ }));
    expect(nav.push).toHaveBeenCalledWith('/manage/calendar?q=51B-802.46');
  });

  it('có quyền xoá: nút xoá chỉ-icon vẫn có tên khả truy cập', () => {
    grant(PERMISSION.VEHICLE_DELETE);
    renderPage();

    expect(screen.getByRole('button', { name: 'Xoá xe Ford Transit 2021' })).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ trạng thái tải */

describe('/manage/vehicles/[id] — tải, lỗi, không tìm thấy', () => {
  it('đang tải: trạng thái tải dùng chung, chưa dựng nội dung', () => {
    detail.data = undefined;
    detail.isLoading = true;
    renderPage();

    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByText('Thông số kỹ thuật')).toBeNull();
  });

  it('lỗi tải: có nút thử lại và gọi đúng refetch', () => {
    detail.data = undefined;
    detail.isError = true;
    detail.error = apiError('Lỗi máy chủ', 'INTERNAL', 500);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Thử lại/ }));
    expect(detail.refetch).toHaveBeenCalledTimes(1);
  });

  it('không tìm thấy: câu chữ riêng và KHÔNG mời thử lại', () => {
    detail.data = undefined;
    detail.isError = true;
    detail.error = apiError('Không tìm thấy', API_ERROR_CODE.NOT_FOUND, 404);
    renderPage();

    expect(screen.getByText('Không tìm thấy xe')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Thử lại/ })).toBeNull();
  });

  it('về danh sách từ màn lỗi', () => {
    detail.data = undefined;
    detail.isError = true;
    detail.error = apiError('Không tìm thấy', API_ERROR_CODE.NOT_FOUND, 404);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Về danh sách' }));
    expect(nav.push).toHaveBeenCalledWith('/manage/vehicles');
  });
});

/* ------------------------------------------------------------------ hồ sơ */

describe('/manage/vehicles/[id] — hồ sơ hiển thị', () => {
  it('tiêu đề trang là "Hồ sơ chi tiết xe"; tên xe nằm trong thẻ hồ sơ', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Hồ sơ chi tiết xe' })).toBeTruthy();
    expect(screen.getByText('Ford Transit 2021')).toBeTruthy();
    expect(screen.getByText('XE-014')).toBeTruthy();
  });

  it('hiện hai trục trạng thái — vận hành và kiểm duyệt — trên thẻ xe', () => {
    renderPage();

    const card = panel('Hồ sơ xe');
    // Viên vận hành NGẮN cạnh tên, nhãn DÀI ở hàng trạng thái (đúng design, cùng mảnh thẻ ít xe).
    expect(within(card).getByText('Sẵn sàng')).toBeTruthy();
    expect(within(card).getByText('Sẵn sàng vận hành')).toBeTruthy();
    // Trục KIỂM DUYỆT, không phải "khách có thấy xe không" (ADR 0048) — cái đó là "Trên chợ".
    expect(within(card).getByText('Nháp')).toBeTruthy();
  });

  /*
   * Bố cục 23/09/2026: công tắc "Trên chợ" ở ĐẦU trang, không phải ở thẻ gần cuối. Ba test dưới
   * khoá đúng điều đó — trước đây chủ xe phải cuộn qua tiền, thông số và giấy tờ mới biết xe có
   * đang bán hay không.
   */
  it('xe đã duyệt: công tắc "Trên chợ" ở cột thao tác đầu trang, và CHỈ có một cái', () => {
    grant(PERMISSION.VEHICLE_SUBMIT_PUBLIC);
    detail.data = vehicle({ publicStatus: 'approved_public', isMarketplaceVisible: true });
    renderPage();

    expect(screen.getByText('Trên chợ')).toBeTruthy();
    expect(marketplaceSwitches()).toHaveLength(1);
    expect(screen.getByText('Đang hiển thị')).toBeTruthy();
  });

  it('xe đã duyệt nhưng chủ xe tạm ẩn: công tắc tắt, trạng thái đọc "Tạm ẩn"', () => {
    grant(PERMISSION.VEHICLE_SUBMIT_PUBLIC);
    detail.data = vehicle({
      publicStatus: 'approved_public',
      marketplaceEnabled: false,
      isMarketplaceVisible: false,
      marketplaceVisibilityReason: 'owner_paused',
    });
    renderPage();

    expect(screen.getByText('Đã kiểm duyệt')).toBeTruthy();
    expect(screen.getByText('Tạm ẩn')).toBeTruthy();
    expect(marketplaceSwitches()[0]!.getAttribute('aria-checked')).toBe('false');
  });

  it('xe chưa duyệt: KHÔNG có công tắc "Trên chợ" — chỉ một thẻ trạng thái', () => {
    renderPage();

    expect(marketplaceSwitches()).toHaveLength(0);
    expect(screen.getByText('Chưa hiển thị')).toBeTruthy();
  });

  it('thông số kỹ thuật hiện đúng giá trị đang lưu — ở tab riêng', () => {
    renderPage();
    // Thông số kỹ thuật là một tab riêng (30/09/2026).
    fireEvent.click(screen.getByRole('tab', { name: 'Thông số kỹ thuật' }));

    expect(screen.getByText('51B-802.46')).toBeTruthy();
    const specs = screen.getByRole('tabpanel', { name: 'Thông số kỹ thuật' });
    expect(within(specs).getByText('Ford')).toBeTruthy();
    expect(within(specs).getByText('16')).toBeTruthy();
    // Số đo có phần lẻ KHÔNG bị làm tròn — 9,5 L/100km từng hiện thành "10".
    expect(within(specs).getByText('9,5 L/100km')).toBeTruthy();
  });

  it('thông số theo loại xe: xe máy KHÔNG có "Số chỗ ngồi", CÓ "Phân khúc xe"', () => {
    detail.data = vehicle({
      vehicleType: 'motorbike',
      motorbikeCategory: 'scooter',
      seatCount: null,
      bodyType: null,
      fuelType: 'gasoline',
      engineDisplacementCc: 125,
    } as Partial<VehicleDetail>);
    renderPage();

    const card = panel('Thông số chính');
    expect(within(card).getByText('Phân khúc xe')).toBeTruthy();
    expect(within(card).queryByText('Số chỗ ngồi')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Thông số kỹ thuật' }));
    const specs = screen.getByRole('tabpanel', { name: 'Thông số kỹ thuật' });
    expect(within(specs).queryByText('Số chỗ ngồi')).toBeNull();
    expect(within(specs).queryByText('Kiểu dáng thân xe')).toBeNull();
    expect(within(specs).getByText('125 cc')).toBeTruthy();
  });

  it('tiền hiển thị qua bộ format, không phải số thô', () => {
    renderPage();

    expect(screen.getByText(/1\.800\.000 ₫/)).toBeTruthy();
    expect(screen.queryByText('1800000')).toBeNull();
  });

  it('có giảm giá: hiện thêm giá sàn đã trừ khuyến mãi', () => {
    detail.data = vehicle({ discountPercent: 10 });
    renderPage();

    expect(screen.getByText('Giá hiển thị sàn')).toBeTruthy();
    expect(screen.getByText(/1\.620\.000 ₫/)).toBeTruthy();
  });

  it('giá theo DỊCH VỤ xe phục vụ: có tài xế thì có dòng giá có tài xế, không dài hạn thì không giá tháng', () => {
    detail.data = vehicle({
      serviceTypes: ['self_drive', 'with_driver'],
      withDriverDailyPrice: '1400000',
      monthlyPrice: '16800000',
    });
    renderPage();

    const pricing = panel('Giá thuê & Chính sách');
    expect(within(pricing).getByText('Có tài xế (nội thành)')).toBeTruthy();
    expect(within(pricing).queryByText('Thuê dài hạn')).toBeNull();
  });

  it('không giảm giá: KHÔNG dựng dòng giá sàn', () => {
    renderPage();
    expect(screen.queryByText('Giá hiển thị sàn')).toBeNull();
  });

  it('việc-cần-làm VẬN HÀNH lấy TỪ SERVER, không suy lại ở client (Wave 8)', () => {
    detail.data = vehicle({ publicStatus: 'approved_public', isMarketplaceVisible: true });
    summary.data = {
      stats: { vehicleId: 'vehicle-1', activeBookings: 0, completedBookings: 0 },
      currentOdometerKm: 45_230,
      currentOdometerSource: 'booking_return',
      alerts: [
        {
          kind: 'document_expiring',
          severity: 'warning',
          title: 'Có giấy tờ sắp hết hạn',
          detail: 'Đăng kiểm còn 10 ngày',
          count: 1,
          href: '/manage/vehicles/v1/edit?tab=documents',
        },
      ],
    } as unknown as typeof summary.data;
    renderPage();

    expect(screen.getByText('Có giấy tờ sắp hết hạn')).toBeTruthy();
    expect(screen.getByText('Đăng kiểm còn 10 ngày')).toBeTruthy();
    // Mức nghiêm trọng nói bằng CHỮ, không chỉ bằng màu chấm.
    expect(screen.getAllByText('Cần chú ý').length).toBeGreaterThan(0);
    // KM có thẩm quyền + nguồn của nó hiện ngay trên thẻ xe (và ở "Số KM hiện tại").
    expect(within(panel('Hồ sơ xe')).getByText('45.230 km')).toBeTruthy();
    expect(screen.getByText(/Bàn giao trả xe/)).toBeTruthy();
  });

  /*
   * ADR 0048 / bố cục 23/09/2026 — thẻ "Việc cần làm" phải kể cả chuyện LÊN CHỢ.
   *
   * Trước đợt này nó chỉ đọc cảnh báo server, nên một chiếc xe còn là NHÁP hiện "Không có việc
   * cần làm" ngay đầu trang trong khi việc thật nằm ở một thẻ gần cuối.
   */
  it('xe nháp còn thiếu dữ liệu: việc lên chợ ở thẻ Việc cần làm, có CTA thật', () => {
    grant(PERMISSION.VEHICLE_UPDATE);
    detail.data = vehicle({ weekdayPrice: null });
    summary.data = emptyAlertSummary();
    renderPage();

    expect(screen.getByText('Hoàn tất hồ sơ để đưa xe lên chợ')).toBeTruthy();
    expect(getLinkByText(/Hoàn tất hồ sơ/)).toBeTruthy();
    expect(screen.queryByText('Không có việc cần làm.')).toBeNull();
  });

  it('xe nháp đã đủ dữ liệu: CTA "Gửi duyệt" ngay trong Việc cần làm', () => {
    grant(PERMISSION.VEHICLE_SUBMIT_PUBLIC);
    summary.data = emptyAlertSummary();
    renderPage();

    expect(screen.getByText('Xe đã sẵn sàng để xét duyệt')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));
    expect(submitPublic.mutate).toHaveBeenCalledTimes(1);
  });

  it('đang chờ duyệt: KHÔNG có nút gửi lại ở bất kỳ đâu trên trang', () => {
    grant(PERMISSION.VEHICLE_SUBMIT_PUBLIC);
    detail.data = vehicle({ publicStatus: 'pending_public_review' });
    summary.data = emptyAlertSummary();
    renderPage();

    expect(screen.getByText('Hồ sơ đang được xét duyệt')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Gửi duyệt/ })).toBeNull();
  });

  it('xe đã duyệt, đang bật, không cảnh báo: KHÔNG dựng thẻ "Việc cần làm" (chốt 03/11)', () => {
    detail.data = vehicle({ publicStatus: 'approved_public', isMarketplaceVisible: true });
    summary.data = emptyAlertSummary();
    renderPage();

    expect(screen.queryByText('Việc cần làm')).toBeNull();
  });

  /*
   * Server cũng sinh `missing_vehicle_info`/`public_action_required`, nhưng chúng chỉ có CHỮ.
   * Trang chi tiết dựng được việc đầy đủ có CTA nên nó LỌC hai cảnh báo đó ra — giữ cả hai là
   * kể cùng một chuyện hai lần, lần thứ hai cụt hơn.
   */
  it('không kể hai lần: cảnh báo server trùng nội dung bị lọc khỏi thẻ', () => {
    detail.data = vehicle({ weekdayPrice: null });
    summary.data = {
      ...emptyAlertSummary(),
      alerts: [
        {
          kind: 'missing_vehicle_info',
          severity: 'warning',
          title: 'Thiếu thông tin để gửi duyệt công khai',
          count: 1,
        },
      ],
    } as unknown as typeof summary.data;
    renderPage();

    expect(screen.getByText('Hoàn tất hồ sơ để đưa xe lên chợ')).toBeTruthy();
    expect(screen.queryByText('Thiếu thông tin để gửi duyệt công khai')).toBeNull();
  });

  it('chỉ hiện 3 việc quan trọng nhất, phần còn lại sau "Xem tất cả"', () => {
    /*
     * Bộ cảnh báo dưới đây có một việc BẢO DƯỠNG, nên người xem phải có quyền đọc bảo dưỡng —
     * đúng như server làm: `VehicleAlertsService` chỉ đẩy nhóm cảnh báo đó cho scope có
     * `vehicles.maintenance.view`. Thiếu dòng này, dữ liệu mẫu mô tả một tình huống KHÔNG tồn
     * tại (server gửi cảnh báo bảo dưỡng cho người không đọc được bảo dưỡng), và từ 29/09/2026
     * `useVehicleAlertView` lọc nó đi — làm hỏng chính phép đếm "3 việc đầu" mà test này khoá.
     */
    grant(PERMISSION.VEHICLE_MAINTENANCE_VIEW);
    summary.data = {
      stats: { vehicleId: 'vehicle-1', activeBookings: 0, completedBookings: 0 },
      currentOdometerKm: null,
      alerts: [
        { kind: 'missing_return_odometer', severity: 'critical', title: 'Thiếu KM trả' },
        { kind: 'document_expired', severity: 'critical', title: 'Có giấy tờ đã hết hạn' },
        { kind: 'maintenance_overdue', severity: 'critical', title: 'Xe đã quá mốc bảo dưỡng' },
        { kind: 'document_expiring', severity: 'warning', title: 'Có giấy tờ sắp hết hạn' },
      ],
    } as unknown as typeof summary.data;
    renderPage();

    expect(screen.getByText('Thiếu KM trả')).toBeTruthy();
    expect(screen.queryByText('Có giấy tờ sắp hết hạn')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Xem tất cả (4)' }));
    expect(screen.getByText('Có giấy tờ sắp hết hạn')).toBeTruthy();
    // KM chưa có thì nói "Chưa có", KHÔNG dựng "0 km" (docs §9).
    expect(screen.queryByText('0 km')).toBeNull();
  });

  it('xe bị từ chối: banner nêu lý do của nền tảng ngay trên thẻ hồ sơ', () => {
    detail.data = vehicle({
      publicStatus: 'rejected',
      latestPublicReview: {
        status: 'rejected',
        reason: 'Ảnh không đúng xe thật',
        reviewedAt: '2026-08-01T00:00:00.000Z',
      },
    } as Partial<VehicleDetail>);
    renderPage();

    expect(within(panel('Hồ sơ xe')).getByText('Bị từ chối')).toBeTruthy();
    // Lý do đứng ngay dưới thẻ xe (dòng đỏ) — chip chỉ nói "bị từ chối", lý do mới là thứ cần đọc.
    expect(within(panel('Hồ sơ xe')).getByText('Ảnh không đúng xe thật')).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ khối tổng hợp */

describe('/manage/vehicles/[id] — khối tổng hợp (summary)', () => {
  it('lịch thuê sắp tới và hoạt động gần đây dựng từ dữ liệu tổng hợp', () => {
    renderPage();

    const schedule = panel('Lịch thuê sắp tới');
    expect(within(schedule).getByText('Anh Tuấn')).toBeTruthy();
    expect(within(schedule).getByText(/1\.700\.000 ₫ • Đã xác nhận/)).toBeTruthy();
    expect(within(schedule).getByText(/25\/10\/2026.*27\/10\/2026/)).toBeTruthy();
    // Dòng thời gian (02/10/2026): tên khách là tiêu đề, mã đơn + khoảng ngày ở dòng phụ.
    const activity = panel('Hoạt động gần đây');
    expect(within(activity).getByText('Chị Thảo')).toBeTruthy();
    expect(within(activity).getByText('Đơn DH0002 • 20/10 – 22/10')).toBeTruthy();
    expect(within(activity).getByText('Hoàn thành')).toBeTruthy();
    expect(within(activity).getByText('2.550.000 ₫')).toBeTruthy();
  });

  it('đánh giá chỉ hiện khi xe đã có lượt đánh giá — không dựng "0/5"', () => {
    summary.data = summaryOf({
      stats: {
        vehicleId: 'v1',
        activeBookings: 0,
        completedBookings: 3,
        ratingAvg: '4.67',
        ratingCount: 3,
      },
    });
    renderPage();

    const card = panel('Hiệu suất luỹ kế');
    expect(within(card).getByText('4,7/5')).toBeTruthy();
    expect(within(card).getByText('3 lượt đánh giá')).toBeTruthy();

    cleanup();
    summary.data = summaryOf();
    renderPage();
    expect(screen.queryByText('Đánh giá')).toBeNull();
  });

  /**
   * Thẻ "Hiệu suất" nay CHỈ nói chuyện vận hành.
   *
   * Doanh thu từng nằm ở đây dưới dạng một con số luỹ kế; nó đã dời sang `FinanceEntityPanel`
   * (có kỳ). Giữ cả hai nghĩa là đặt hai số tiền với hai ý nghĩa thời gian khác nhau trên cùng
   * một màn — test này khoá lại chuyện đó không quay về.
   */
  it('hiệu suất luỹ kế: lượt thuê và đơn đang chạy, KHÔNG còn dòng tiền', () => {
    renderPage();

    const card = panel('Hiệu suất luỹ kế');
    expect(within(card).getByText('12 chuyến')).toBeTruthy();
    expect(within(card).getByText('1 đơn')).toBeTruthy();
    expect(within(card).queryByText('12.750.000 ₫')).toBeNull();
  });

  it('thiếu quyền đơn thuê: backend bỏ hai danh sách → hai khối đó KHÔNG dựng', () => {
    summary.data = summaryOf({ upcomingBookings: undefined, recentBookings: undefined });
    renderPage();

    expect(screen.queryByText('Lịch thuê sắp tới')).toBeNull();
    expect(screen.queryByText('Hoạt động gần đây')).toBeNull();
    // Hiệu suất vẫn còn — stats luôn có mặt.
    expect(screen.getByText('Hiệu suất luỹ kế')).toBeTruthy();
  });

  it('thiếu quyền tài chính: KHÔNG dựng khối tiền của xe', () => {
    summary.data = summaryOf({
      stats: { vehicleId: 'v1', activeBookings: 1, completedBookings: 12, ratingCount: 0 },
    });
    renderPage();

    expect(screen.queryByTestId('vehicle-finance-panel')).toBeNull();
    // Phần vận hành vẫn còn — thiếu quyền tiền không được làm mất chỉ số không phải tiền.
    expect(screen.getByText('12 chuyến')).toBeTruthy();
  });

  it('có `finance.view`: khối tiền của xe được dựng, thu hẹp đúng xe đang xem', () => {
    grant(PERMISSION.FINANCE_VIEW);
    renderPage();

    // Tiền của xe nằm ở tab "Tài chính" (30/09/2026) — tab chỉ có khi đủ quyền ∧ gói.
    fireEvent.click(screen.getByRole('tab', { name: 'Tài chính' }));
    expect(screen.getByTestId('vehicle-finance-panel').textContent).toBe('v1');
  });

  /**
   * TUYẾN HOA HỒNG: có quyền, KHÔNG có gói — và đó là hai chuyện khác nhau.
   *
   * Chủ xe cá nhân dùng CHUNG vai `shop_owner` với chủ gian hàng (ADR 0014), nên `finance.view`
   * và `vehicles.maintenance.view` của họ đều `true` — đã đối chiếu trên dữ liệu thật: hai tài
   * khoản trả về đúng 55 permission GIỐNG HỆT NHAU, chỉ khác `tenant.features`.
   *
   * Backend gác hai khu đó bằng trục khác (`@SubscriptionTrackOnly` + `@RequiresFeature`) và trả
   * `SUBSCRIPTION_TRACK_ONLY`. Trước 29/09/2026 hồ sơ xe ở `/account` dựng cả hai khối rồi để
   * chúng tự báo "Không tải được số liệu" — một câu nói rằng hệ thống đang hỏng, cho một tính
   * năng người dùng chưa từng mua.
   */
  it('tuyến hoa hồng: có `finance.view` nhưng KHÔNG có cờ gói ⇒ không dựng khối tiền', () => {
    grant(PERMISSION.FINANCE_VIEW);
    plan.hasFullManage = false;
    renderPage();

    expect(screen.queryByTestId('vehicle-finance-panel')).toBeNull();
  });

  it('tuyến hoa hồng: có quyền bảo dưỡng nhưng KHÔNG có cờ gói ⇒ không dựng thẻ bảo dưỡng', () => {
    grant(PERMISSION.VEHICLE_MAINTENANCE_VIEW);
    plan.hasFullManage = false;
    renderPage();

    expect(screen.queryByText('Bảo dưỡng & Số KM')).toBeNull();
    // Hồ sơ xe vẫn nguyên vẹn — mất một thẻ của gói không được kéo theo phần cơ bản.
    expect(screen.getByText('Thông số kỹ thuật')).toBeTruthy();
  });

  it('tổng hợp hỏng: hồ sơ vẫn hiển thị, từng khối báo "Không tải được"', () => {
    summary.data = undefined;
    summary.isError = true;
    renderPage();

    expect(screen.getByText('Ford Transit 2021')).toBeTruthy();
    expect(screen.getAllByText('Không tải được dữ liệu.').length).toBeGreaterThan(0);
  });

  it('không có lịch sắp tới: nói rõ thay vì để trống', () => {
    summary.data = summaryOf({ upcomingBookings: [] });
    renderPage();

    expect(screen.getByText('Không có lịch thuê sắp tới.')).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ khu vực wave sau */

describe('/manage/vehicles/[id] — nguồn xe, bảo dưỡng, lối tắt', () => {
  it('nguồn xe có thẻ thật, bảo dưỡng là tab, lối tắt chỉ chứa đích không có lối khác', () => {
    grant(
      PERMISSION.VEHICLE_UPDATE,
      PERMISSION.VEHICLE_MAINTENANCE_VIEW,
      PERMISSION.VEHICLE_DOCUMENT_VIEW,
      PERMISSION.BOOKING_VIEW,
    );
    renderPage();

    const source = panel('Nguồn xe & Tài chính');
    expect(within(source).getByText('Hình thức nguồn xe')).toBeTruthy();
    expect(within(source).getByText('Sở hữu')).toBeTruthy();
    // Bảo dưỡng & số KM là một TAB riêng (30/09/2026) — chỉ có khi đủ quyền ∧ cờ gói.
    expect(screen.getByRole('tab', { name: 'Bảo dưỡng & số KM' })).toBeTruthy();

    // Thẻ "Giấy tờ" đã gỡ (chốt 03/11): cảnh báo giấy tờ đi qua "Việc cần làm", lối sửa ở màn sửa.
    expect(screen.queryByText('Hồ sơ & Giấy tờ pháp lý')).toBeNull();
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('/manage/vehicles/v1/edit?tab=media');
    // Lối tắt: đơn của xe + trung tâm bảo dưỡng — KHÔNG lặp các mục của menu màn sửa.
    const shortcutHrefs = within(panel('Lối tắt'))
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(shortcutHrefs).toEqual(['/manage/bookings?vehicleId=v1', '/manage/maintenance']);
    // Hồ sơ xe là trang tổng quan — không nhúng lại form của tab nào.
    expect(screen.queryByRole('button', { name: /Lưu thay đổi|Thêm giấy tờ/ })).toBeNull();
  });

  it('thiếu quyền bảo dưỡng: thẻ Bảo dưỡng & Số KM vắng mặt hẳn, không hiện khung rỗng', () => {
    renderPage(); // chỉ có VEHICLE_VIEW
    expect(screen.queryByText('Bảo dưỡng & Số KM')).toBeNull();
  });
});

/* ------------------------------------------------------------------ thẻ tổng quan (02/10/2026) */

describe('/manage/vehicles/[id] — thẻ tổng quan', () => {
  function galleryCard(): HTMLElement {
    return panel('Thư viện ảnh');
  }

  /*
   * Thư viện THEO GÓC (Figma `23670:3531`): mỗi góc bắt buộc của loại xe là một ô — ô tô năm ô
   * (trước · sau · trái · phải · nội thất). Góc chưa có ảnh là ô trống, không biến mất.
   */
  it('thư viện ảnh: ảnh bìa ở ô "Mặt trước" (đầu tiên) và mang nhãn "Ảnh bìa"', () => {
    detail.data = vehicle({
      mainImageUrl: 'https://cdn.test/2.jpg',
      images: ['https://cdn.test/1.jpg', 'https://cdn.test/2.jpg'],
      media: [
        { url: 'https://cdn.test/1.jpg', type: 'rear', sortOrder: 0 },
        { url: 'https://cdn.test/2.jpg', type: 'front', sortOrder: 1 },
      ],
    });
    renderPage();

    const items = within(galleryCard()).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(within(items[0]!).getByText('Ảnh bìa')).toBeTruthy();
    expect(items[0]!.querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/2.jpg');
    expect(items[1]!.querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/1.jpg');
  });

  it('thư viện ảnh: ảnh bìa nằm ngoài danh sách ảnh (dữ liệu cũ) lấp vào ô "Mặt trước"', () => {
    detail.data = vehicle({
      mainImageUrl: 'https://cdn.test/cover.jpg',
      images: ['https://cdn.test/1.jpg'],
      media: [{ url: 'https://cdn.test/1.jpg', type: 'rear', sortOrder: 0 }],
    });
    renderPage();

    const items = within(galleryCard()).getAllByRole('listitem');
    expect(within(items[0]!).getByText('Ảnh bìa')).toBeTruthy();
    expect(items[0]!.querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/cover.jpg');
  });

  it('thư viện ảnh: quá 10 ô thì ô thứ 10 báo "+N", ảnh dư vẫn trong nhóm xem trước', () => {
    const images = Array.from({ length: 11 }, (_, i) => `https://cdn.test/${i}.jpg`);
    detail.data = vehicle({
      mainImageUrl: images[0],
      images,
      media: images.map((url, sortOrder) => ({ url, type: 'other' as const, sortOrder })),
    });
    renderPage();

    // Năm ô góc (trống) + 11 ảnh "Khác" = 16 ô; hiện 10, ô thứ 10 báo phần còn lại.
    expect(within(galleryCard()).getByText('+6')).toBeTruthy();
    // Ảnh dư không bị cắt khỏi DOM — trình xem toàn màn hình phải lướt được tới chúng.
    expect(galleryCard().querySelectorAll('img')).toHaveLength(11);
  });

  it('thư viện ảnh: chưa có ảnh thì đủ năm ô trống; chỉ người sửa được mới có lối thêm ảnh', () => {
    detail.data = vehicle({ mainImageUrl: null, images: [], media: [] });
    renderPage();

    expect(within(galleryCard()).getAllByRole('listitem')).toHaveLength(5);
    expect(galleryCard().querySelectorAll('img')).toHaveLength(0);
    expect(within(galleryCard()).queryByRole('link')).toBeNull();

    cleanup();
    grant(PERMISSION.VEHICLE_UPDATE);
    renderPage();
    expect(
      within(galleryCard())
        .getByRole('link', { name: /Thêm\/Sắp xếp ảnh/ })
        .getAttribute('href'),
    ).toBe('/manage/vehicles/v1/edit?tab=media');
    // Ô góc trống bấm được — dẫn thẳng tới mục ảnh.
    expect(
      within(galleryCard()).getByRole('link', { name: 'Thêm Bên trái' }).getAttribute('href'),
    ).toBe('/manage/vehicles/v1/edit?tab=media');
  });

  it('thông số chính: hiện tóm tắt, "Xem đầy đủ" chuyển tab tại chỗ và đưa focus theo', async () => {
    renderPage();

    const card = panel('Thông số chính');
    expect(within(card).getByText('Ford Transit')).toBeTruthy();
    expect(within(card).getByText('16')).toBeTruthy();

    fireEvent.click(within(card).getByRole('button', { name: 'Xem đầy đủ thông số kỹ thuật' }));
    const specsTab = screen.getByRole('tab', { name: 'Thông số kỹ thuật' });
    expect(specsTab.getAttribute('aria-selected')).toBe('true');
    // Nút vừa bấm nằm trong ô vừa bị ẩn — focus phải sang tab, không lạc lại trong ô ẩn.
    await waitFor(() => expect(document.activeElement).toBe(specsTab));
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('việc cần làm: đang tải thì KHÔNG dựng khung rỗng; tải hỏng thì NÓI là không biết', () => {
    detail.data = vehicle({ publicStatus: 'approved_public', isMarketplaceVisible: true });
    summary.data = undefined;
    summary.isLoading = true;
    renderPage();
    expect(screen.queryByText('Việc cần làm')).toBeNull();

    cleanup();
    summary.isLoading = false;
    summary.isError = true;
    renderPage();
    // "Không thấy việc nào" lúc tải hỏng KHÔNG có nghĩa là "không có việc nào".
    expect(within(panel(/Việc cần làm/)).getByText('Không tải được dữ liệu.')).toBeTruthy();
  });

  it('"Xử lý ngay" KHÔNG dựng cho một lời nhắc mức thông tin', () => {
    detail.data = vehicle({ publicStatus: 'approved_public', isMarketplaceVisible: true });
    summary.data = {
      ...emptyAlertSummary(),
      alerts: [
        {
          kind: 'source_obligation_due',
          severity: 'info',
          title: 'Sắp tới kỳ thanh toán nguồn xe',
          count: 1,
          href: '/manage/vehicles/v1/edit?tab=source',
        },
      ],
    } as unknown as typeof summary.data;
    renderPage();

    expect(screen.getByText('Sắp tới kỳ thanh toán nguồn xe')).toBeTruthy();
    expect(queryLinkByText('Xử lý ngay')).toBeNull();
  });

  it('"Xử lý ngay" dẫn tới việc ĐẦU BẢNG của server, đúng đích theo khu', () => {
    detail.data = vehicle({ publicStatus: 'approved_public', isMarketplaceVisible: true });
    summary.data = {
      ...emptyAlertSummary(),
      alerts: [
        {
          kind: 'document_expired',
          severity: 'critical',
          title: 'Có giấy tờ đã hết hạn',
          count: 1,
          href: '/manage/vehicles/v1/edit?tab=documents',
        },
      ],
    } as unknown as typeof summary.data;
    grant(PERMISSION.VEHICLE_DOCUMENT_VIEW);
    renderPage();

    const cta = getLinkByText('Xử lý ngay');
    expect(cta.getAttribute('href')).toBe('/manage/vehicles/v1/edit?tab=documents');
    // Nút nằm TRONG chính việc nó xử lý, không trôi xuống cuối thẻ.
    expect(cta.closest('li')?.textContent).toContain('Có giấy tờ đã hết hạn');
  });

  it('xe tạm ẩn + có việc vận hành: "Xử lý ngay" đứng dưới việc đó, lời nhắc tạm ẩn xuống cuối và KHÔNG có nút', () => {
    detail.data = vehicle({
      publicStatus: 'approved_public',
      marketplaceEnabled: false,
      isMarketplaceVisible: false,
      marketplaceVisibilityReason: 'owner_paused',
    });
    summary.data = {
      ...emptyAlertSummary(),
      alerts: [
        {
          kind: 'document_expired',
          severity: 'critical',
          title: 'Có giấy tờ đã hết hạn',
          count: 1,
          href: '/manage/vehicles/v1/edit?tab=documents',
        },
      ],
    } as unknown as typeof summary.data;
    grant(PERMISSION.VEHICLE_SUBMIT_PUBLIC);
    renderPage();

    const cta = getLinkByText('Xử lý ngay');
    const note = screen.getByText('Xe đang tạm ẩn khỏi chợ');
    expect(cta.closest('li')?.textContent).toContain('Có giấy tờ đã hết hạn');
    // Thứ tự trong DOM: nút của việc phải làm đứng TRƯỚC lời nhắc.
    expect(cta.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Công tắc "Trên chợ" ở đầu trang là chỗ bấm duy nhất — không có nút thứ hai trong thẻ.
    expect(queryLinkByText('Bật hiển thị')).toBeNull();
    expect(marketplaceSwitches()).toHaveLength(1);
  });

  it('thứ tự thẻ tổng quan: Việc cần làm · Thông số chính · Thư viện ảnh · Nguồn xe · Tối ưu', () => {
    grant(PERMISSION.VEHICLE_DOCUMENT_VIEW);
    renderPage();

    const titles = Array.from(
      screen.getByRole('tabpanel', { name: 'Tổng quan' }).querySelectorAll('h3'),
    ).map((node) => node.textContent);
    expect(titles).toEqual([
      'Việc cần làm',
      'Thông số chính',
      'Thư viện ảnh',
      'Nguồn xe & Tài chính',
      'Tối ưu nhận chuyến',
    ]);
  });

  it('Tối ưu nhận chuyến: công tắc tự nhận NGAY trên thẻ, lưu tức thì', () => {
    grant(PERMISSION.VEHICLE_UPDATE);
    serviceSettings.patch.mockReset();
    renderPage();

    const toggle = within(panel('Tối ưu nhận chuyến')).getByRole('switch', {
      name: 'Tự động đồng ý nhận chuyến',
    });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(serviceSettings.patch).toHaveBeenCalledWith({ autoAcceptEnabled: false });
  });

  it('Tối ưu nhận chuyến: hai dịch vụ hai công tắc; có tài xế chưa có tài xế thì không bật được', () => {
    grant(PERMISSION.VEHICLE_UPDATE);
    detail.data = vehicle({ serviceTypes: ['self_drive', 'with_driver'] });
    renderPage();

    const card = panel('Tối ưu nhận chuyến');
    expect(within(card).getByRole('switch', { name: /Tự lái/ })).toBeTruthy();
    expect(
      within(card)
        .getByRole('switch', { name: /Có tài xế/ })
        .hasAttribute('disabled'),
    ).toBe(true);
  });

  it('xe chỉ cho thuê dài hạn: KHÔNG có thẻ Tối ưu nhận chuyến (gian hàng luôn tự chốt lịch)', () => {
    detail.data = vehicle({ serviceTypes: ['long_term'] });
    renderPage();
    expect(screen.queryByText('Tối ưu nhận chuyến')).toBeNull();
  });

  it('tab Tiện ích xe: danh sách phẳng + mô tả xe', () => {
    detail.data = vehicle({ features: ['bluetooth'] });
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Tiện ích xe' }));

    expect(within(panel('Tiện ích trên xe')).getAllByRole('listitem')).toHaveLength(1);
    expect(within(panel('Mô tả xe')).getByText('Xe 16 chỗ đời 2021.')).toBeTruthy();
  });

  it('việc lên chợ đứng đầu thì KHÔNG dựng thêm "Xử lý ngay" — việc đó có nút riêng', () => {
    grant(PERMISSION.VEHICLE_SUBMIT_PUBLIC);
    summary.data = {
      ...emptyAlertSummary(),
      alerts: [
        {
          kind: 'document_expiring',
          severity: 'warning',
          title: 'Có giấy tờ sắp hết hạn',
          count: 1,
          href: '/manage/vehicles/v1/edit?tab=documents',
        },
      ],
    } as unknown as typeof summary.data;
    renderPage();

    expect(screen.getByText('Xe đã sẵn sàng để xét duyệt')).toBeTruthy();
    expect(queryLinkByText('Xử lý ngay')).toBeNull();
  });
});

/*
 * Thẻ xét duyệt (checklist điều kiện lên chợ) KHÔNG còn trên Hồ sơ 360 (30/09/2026): tab "Xét
 * duyệt" đã bỏ; việc còn thiếu nằm ở "Việc cần làm", và xe tạo qua wizard đã đủ điều kiện. Panel
 * vẫn có bộ test riêng ở `vehicle-public-review-panel.test.tsx`.
 */

/* ------------------------------------------------------------------ xoá + điều hướng */

describe('/manage/vehicles/[id] — xoá và điều hướng', () => {
  async function openDeleteConfirm() {
    fireEvent.click(screen.getByRole('button', { name: 'Xoá xe Ford Transit 2021' }));
    await screen.findByText('Xoá xe "Ford Transit 2021"?');
  }

  it('xoá là nút biểu tượng đầu trang, phải xác nhận và hộp thoại nói rõ hệ quả', async () => {
    grant(PERMISSION.VEHICLE_DELETE);
    renderPage();

    await openDeleteConfirm();
    expect(deleteVehicle.mutate).not.toHaveBeenCalled();

    expect(await screen.findByText('Xoá xe "Ford Transit 2021"?')).toBeTruthy();
    expect(screen.getByText(/Đơn thuê, phiếu thu\/chi đã có vẫn được giữ/)).toBeTruthy();
    expect(screen.getByText(/Không xoá được nếu xe còn lịch thuê/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Xoá' }));
    await waitFor(() => expect(deleteVehicle.mutate).toHaveBeenCalledTimes(1));
    expect(deleteVehicle.mutate.mock.calls[0]![0]).toBe('v1');
  });

  it('xoá xong: về danh sách bằng `replace` — không quay lui vào bản ghi đã xoá', async () => {
    grant(PERMISSION.VEHICLE_DELETE);
    renderPage();

    await openDeleteConfirm();
    fireEvent.click(await screen.findByRole('button', { name: 'Xoá' }));
    await waitFor(() => expect(deleteVehicle.mutate).toHaveBeenCalledTimes(1));

    const options = deleteVehicle.mutate.mock.calls[0]![1] as { onSuccess: () => void };
    options.onSuccess();

    expect(nav.replace).toHaveBeenCalledWith('/manage/vehicles');
  });

  it('nút quay lại về danh sách xe', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));

    expect(nav.push).toHaveBeenCalledWith('/manage/vehicles');
  });
});

/* ------------------------------------------------------------------ chủ xe tuyến hoa hồng */

describe('/manage/vehicles/[id] — chủ xe tuyến hoa hồng (cùng giao diện, chốt 03/11)', () => {
  const OWNER_WORKSPACE = {
    workspace: WORKSPACE.ACCOUNT,
    paths: workspacePaths(WORKSPACE.ACCOUNT),
    vehicles: workspaceVehiclePaths(WORKSPACE.ACCOUNT),
    isManage: false,
  };

  it('không có Hiệu suất, Nguồn xe; "Chỉnh sửa" mở không gian Quản lý xe', () => {
    grant(PERMISSION.VEHICLE_UPDATE, PERMISSION.FINANCE_VIEW);
    render(
      <WorkspaceScope value={OWNER_WORKSPACE}>
        <App>
          <VehicleDetailPage />
        </App>
      </WorkspaceScope>,
    );

    expect(screen.queryByText('Hiệu suất luỹ kế')).toBeNull();
    expect(screen.queryByText('Nguồn xe & Tài chính')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Chỉnh sửa/ }));
    expect(nav.push).toHaveBeenCalledWith('/manage/vehicles/v1/manage/information');
  });
});
