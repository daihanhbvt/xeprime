import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ERROR_CODE, PERMISSION, type Permission } from '@xeprime/types';

import { ApiClientError } from '@/services/api-client';
import type { Vehicle360Summary, VehicleDetail } from '@/features/vehicles/types';

import VehicleDetailPage from './page';

/**
 * `/manage/vehicles/[id]` — Hồ sơ 360 của xe (Figma `236:2222`).
 *
 * Khẳng định trên hợp đồng: quyền nào mở hành động nào, khối nào hiện từ dữ liệu nào, tổng hợp
 * hỏng thì hồ sơ còn đứng không. KHÔNG khẳng định trên bố cục cột (đó là chuyện của CSS).
 */

/* ------------------------------------------------------------------ hạ tầng mock */

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

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

vi.mock('@/features/vehicles/hooks/use-vehicle-mutations', () => ({
  useDeleteVehicle: () => deleteVehicle,
  useSubmitVehiclePublic: () => submitPublic,
}));

const perms = vi.hoisted(() => ({ granted: new Set<string>() }));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.has(p),
    hasAny: (...ps: string[]) => ps.some((p) => perms.granted.has(p)),
    isLoading: false,
  }),
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
    serviceType: 'self_drive',
    operationStatus: 'available',
    publicStatus: 'draft',
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
    mainImageUrl: 'https://cdn.test/main.jpg',
    images: [],
    features: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  } as VehicleDetail;
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

/** Panel "Tiến trình gửi duyệt công khai" — để câu hỏi 'Chưa có' không dính các khối khác. */
function reviewPanel(): HTMLElement {
  return screen.getByText('Tiến trình gửi duyệt công khai').closest('.ant-card') as HTMLElement;
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

  it('chỉ có quyền xem: không có nút sửa, không có menu thao tác khác', () => {
    renderPage();

    expect(screen.queryByRole('button', { name: 'Chỉnh sửa' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Thao tác khác cho Ford Transit 2021/ }),
    ).toBeNull();
  });

  it('có quyền sửa: nút "Chỉnh sửa" dẫn tới đúng route sửa', () => {
    grant(PERMISSION.VEHICLE_UPDATE);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));
    expect(nav.push).toHaveBeenCalledWith('/manage/vehicles/v1/edit');
  });

  it('nút "Xem lịch" mở màn lịch đã lọc sẵn về đúng xe', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Xem lịch' }));
    expect(nav.push).toHaveBeenCalledWith('/manage/calendar?q=51B-802.46');
  });

  it('có quyền xoá: nút menu chỉ-icon vẫn có tên khả truy cập', () => {
    grant(PERMISSION.VEHICLE_DELETE);
    renderPage();

    expect(
      screen.getByRole('button', { name: /Thao tác khác cho Ford Transit 2021/ }),
    ).toBeTruthy();
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

  it('hiện CẢ HAI trục trạng thái — vận hành và public — kèm nhãn trục', () => {
    renderPage();

    expect(screen.getByText('Vận hành')).toBeTruthy();
    expect(screen.getByText('Sẵn sàng')).toBeTruthy();
    expect(screen.getByText('Public')).toBeTruthy();
    expect(screen.getByText('Nháp')).toBeTruthy();
  });

  it('thông số kỹ thuật hiện đúng giá trị đang lưu', () => {
    renderPage();

    expect(screen.getByText('51B-802.46')).toBeTruthy();
    expect(screen.getByText('Ford')).toBeTruthy();
    expect(screen.getByText('16')).toBeTruthy();
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
    expect(screen.getByText('1.620.000 ₫')).toBeTruthy();
  });

  it('không giảm giá: KHÔNG dựng dòng giá sàn', () => {
    renderPage();
    expect(screen.queryByText('Giá hiển thị sàn')).toBeNull();
  });

  it('việc-cần-làm lấy TỪ SERVER, không suy lại ở client (Wave 8)', () => {
    detail.data = vehicle({ mainImageUrl: null });
    summary.data = {
      stats: { vehicleId: 'vehicle-1', activeBookings: 0, completedBookings: 0 },
      currentOdometerKm: 45_230,
      currentOdometerSource: 'booking_return',
      alerts: [
        {
          kind: 'missing_vehicle_info',
          severity: 'warning',
          title: 'Thiếu thông tin để gửi duyệt công khai',
          detail: 'Còn thiếu: ảnh đại diện',
          count: 1,
          href: '/manage/vehicles/v1/edit?tab=information',
        },
      ],
    } as unknown as typeof summary.data;
    renderPage();

    expect(screen.getByText('Thiếu thông tin để gửi duyệt công khai')).toBeTruthy();
    expect(screen.getByText('Còn thiếu: ảnh đại diện')).toBeTruthy();
    // Mức nghiêm trọng nói bằng CHỮ, không chỉ bằng màu chấm.
    expect(screen.getAllByText('Cần chú ý').length).toBeGreaterThan(0);
    // KM có thẩm quyền + nguồn của nó hiện ngay trên header.
    expect(screen.getByText('45.230 km')).toBeTruthy();
    expect(screen.getByText(/Bàn giao trả xe/)).toBeTruthy();
  });

  it('chỉ hiện 3 việc quan trọng nhất, phần còn lại sau "Xem tất cả"', () => {
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

    expect(screen.getAllByText('Xe bị từ chối').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ảnh không đúng xe thật').length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ khối tổng hợp */

describe('/manage/vehicles/[id] — khối tổng hợp (summary)', () => {
  it('lịch thuê sắp tới và hoạt động gần đây dựng từ dữ liệu tổng hợp', () => {
    renderPage();

    expect(screen.getByText(/Anh Tuấn • 25\/10 – 27\/10/)).toBeTruthy();
    expect(screen.getByText(/1\.700\.000 ₫ • Đã xác nhận/)).toBeTruthy();
    expect(screen.getByText('Đơn DH0002 · Hoàn thành')).toBeTruthy();
  });

  it('hiệu suất luỹ kế: doanh thu, lượt thuê và đơn đang chạy từ stats', () => {
    renderPage();

    const card = screen.getByText('Hiệu suất luỹ kế').closest('.ant-card') as HTMLElement;
    expect(within(card).getByText('12.750.000 ₫')).toBeTruthy();
    expect(within(card).getByText('12 chuyến')).toBeTruthy();
    expect(within(card).getByText('1 đơn')).toBeTruthy();
  });

  it('thiếu quyền đơn thuê: backend bỏ hai danh sách → hai khối đó KHÔNG dựng', () => {
    summary.data = summaryOf({ upcomingBookings: undefined, recentBookings: undefined });
    renderPage();

    expect(screen.queryByText('Lịch thuê sắp tới')).toBeNull();
    expect(screen.queryByText('Hoạt động gần đây')).toBeNull();
    // Hiệu suất vẫn còn — stats luôn có mặt.
    expect(screen.getByText('Hiệu suất luỹ kế')).toBeTruthy();
  });

  it('thiếu quyền tài chính: khối hiệu suất không dựng dòng doanh thu', () => {
    summary.data = summaryOf({
      stats: { vehicleId: 'v1', activeBookings: 1, completedBookings: 12 },
    });
    renderPage();

    const card = screen.getByText('Hiệu suất luỹ kế').closest('.ant-card') as HTMLElement;
    expect(within(card).queryByText('Doanh thu')).toBeNull();
    expect(within(card).getByText('12 chuyến')).toBeTruthy();
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

describe('/manage/vehicles/[id] — khu vực chưa có dữ liệu', () => {
  it('giấy tờ / nguồn xe / bảo dưỡng có thẻ thật và lối đi chuẩn (Wave 8)', () => {
    grant(
      PERMISSION.VEHICLE_UPDATE,
      PERMISSION.VEHICLE_MAINTENANCE_VIEW,
      PERMISSION.VEHICLE_DOCUMENT_VIEW,
    );
    renderPage();

    expect(screen.getByText('Hồ sơ & Giấy tờ pháp lý')).toBeTruthy();
    expect(screen.getByText('Nguồn xe & Tài chính')).toBeTruthy();
    expect(screen.getByText('Bảo dưỡng & Số KM')).toBeTruthy();
    expect(screen.getByText('Hình thức nguồn xe')).toBeTruthy();
    expect(screen.getByText('Sở hữu')).toBeTruthy();
    expect(screen.getByText(/Chưa có dữ liệu KM/)).toBeTruthy();
    // Mốc bảo dưỡng chưa tính được thì nói thẳng, KHÔNG dựng "0 km" giả (docs §9).
    expect(screen.getAllByText('Chưa đủ dữ liệu').length).toBeGreaterThan(0);

    // Lối đi dùng ĐÚNG giá trị `?tab=` chuẩn của màn sửa xe.
    const links = screen.getAllByRole('link');
    const hrefs = links.map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('/manage/vehicles/v1/edit?tab=documents');
    expect(hrefs).toContain('/manage/vehicles/v1/edit?tab=maintenance');
    expect(hrefs).toContain('/manage/vehicles/v1/edit?tab=media');
    expect(hrefs).toContain('/manage/maintenance');
    // Hồ sơ 360 là trang tổng quan — không nhúng lại form của tab nào.
    expect(screen.queryByRole('button', { name: /Lưu thay đổi|Thêm giấy tờ/ })).toBeNull();
  });

  it('thiếu quyền giấy tờ: thẻ giấy tờ vắng mặt hẳn, không hiện khung rỗng', () => {
    grant(PERMISSION.VEHICLE_MAINTENANCE_VIEW);
    renderPage(); // không có VEHICLE_DOCUMENT_VIEW
    expect(screen.queryByText('Hồ sơ & Giấy tờ pháp lý')).toBeNull();
    expect(
      screen.queryAllByRole('link').map((link) => link.getAttribute('href')),
    ).not.toContain('/manage/vehicles/v1/edit?tab=documents');
  });

  it('thiếu quyền bảo dưỡng: thẻ Bảo dưỡng & Số KM vắng mặt hẳn, không hiện khung rỗng', () => {
    renderPage(); // chỉ có VEHICLE_VIEW
    expect(screen.queryByText('Bảo dưỡng & Số KM')).toBeNull();
  });
});

/* ------------------------------------------------------------------ gửi duyệt công khai */

describe('/manage/vehicles/[id] — tiến trình gửi duyệt', () => {
  it('không có quyền gửi duyệt: không có danh sách điều kiện và không có nút gửi', () => {
    renderPage();

    expect(screen.queryByRole('button', { name: /Gửi duyệt/ })).toBeNull();
  });

  it('đủ điều kiện: danh sách hiện đủ 4 mục và nút gửi bấm được', () => {
    grant(PERMISSION.VEHICLE_SUBMIT_PUBLIC);
    renderPage();

    expect(within(reviewPanel()).getAllByText('Đã có')).toHaveLength(4);
    const button = screen.getByRole('button', { name: /Gửi duyệt công khai/ });
    fireEvent.click(button);
    expect(submitPublic.mutate).toHaveBeenCalledTimes(1);
  });

  it('thiếu điều kiện: nêu đúng mục còn thiếu và KHOÁ nút gửi', () => {
    grant(PERMISSION.VEHICLE_SUBMIT_PUBLIC);
    detail.data = vehicle({ description: null, plateNumber: null });
    renderPage();

    expect(within(reviewPanel()).getAllByText('Chưa có')).toHaveLength(2);
    const button = screen.getByRole('button', { name: /Gửi duyệt công khai/ });
    expect(button.hasAttribute('disabled')).toBe(true);

    fireEvent.click(button);
    expect(submitPublic.mutate).not.toHaveBeenCalled();
  });

  it('xe đã duyệt: không mời gửi lại, chỉ báo đang hiển thị trên chợ', () => {
    grant(PERMISSION.VEHICLE_SUBMIT_PUBLIC);
    detail.data = vehicle({ publicStatus: 'approved_public' });
    renderPage();

    expect(screen.getByText('Xe đang hiển thị trên chợ')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Gửi duyệt/ })).toBeNull();
  });
});

/* ------------------------------------------------------------------ xoá + điều hướng */

describe('/manage/vehicles/[id] — xoá và điều hướng', () => {
  async function openDeleteConfirm() {
    fireEvent.click(screen.getByRole('button', { name: /Thao tác khác cho Ford Transit 2021/ }));
    fireEvent.click(await screen.findByText('Xoá xe'));
  }

  it('xoá nằm sau menu ⋮, phải xác nhận và hộp thoại nói rõ hệ quả', async () => {
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
