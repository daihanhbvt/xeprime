import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { App } from 'antd';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION, type Permission } from '@xeprime/types';

import type { VehicleListItem, VehicleStats } from '@/features/vehicles/types';

import VehiclesPage from './page';

/**
 * `/manage/vehicles` — **lưới thẻ**, hình thái mặc định từ Wave 3B.
 *
 * Hành vi của chế độ bảng (cột, cuộn ngang, cột hành động dính phải) vẫn được khoá ở
 * `vehicles-page.test.tsx` với `view=table`.
 *
 * Số liệu trong test là **tổng hợp tổng hợp**, không phải PII và không phải dữ liệu thật.
 */

/* ------------------------------------------------------------------ hạ tầng mock */

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => '/manage/vehicles',
  useSearchParams: () => nav.params,
}));

const query = vi.hoisted(() => ({
  data: undefined as { items: unknown[]; meta: unknown } | undefined,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
}));

vi.mock('@/features/vehicles/hooks/use-vehicles', () => ({
  useVehicles: () => query,
}));

/** Chỉ số thẻ — mock ở tầng hook để không cần QueryClientProvider trong test trang. */
const stats = vi.hoisted(() => ({
  byId: new Map<string, unknown>(),
  isLoading: false,
  isError: false,
  /** Id mà lưới thực sự hỏi — hợp đồng "chỉ hỏi xe của trang hiện tại". */
  requestedIds: [] as string[],
}));

vi.mock('@/features/vehicles/hooks/use-vehicle-card-stats', () => ({
  useVehicleCardStats: (ids: string[]) => {
    stats.requestedIds = ids;
    return stats;
  },
}));

/**
 * Việc cần làm + KM của xe (Wave 8) — mock ở tầng hook như `useVehicleCardStats`.
 * `byId` rỗng nghĩa là "chưa tải xong / tải hỏng": thẻ vẫn dựng được, chỉ vắng cảnh báo.
 */
const alerts = vi.hoisted(() => ({
  byId: new Map<string, unknown>(),
  requestedIds: [] as string[],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
vi.mock('@/features/vehicles/hooks/use-vehicle-alerts', () => ({
  useVehicleAlerts: (ids: string[]) => {
    alerts.requestedIds = ids;
    return alerts;
  },
  useInvalidateVehicleSurfaces: () => vi.fn(),
}));

/** Dải chỉ số đội xe (mobile) — mock ở tầng hook, cùng lý do với `useVehicleCardStats`. */
const fleet = vi.hoisted(() => ({
  data: undefined as
    | { total: number; available: number; renting: number; maintenance: number; inactive: number }
    | undefined,
  isLoading: false,
  isError: false,
}));

vi.mock('@/features/vehicles/hooks/use-fleet-summary', () => ({
  useFleetSummary: () => fleet,
}));

const perms = vi.hoisted(() => ({ granted: new Set<string>() }));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.has(p),
    hasAny: (...ps: string[]) => ps.some((p) => perms.granted.has(p)),
    isLoading: false,
  }),
}));

const viewport = vi.hoisted(() => ({ mobile: false }));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => viewport.mobile,
  useIsTablet: () => false,
  useIsDesktop: () => !viewport.mobile,
  useMediaQuery: () => viewport.mobile,
}));

/* ------------------------------------------------------------------ dữ liệu mẫu */

function vehicle(over: Partial<VehicleListItem> = {}): VehicleListItem {
  return {
    id: 'v1',
    code: 'XM-001',
    name: 'Honda SH 150i 2023',
    plateNumber: '59X1-333.44',
    vehicleType: 'motorbike',
    serviceTypes: ['self_drive'],
    operationStatus: 'available',
    publicStatus: 'approved_public',
    weekdayPrice: '300000',
    weekendPrice: '350000',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  } as VehicleListItem;
}

function statsOf(over: Partial<VehicleStats> = {}): VehicleStats {
  return {
    vehicleId: 'v1',
    activeBookings: 2,
    completedBookings: 15,
    totalIncome: '12750000',
    totalExpense: '3200000',
    ...over,
  } as VehicleStats;
}

const META = { page: 1, limit: 20, total: 1, hasNext: false };

function setQuery(over: Partial<typeof query> = {}) {
  query.data = undefined;
  query.isError = false;
  query.isFetching = false;
  Object.assign(query, over);
}

function setStats(rows: VehicleStats[], over: Partial<typeof stats> = {}) {
  stats.byId = new Map(rows.map((row) => [row.vehicleId, row]));
  stats.isLoading = false;
  stats.isError = false;
  Object.assign(stats, over);
}

function grant(...permissions: Permission[]) {
  perms.granted = new Set<string>([PERMISSION.VEHICLE_VIEW, ...permissions]);
}

function renderPage() {
  return render(
    <App>
      <VehiclesPage />
    </App>,
  );
}

/** Các thẻ xe đang hiển thị. */
function cards(): HTMLElement[] {
  return within(screen.getByRole('list', { name: 'Danh sách xe' })).getAllByRole('listitem');
}

beforeEach(() => {
  nav.push.mockReset();
  nav.replace.mockReset();
  nav.params = new URLSearchParams();
  query.refetch.mockReset();
  viewport.mobile = false;
  fleet.data = { total: 32, available: 24, renting: 3, maintenance: 4, inactive: 1 };
  fleet.isLoading = false;
  fleet.isError = false;
  setQuery({ data: { items: [vehicle()], meta: META } });
  setStats([statsOf()]);
  // Mặc định: chưa có dữ liệu cảnh báo → thẻ phải dựng được mà không bịa gì (Wave 8).
  alerts.byId = new Map();
  alerts.isLoading = false;
  alerts.isError = false;
  alerts.refetch = vi.fn();
  grant();
});

afterEach(cleanup);

/* ------------------------------------------------------------------ hình thái mặc định */

describe('/manage/vehicles — lưới thẻ là mặc định', () => {
  it('dựng lưới thẻ, không còn bảng nào', () => {
    renderPage();

    expect(screen.getByRole('list', { name: 'Danh sách xe' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

/* ------------------------------------------------------------------ nội dung thẻ */

describe('/manage/vehicles — nội dung thẻ', () => {
  it('định danh: tên, mã, biển số', () => {
    renderPage();

    const card = cards()[0]!;
    expect(within(card).getByText('Honda SH 150i 2023')).toBeTruthy();
    expect(within(card).getByText('XM-001 · 59X1-333.44')).toBeTruthy();
  });

  it('không có ảnh: vẫn dựng được thẻ, không để ảnh vỡ', () => {
    setQuery({ data: { items: [vehicle({ mainImageUrl: null })], meta: META } });
    renderPage();

    const card = cards()[0]!;
    expect(within(card).getByText('Honda SH 150i 2023')).toBeTruthy();
    expect(within(card).queryByRole('img')).toBeNull();
  });

  it('cả hai trục trạng thái đều hiện', () => {
    renderPage();

    const card = cards()[0]!;
    expect(within(card).getByText('Sẵn sàng')).toBeTruthy();
    expect(within(card).getByText('Đã duyệt public')).toBeTruthy();
  });

  it('số đơn đang chạy và đã hoàn thành lấy từ API', () => {
    renderPage();

    const card = cards()[0]!;
    expect(within(card).getByText('Đang chạy')).toBeTruthy();
    expect(within(card).getByText('2')).toBeTruthy();
    expect(within(card).getByText('Hoàn thành')).toBeTruthy();
    expect(within(card).getByText('15')).toBeTruthy();
  });

  it('lợi nhuận tính từ tổng doanh thu trừ tổng chi phí, KHÔNG trộn phạm vi', () => {
    renderPage();

    const card = cards()[0]!;
    expect(within(card).getByText('Tổng doanh thu')).toBeTruthy();
    expect(within(card).getByText('12.750.000 ₫')).toBeTruthy();
    expect(within(card).getByText('Tổng chi phí')).toBeTruthy();
    expect(within(card).getByText('3.200.000 ₫')).toBeTruthy();
    // 12.750.000 − 3.200.000
    expect(within(card).getByText('Lợi nhuận thực tế')).toBeTruthy();
    expect(within(card).getByText('9.550.000 ₫')).toBeTruthy();
  });

  it('chi nhiều hơn thu: giữ nhãn, số mang DẤU ÂM và tô đỏ (Figma `236:2060`)', () => {
    setStats([statsOf({ totalIncome: '1000000', totalExpense: '1500000' })]);
    renderPage();

    const card = cards()[0]!;
    expect(within(card).getByText('Lợi nhuận thực tế')).toBeTruthy();
    expect(within(card).getByText('-500.000 ₫')).toBeTruthy();
  });

  it('thẻ hiện giá ngày thường và cuối tuần từ bản ghi xe', () => {
    renderPage();

    const card = cards()[0]!;
    expect(within(card).getByText('Giá ngày thường')).toBeTruthy();
    expect(within(card).getByText('300.000 ₫')).toBeTruthy();
    expect(within(card).getByText('Giá cuối tuần')).toBeTruthy();
    expect(within(card).getByText('350.000 ₫')).toBeTruthy();
  });

  it('xe chưa có giá: ô giá là "—", không phải 0 giả', () => {
    setQuery({
      data: { items: [vehicle({ weekdayPrice: null, weekendPrice: null })], meta: META },
    });
    renderPage();

    const card = cards()[0]!;
    expect(within(card).getByText('Giá ngày thường')).toBeTruthy();
    expect(within(card).queryByText('0 ₫')).toBeNull();
  });

  it('tiền đi qua bộ format, không phải số thô', () => {
    renderPage();

    expect(within(cards()[0]!).queryByText('12750000')).toBeNull();
  });

  it('KHÔNG hiện hai nhãn khác nhau cho cùng một con số', () => {
    renderPage();

    const card = cards()[0]!;
    // Chỉ có chỉ số luỹ kế; không dựng "Doanh thu"/"Chi phí" theo kỳ khi backend chưa hỗ trợ.
    expect(within(card).queryByText('Doanh thu')).toBeNull();
    expect(within(card).queryByText('Chi phí')).toBeNull();
  });
});

/* ------------------------------------------------------------------ quyền tài chính */

describe('/manage/vehicles — quyền tài chính', () => {
  it('thiếu `finance.view`: API không trả số tiền → thẻ không dựng phần tài chính', () => {
    // Backend bỏ hẳn hai trường khi thiếu quyền; thẻ phải chịu được điều đó.
    setStats([statsOf({ totalIncome: undefined, totalExpense: undefined })]);
    renderPage();

    const card = cards()[0]!;
    expect(within(card).queryByText('Tổng doanh thu')).toBeNull();
    expect(within(card).queryByText('Tổng chi phí')).toBeNull();
    expect(within(card).queryByText('Lợi nhuận thực tế')).toBeNull();
  });

  it('thiếu quyền tài chính nhưng đơn hàng và định danh vẫn dùng được', () => {
    setStats([statsOf({ totalIncome: undefined, totalExpense: undefined })]);
    renderPage();

    const card = cards()[0]!;
    expect(within(card).getByText('Đang chạy')).toBeTruthy();
    expect(within(card).getByText('Honda SH 150i 2023')).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ trạng thái */

describe('/manage/vehicles — trạng thái lưới thẻ', () => {
  it('đang tải lần đầu: skeleton, chưa nói "chưa có xe"', () => {
    setQuery({ isFetching: true });
    renderPage();

    expect(screen.getByRole('status', { name: 'Đang tải danh sách xe' })).toBeTruthy();
    expect(screen.queryByText('Chưa có xe nào')).toBeNull();
  });

  it('số liệu hỏng KHÔNG làm hỏng thẻ — xe vẫn xem và thao tác được', () => {
    setStats([], { isError: true });
    renderPage();

    const card = cards()[0]!;
    expect(within(card).getByText('Không tải được số liệu')).toBeTruthy();
    expect(within(card).getByText('Honda SH 150i 2023')).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Xem chi tiết' })).toBeTruthy();
  });

  it('số liệu hỏng KHÔNG hiện số 0 giả', () => {
    setStats([], { isError: true });
    renderPage();

    const card = cards()[0]!;
    expect(within(card).queryByText('Đang chạy')).toBeNull();
  });

  it('rỗng và KHÔNG lọc: câu chữ "chưa có xe"', () => {
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.getByText('Chưa có xe nào')).toBeTruthy();
  });

  it('không có kết quả khi ĐANG lọc: câu chữ khác hẳn và có lối xoá lọc', () => {
    nav.params = new URLSearchParams('q=zzz');
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.getByText('Không tìm thấy kết quả')).toBeTruthy();
    // Hai nút cùng tên: một của FilterBar, một trong khối không-kết-quả. Phân biệt bằng landmark
    // `role="search"` của thanh lọc, không bằng thứ tự DOM.
    const filterBar = screen.getByRole('search');
    const outside = screen
      .getAllByRole('button', { name: 'Xoá bộ lọc' })
      .filter((button) => !filterBar.contains(button));
    expect(outside).toHaveLength(1);
  });

  it('lỗi tải danh sách: hiện lỗi kèm nút thử lại', () => {
    setQuery({ isError: true });
    renderPage();

    expect(screen.getByText('Không tải được danh sách xe')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Thử lại/ }));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ hành động */

describe('/manage/vehicles — hành động trên thẻ', () => {
  it('chỉ có quyền xem: còn Xem chi tiết và Lịch, không có Sửa/Xoá', () => {
    renderPage();

    const card = cards()[0]!;
    expect(within(card).getByRole('button', { name: 'Xem chi tiết' })).toBeTruthy();
    expect(within(card).queryByRole('button', { name: 'Sửa' })).toBeNull();
    expect(within(card).queryByRole('button', { name: 'Xoá' })).toBeNull();
  });

  it('có quyền sửa: đủ ba hành động, mỗi cái có tên khả truy cập', () => {
    grant(PERMISSION.VEHICLE_UPDATE);
    renderPage();

    const labels = within(cards()[0]!)
      .getAllByRole('button')
      .map((button) => button.textContent);

    // Nhãn đầy đủ ở thẻ desktop (Figma `236:1820` "Xem chi tiết").
    expect(labels).toEqual(['Xem chi tiết', 'Sửa', 'Lịch']);
  });

  it('"Xem chi tiết" mở trang chi tiết đúng id', () => {
    renderPage();
    fireEvent.click(within(cards()[0]!).getByRole('button', { name: 'Xem chi tiết' }));

    expect(nav.push).toHaveBeenCalledWith('/manage/vehicles/v1');
  });

  it('"Sửa" mở trang sửa đúng id', () => {
    grant(PERMISSION.VEHICLE_UPDATE);
    renderPage();
    fireEvent.click(within(cards()[0]!).getByRole('button', { name: 'Sửa' }));

    expect(nav.push).toHaveBeenCalledWith('/manage/vehicles/v1/edit');
  });

  it('"Lịch" mở màn lịch đã lọc sẵn về đúng xe', () => {
    renderPage();
    fireEvent.click(within(cards()[0]!).getByRole('button', { name: 'Lịch' }));

    expect(nav.push).toHaveBeenCalledWith('/manage/calendar?q=59X1-333.44');
  });

  it('xe chưa có biển số: lịch lọc theo tên xe', () => {
    setQuery({ data: { items: [vehicle({ plateNumber: null })], meta: META } });
    renderPage();
    fireEvent.click(within(cards()[0]!).getByRole('button', { name: 'Lịch' }));

    expect(nav.push.mock.calls.at(-1)?.[0]).toContain('q=Honda+SH+150i+2023');
  });

  it('KHÔNG có "Xoá" trên thẻ dù đủ quyền — xoá chỉ nằm trong Hồ sơ 360 (bản chỉnh 11/08/2026)', () => {
    grant(PERMISSION.VEHICLE_UPDATE, PERMISSION.VEHICLE_DELETE);
    renderPage();

    expect(within(cards()[0]!).queryByRole('button', { name: 'Xoá' })).toBeNull();
  });
});

/* ------------------------------------------------------------------ mobile */

/**
 * Ở ≤640px Figma `186:2374` vẽ một hình thái KHÁC — hàng ngang, ảnh 80×60 bên trái, chỉ số gộp
 * một dòng rút gọn. Test khoá đúng điểm đó: cùng dữ liệu, cùng bộ hành động, khác cách trình bày.
 */
describe('/manage/vehicles — hàng ngang ở mobile', () => {
  beforeEach(() => {
    viewport.mobile = true;
  });

  it('vẫn là một danh sách xe, dựng từ cùng nguồn dữ liệu', () => {
    renderPage();

    expect(cards()).toHaveLength(1);
    expect(within(cards()[0]!).getByText('Honda SH 150i 2023')).toBeTruthy();
  });

  it('gộp mã, biển số và loại/dịch vụ vào MỘT dòng', () => {
    renderPage();

    expect(within(cards()[0]!).getByText('XM-001 · 59X1-333.44 · Xe máy / Tự lái')).toBeTruthy();
  });

  it('tiền rút gọn để lọt một dòng, KHÔNG phải dạng đầy đủ của desktop', () => {
    renderPage();

    const card = within(cards()[0]!);
    expect(card.getByText('12,7tr')).toBeTruthy();
    expect(card.getByText('9,5tr')).toBeTruthy();
    expect(card.queryByText('12.750.000 ₫')).toBeNull();
  });

  it('đủ bộ hành động như desktop — không cắt bớt quyền ở màn nhỏ', () => {
    grant(PERMISSION.VEHICLE_UPDATE, PERMISSION.VEHICLE_DELETE);
    renderPage();

    const labels = within(cards()[0]!)
      .getAllByRole('button')
      .map((button) => button.textContent);

    expect(labels).toEqual(['Xem', 'Sửa', 'Lịch']);
  });

  it('số liệu hỏng ở mobile cũng không dựng số 0 giả', () => {
    setStats([], { isError: true });
    renderPage();

    expect(within(cards()[0]!).getByText('Không tải được số liệu')).toBeTruthy();
  });

  it('dải chỉ số đội xe: tổng / sẵn sàng / đang thuê từ API, không phụ thuộc trang', () => {
    renderPage();

    const bar = screen.getByLabelText('Chỉ số đội xe');
    expect(within(bar).getByText('Tổng số xe')).toBeTruthy();
    expect(within(bar).getByText('32 xe')).toBeTruthy();
    expect(within(bar).getByText('Sẵn sàng')).toBeTruthy();
    expect(within(bar).getByText('24 xe')).toBeTruthy();
    expect(within(bar).getByText('Đang thuê')).toBeTruthy();
    expect(within(bar).getByText('3 xe')).toBeTruthy();
  });

  it('dải chỉ số hỏng: tự ẩn, danh sách vẫn dựng bình thường', () => {
    fleet.data = undefined;
    fleet.isError = true;
    renderPage();

    expect(screen.queryByLabelText('Chỉ số đội xe')).toBeNull();
    expect(cards()).toHaveLength(1);
  });

  it('chip trạng thái ghi vào CÙNG filter URL với dropdown "Vận hành" (ADR 0004)', () => {
    renderPage();

    const chips = screen.getByRole('group', { name: 'Lọc theo trạng thái vận hành' });
    fireEvent.click(within(chips).getByRole('button', { name: 'Bảo dưỡng' }));

    expect(String(nav.replace.mock.calls.at(-1)?.[0])).toContain('operationStatus=maintenance');
  });

  it('chip "Tất cả" đang bật khi không lọc — và có trạng thái bật cho trình đọc', () => {
    renderPage();

    const chips = screen.getByRole('group', { name: 'Lọc theo trạng thái vận hành' });
    expect(within(chips).getByRole('button', { name: 'Tất cả' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('desktop KHÔNG dựng dải chỉ số và hàng chip — hai khối là của mobile', () => {
    viewport.mobile = false;
    renderPage();

    expect(screen.queryByLabelText('Chỉ số đội xe')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Lọc theo trạng thái vận hành' })).toBeNull();
  });
});

/* ------------------------------------------------------ việc cần làm & KM (Wave 8) */

describe('/manage/vehicles — cảnh báo và KM trên thẻ', () => {
  /** Cảnh báo do SERVER tính; thẻ chỉ hiển thị, không tự suy ra. */
  function withAlerts(items: unknown[], currentOdometerKm: number | null = 45_230) {
    alerts.byId = new Map([['v1', { vehicleId: 'v1', currentOdometerKm, alerts: items }]]);
  }

  it('KM hiện tại lấy từ cảnh báo/KM của server, có định dạng', () => {
    withAlerts([]);
    renderPage();

    const card = cards()[0]!;
    expect(within(card).getByText('45.230 km')).toBeTruthy();
  });

  it('chưa có KM: nói "Chưa có", KHÔNG dựng 0 km giả (docs §9)', () => {
    withAlerts([], null);
    renderPage();

    const card = cards()[0]!;
    expect(within(card).getByText('Chưa có')).toBeTruthy();
    expect(within(card).queryByText('0 km')).toBeNull();
  });

  it('cảnh báo hiện dưới dạng chip có NHÃN CHỮ, không chỉ dựa vào màu', () => {
    withAlerts([
      { kind: 'missing_return_odometer', severity: 'critical', title: 'Thiếu KM trả', count: 1 },
      { kind: 'document_expiring', severity: 'warning', title: 'Có giấy tờ sắp hết hạn', count: 2 },
    ]);
    renderPage();

    const card = cards()[0]!;
    const chips = within(card).getByRole('list', { name: 'Cảnh báo của xe' });
    expect(within(chips).getByText('Thiếu KM trả')).toBeTruthy();
    expect(within(chips).getByText('Giấy tờ sắp hết hạn (2)')).toBeTruthy();
    // Mức nghiêm trọng cũng nói ra cho trình đọc màn hình.
    expect(within(chips).getByLabelText(/Nghiêm trọng: Thiếu KM trả/)).toBeTruthy();
  });

  it('không có cảnh báo: KHÔNG dựng khối rỗng trên thẻ', () => {
    withAlerts([]);
    renderPage();

    const card = cards()[0]!;
    expect(within(card).queryByRole('list', { name: 'Cảnh báo của xe' })).toBeNull();
  });

  it('cảnh báo chưa tải xong: thẻ vẫn dùng được, không hiện cảnh báo giả', () => {
    alerts.byId = new Map();
    renderPage();

    const card = cards()[0]!;
    expect(within(card).getByText('Honda SH 150i 2023')).toBeTruthy();
    expect(within(card).queryByRole('list', { name: 'Cảnh báo của xe' })).toBeNull();
  });

  it('mọi thẻ dùng CÙNG một tỉ lệ khung ảnh — ảnh dọc không kéo cao thẻ', () => {
    const css = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '../../../../features/vehicles/components/VehicleManagementCard.module.css',
      ),
      'utf8',
    );
    const media = css.slice(css.indexOf('.media {'), css.indexOf('.mediaFallback'));
    expect(media).toContain('aspect-ratio');
    expect(media).toContain('overflow: hidden');
    // Ảnh phủ kín khung cố định thay vì tự quyết chiều cao.
    expect(css).toContain('object-fit: cover');
    expect(css).toContain('position: absolute');
  });
});

/* ------------------------------------------- trạng thái tải/hỏng của cảnh báo (Wave 8.1) */

describe('/manage/vehicles — cảnh báo hỏng KHÔNG được giống "không có việc"', () => {
  it('đang tải: skeleton ở vùng cảnh báo, chưa kết luận gì', () => {
    alerts.isLoading = true;
    const view = renderPage();

    const card = cards()[0]!;
    expect(card.querySelector('.ant-skeleton')).toBeTruthy();
    expect(within(card).queryByText('Không tải được cảnh báo')).toBeNull();
    expect(view.container.textContent).not.toContain('Không tải được cảnh báo của xe');
  });

  it('gọi hỏng: thẻ nói KHÔNG BIẾT, KM là "Không rõ", và có dải thử lại ở đầu lưới', () => {
    alerts.isError = true;
    renderPage();

    const card = cards()[0]!;
    expect(within(card).getByText('Không tải được cảnh báo')).toBeTruthy();
    // KM hỏng khác hẳn "xe chưa từng ghi nhận KM".
    expect(within(card).getByText('Không rõ')).toBeTruthy();
    expect(within(card).queryByText('Chưa có')).toBeNull();

    expect(screen.getByText('Không tải được cảnh báo của xe')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Thử lại/ })).toBeTruthy();
  });

  it('bấm thử lại gọi lại đúng query cảnh báo, không tải lại cả trang', () => {
    alerts.isError = true;
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Thử lại/ }));
    expect(alerts.refetch).toHaveBeenCalled();
    expect(query.refetch).not.toHaveBeenCalled();
  });

  it('tải xong và rỗng: KHÔNG dựng "0 cảnh báo" giả, cũng không báo lỗi', () => {
    alerts.byId = new Map([['v1', { vehicleId: 'v1', currentOdometerKm: 45_230, alerts: [] }]]);
    renderPage();

    const card = cards()[0]!;
    expect(within(card).queryByText('Không tải được cảnh báo')).toBeNull();
    expect(within(card).queryByRole('list', { name: 'Cảnh báo của xe' })).toBeNull();
    expect(within(card).queryByText(/0 cảnh báo/)).toBeNull();
    expect(within(card).getByText('45.230 km')).toBeTruthy();
  });

  it('mobile: hàng gọn dùng ĐÚNG ba trạng thái đó', () => {
    viewport.mobile = true;
    alerts.isError = true;
    renderPage();

    expect(screen.getAllByText('Không tải được cảnh báo').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Thử lại/ })).toBeTruthy();
  });
});
