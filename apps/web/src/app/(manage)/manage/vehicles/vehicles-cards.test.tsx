import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const deleteVehicle = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  variables: undefined as string | undefined,
}));

vi.mock('@/features/vehicles/hooks/use-vehicle-mutations', () => ({
  useDeleteVehicle: () => deleteVehicle,
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
    serviceType: 'self_drive',
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
  deleteVehicle.mutate.mockReset();
  deleteVehicle.isPending = false;
  viewport.mobile = false;
  setQuery({ data: { items: [vehicle()], meta: META } });
  setStats([statsOf()]);
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

  it('lãi luỹ kế tính từ tổng thu trừ tổng chi, KHÔNG trộn phạm vi', () => {
    renderPage();

    const card = cards()[0]!;
    expect(within(card).getByText('12.750.000 ₫')).toBeTruthy();
    expect(within(card).getByText('3.200.000 ₫')).toBeTruthy();
    // 12.750.000 − 3.200.000
    expect(within(card).getByText('Lãi luỹ kế')).toBeTruthy();
    expect(within(card).getByText('9.550.000 ₫')).toBeTruthy();
  });

  it('chi nhiều hơn thu: đổi nhãn thành "Lỗ luỹ kế", không hiện số âm', () => {
    // Nhãn đã nói "Lỗ" — thêm dấu trừ là phủ định hai lần, đọc ra thành "lỗ âm 500 nghìn".
    setStats([statsOf({ totalIncome: '1000000', totalExpense: '1500000' })]);
    renderPage();

    const card = cards()[0]!;
    expect(within(card).getByText('Lỗ luỹ kế')).toBeTruthy();
    expect(within(card).getByText('500.000 ₫')).toBeTruthy();
    expect(within(card).queryByText('-500.000 ₫')).toBeNull();
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
    expect(within(card).queryByText('Tổng thu')).toBeNull();
    expect(within(card).queryByText('Tổng chi')).toBeNull();
    expect(within(card).queryByText(/Lãi luỹ kế|Lỗ luỹ kế/)).toBeNull();
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
    expect(within(card).getByRole('button', { name: 'Xem' })).toBeTruthy();
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
  it('chỉ có quyền xem: còn Xem và Lịch, không có Sửa/Xoá', () => {
    renderPage();

    const card = cards()[0]!;
    expect(within(card).getByRole('button', { name: 'Xem' })).toBeTruthy();
    expect(within(card).queryByRole('button', { name: 'Sửa' })).toBeNull();
    expect(within(card).queryByRole('button', { name: 'Xoá' })).toBeNull();
  });

  it('có quyền sửa và xoá: đủ bốn hành động, mỗi cái có tên khả truy cập', () => {
    grant(PERMISSION.VEHICLE_UPDATE, PERMISSION.VEHICLE_DELETE);
    renderPage();

    const labels = within(cards()[0]!)
      .getAllByRole('button')
      .map((button) => button.textContent);

    expect(labels).toEqual(['Xem', 'Sửa', 'Lịch', 'Xoá']);
  });

  it('"Xem" mở trang chi tiết đúng id', () => {
    renderPage();
    fireEvent.click(within(cards()[0]!).getByRole('button', { name: 'Xem' }));

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

  it('xoá phải xác nhận trước, và hộp xác nhận nêu đích danh xe', async () => {
    grant(PERMISSION.VEHICLE_DELETE);
    renderPage();

    fireEvent.click(within(cards()[0]!).getByRole('button', { name: 'Xoá' }));
    expect(deleteVehicle.mutate).not.toHaveBeenCalled();

    expect(await screen.findByText('Xoá xe "Honda SH 150i 2023"?')).toBeTruthy();
    expect(screen.getByText(/Không xoá được nếu còn lịch thuê/)).toBeTruthy();

    // Nút xác nhận của Popconfirm trùng tên với nút hành động — lấy nút CUỐI (nút vừa mở ra).
    const confirmButtons = screen.getAllByRole('button', { name: 'Xoá' });
    fireEvent.click(confirmButtons.at(-1)!);
    await waitFor(() => expect(deleteVehicle.mutate).toHaveBeenCalledTimes(1));
    expect(deleteVehicle.mutate.mock.calls[0]![0]).toBe('v1');
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

    expect(labels).toEqual(['Xem', 'Sửa', 'Lịch', 'Xoá']);
  });

  it('số liệu hỏng ở mobile cũng không dựng số 0 giả', () => {
    setStats([], { isError: true });
    renderPage();

    expect(within(cards()[0]!).getByText('Không tải được số liệu')).toBeTruthy();
  });
});
