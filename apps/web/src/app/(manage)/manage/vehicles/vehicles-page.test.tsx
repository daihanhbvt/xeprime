import { App } from 'antd';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION, type Permission } from '@xeprime/types';

import type { VehicleListItem } from '@/features/vehicles/types';

import VehiclesPage from './page';

/**
 * Test ĐẶC TẢ (characterization) cho `/manage/vehicles` — viết TRƯỚC Wave 1C.
 *
 * Mục đích: khoá lại HÀNH VI NGHIỆP VỤ đang chạy, để khi `DataTable`/`EmptyState`/`FilterBar`
 * thay phần khung thì mọi khác biệt lộ ra thành test đỏ thay vì lọt ra production.
 *
 * Nguyên tắc viết (chỉ thị Batch 1C-A mục 9 + 10):
 *  - Khẳng định trên **hợp đồng nghiệp vụ**: filter nào tới API, URL ghi gì, câu chữ nào hiện,
 *    quyền nào mở nút, callback nào chạy với id nào.
 *  - KHÔNG khẳng định trên cấu trúc DOM tình cờ của AntD (class, thứ tự `<td>`, `<tr>` id).
 *  - KHÔNG sửa lỗi phát hiện được. Chỗ nào hành vi hiện tại đáng ngờ thì test **ghi lại đúng
 *    hiện trạng** và có ghi chú `HIỆN TRẠNG` — Wave 1C sẽ quyết định, không phải file này.
 *
 * Trang này là bản chuẩn nhất của pattern danh sách (00 §5), nên nó cũng là mốc so sánh cho
 * 13 trang còn lại.
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
  /** Filter mà trang thực sự truyền xuống lớp dữ liệu — hợp đồng cần khoá. */
  lastFilters: undefined as unknown,
}));

vi.mock('@/features/vehicles/hooks/use-vehicles', () => ({
  useVehicles: (filters: unknown) => {
    query.lastFilters = filters;
    return query;
  },
}));

/** Lưới thẻ gọi thật `useQuery`; harness này không có QueryClientProvider nên mock ở đây. */
vi.mock('@/features/vehicles/hooks/use-vehicle-card-stats', () => ({
  useVehicleCardStats: () => ({ byId: new Map(), isLoading: false, isError: false }),
}));
vi.mock('@/features/vehicles/hooks/use-vehicle-alerts', () => ({
  useVehicleAlerts: () => ({ byId: new Map(), isLoading: false, isError: false }),
  useInvalidateVehicleSurfaces: () => vi.fn(),
}));

/**
 * Bộ này khoá hành vi **cấp trang**: lọc, tìm kiếm, sắp xếp, phân trang, quyền và các trạng
 * thái. Nội dung/hành động bên trong một thẻ nằm ở `vehicles-cards.test.tsx`.
 *
 * Chế độ bảng đã bị gỡ ở Wave 3B-R1 — Figma `185:4474` đánh dấu các màn bảng là ĐÃ THAY THẾ
 * bởi lưới thẻ, nên không còn `view=table` để khoá.
 */
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
    weekdayPrice: '350000',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

const META = { page: 1, limit: 20, total: 1, hasNext: false };

function setQuery(over: Partial<typeof query> = {}) {
  query.data = undefined;
  query.isError = false;
  query.isFetching = false;
  Object.assign(query, over);
}

/**
 * Cấp quyền cho lượt render kế tiếp — **luôn kèm `VEHICLE_VIEW`**.
 *
 * Từ Pilot Wave 2, trang thay toàn bộ nội dung bằng màn 403 khi thiếu `vehicles.view`
 * (Figma `188:2290`). Không có quyền xem thì không có bảng, không có bộ lọc, không có gì để
 * kiểm — nên "xem được" là tiền đề của mọi test khác, đúng như thực tế: mục menu dẫn tới
 * trang này cũng đã gác bằng chính quyền đó.
 *
 * Test riêng cho màn 403 dùng `revokeAll()`.
 */
function grant(...permissions: Permission[]) {
  perms.granted = new Set<string>([PERMISSION.VEHICLE_VIEW, ...permissions]);
}

/** Không có quyền nào — kể cả quyền xem. */
function revokeAll() {
  perms.granted = new Set<string>();
}

function renderPage() {
  return render(
    <App>
      <VehiclesPage />
    </App>,
  );
}

/**
 * URL cuối cùng mà filter hook đã ghi (`router.replace`).
 *
 * ⚠️ Mọi test dùng hàm này PHẢI có ít nhất một khẳng định KHẲNG ĐỊNH (`toHaveBeenCalled` hoặc
 * `toContain`). Nếu tương tác không chạy thì kết quả là chuỗi rỗng, và `not.toContain(...)` một
 * mình sẽ đúng một cách vô nghĩa — test xanh mà không kiểm gì.
 *
 * ⚠️ GIỚI HẠN: `Select` của AntD 6 không chốt được lựa chọn dưới jsdom bằng sự kiện tổng hợp
 * (đã thử `click` trên `role="option"` và `ArrowDown`/`Enter`). Đường "đổi filter bằng dropdown"
 * vì vậy KHÔNG được phủ; hợp đồng tương đương được khoá qua ô tìm kiếm và nút "Xoá bộ lọc".
 */
function lastReplacedUrl(): string {
  const calls = nav.replace.mock.calls;
  return calls.length ? (calls[calls.length - 1]![0] as string) : '';
}

/**
 * Nút "Xoá bộ lọc" nằm TRONG vùng trạng thái rỗng, không phải nút cùng tên của `FilterBar`.
 *
 * Từ Pilot Wave 2 có HAI lối xoá lọc trên cùng màn hình, và cả hai đều đến từ Figma:
 * `FilterBar` dùng chung dựng một nút (bắt buộc cho bottom-sheet mobile — `58:2588`), còn
 * trạng thái không-có-kết-quả dựng một nút nữa ngay trong nội dung (`58:1563`). Phân biệt
 * bằng landmark `role="search"` của thanh lọc, không bằng thứ tự hay cấu trúc DOM.
 */
function stateClearButton(): HTMLElement {
  const filterBar = screen.getByRole('search');
  const outside = screen
    .getAllByRole('button', { name: 'Xoá bộ lọc' })
    .filter((button) => !filterBar.contains(button));
  expect(outside).toHaveLength(1);
  return outside[0]!;
}

/** Thẻ xe đang hiển thị — nhận diện bằng vai trò/nhãn, không bằng class AntD. */
function cards(): HTMLElement[] {
  return within(screen.getByRole('list', { name: 'Danh sách xe' })).getAllByRole('listitem');
}

beforeEach(() => {
  nav.push.mockReset();
  nav.replace.mockReset();
  nav.params = new URLSearchParams();
  query.refetch.mockReset();
  viewport.mobile = false;
  setQuery();
  grant();
});

afterEach(cleanup);

/* ------------------------------------------------------------------ trạng thái tải */

describe('/manage/vehicles — trạng thái tải', () => {
  it('lần tải đầu hiện skeleton, chưa nói "chưa có xe"', () => {
    // ĐỔI CÓ CHỦ ĐÍCH ở Wave 1C-E: trước đây dựng bảng rỗng kèm spinner; nay là skeleton
    // (Figma `134:2011` R1 — bố cục đã biết thì dùng skeleton).
    setQuery({ isFetching: true });
    renderPage();

    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByText('Chưa có xe nào')).toBeNull();
  });

  it('thanh lọc vẫn hiển thị trong lúc tải lại', () => {
    setQuery({ isFetching: true });
    renderPage();

    expect(screen.getByPlaceholderText('Tìm kiếm xe...')).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ lỗi + thử lại */

describe('/manage/vehicles — lỗi và khôi phục', () => {
  it('lỗi khi chưa có dữ liệu thì hiện thông báo lỗi kèm nút Thử lại', () => {
    setQuery({ isError: true });
    renderPage();

    expect(screen.getByText('Không tải được danh sách xe')).toBeTruthy();
    expect(screen.getByText('Có lỗi khi lấy dữ liệu. Vui lòng thử lại.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Danh sách xe' })).toBeNull();
  });

  it('nút Thử lại gọi refetch, không điều hướng đi đâu', () => {
    setQuery({ isError: true });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(query.refetch).toHaveBeenCalledTimes(1);
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('lỗi khi ĐÃ có dữ liệu (refetch nền hỏng) thì giữ bảng, không nháy màn lỗi', () => {
    // Đây là điều kiện `isError && !data` — điểm khác biệt then chốt so với các trang admin
    // dùng `isError` trần. Wave 1C gom về một hành vi, nên phải khoá lại từ đây.
    setQuery({ isError: true, data: { items: [vehicle()], meta: META } });
    renderPage();

    expect(screen.queryByText('Không tải được danh sách xe')).toBeNull();
    expect(screen.getByText('Honda SH 150i 2023')).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ rỗng vs không-kết-quả */

describe('/manage/vehicles — rỗng và không có kết quả', () => {
  it('không có xe và KHÔNG lọc: câu chữ "chưa có", không phải "không tìm thấy"', () => {
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.getByText('Chưa có xe nào')).toBeTruthy();
    expect(screen.queryByText('Không tìm thấy kết quả')).toBeNull();
  });

  it('rỗng + có quyền tạo: mở lối tạo xe đầu tiên', () => {
    grant(PERMISSION.VEHICLE_CREATE);
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Thêm xe đầu tiên/ }));
    expect(nav.push).toHaveBeenCalledWith('/manage/vehicles/new');
  });

  it('rỗng + KHÔNG có quyền tạo: không có nút tạo nào', () => {
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.queryByRole('button', { name: /Thêm xe đầu tiên/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Thêm xe/ })).toBeNull();
  });

  it('không có kết quả khi ĐANG lọc: câu chữ khác hẳn và có lối xoá lọc', () => {
    nav.params = new URLSearchParams('operationStatus=maintenance');
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.getByText('Không tìm thấy kết quả')).toBeTruthy();
    expect(screen.queryByText('Chưa có xe nào')).toBeNull();
    expect(stateClearButton()).toBeTruthy();
  });

  it('bất kỳ filter nào cũng đủ để chuyển sang trạng thái không-có-kết-quả', () => {
    for (const qs of [
      'q=abc',
      'vehicleType=car',
      'serviceType=self_drive',
      'publicStatus=hidden',
    ]) {
      cleanup();
      nav.params = new URLSearchParams(`${qs}`);
      setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
      renderPage();
      expect(screen.getByText('Không tìm thấy kết quả')).toBeTruthy();
    }
  });

  it('"Xoá bộ lọc" xoá đúng 5 tham số lọc và KHÔNG xoá sort', () => {
    // HIỆN TRẠNG: `sort` không nằm trong danh sách xoá — link sau khi xoá lọc vẫn giữ sắp xếp.
    nav.params = new URLSearchParams('q=abc&vehicleType=car&sort=price_asc&page=3');
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    fireEvent.click(stateClearButton());

    expect(nav.replace).toHaveBeenCalledTimes(1);
    const url = lastReplacedUrl();
    expect(url).toContain('sort=price_asc');
    expect(url).not.toContain('q=');
    expect(url).not.toContain('vehicleType=');
    expect(url).not.toContain('page=');
  });
});

/* ------------------------------------------------------------------ dữ liệu + quyền */

describe('/manage/vehicles — dữ liệu và quyền', () => {
  it('hiện tên, mã và biển số của xe', () => {
    setQuery({ data: { items: [vehicle()], meta: META } });
    renderPage();

    expect(screen.getByText('Honda SH 150i 2023')).toBeTruthy();
    expect(screen.getByText('XM-001 · 59X1-333.44')).toBeTruthy();
  });

  it('thẻ hiện giá thuê qua bộ format — bố cục Figma `236:1778` mang giá về thẻ', () => {
    setQuery({ data: { items: [vehicle({ weekdayPrice: '350000' })], meta: META } });
    renderPage();

    expect(screen.getByText('350.000 ₫')).toBeTruthy();
    expect(screen.queryByText('350000')).toBeNull();
  });

  it('không có quyền ghi: chỉ còn Xem và Lịch', () => {
    setQuery({ data: { items: [vehicle()], meta: META } });
    renderPage();

    const row = cards()[0]!;
    expect(within(row).getAllByRole('button')).toHaveLength(2);
  });

  it('có quyền sửa: thêm nút Sửa — nhưng KHÔNG có Xoá (xoá chỉ ở Hồ sơ 360)', () => {
    grant(PERMISSION.VEHICLE_UPDATE, PERMISSION.VEHICLE_DELETE);
    setQuery({ data: { items: [vehicle()], meta: META } });
    renderPage();

    const row = cards()[0]!;
    expect(within(row).getAllByRole('button')).toHaveLength(3);
  });

  it('quyền tạo mở nút "Thêm xe" ở đầu trang', () => {
    grant(PERMISSION.VEHICLE_CREATE);
    setQuery({ data: { items: [vehicle()], meta: META } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Thêm xe/ }));
    expect(nav.push).toHaveBeenCalledWith('/manage/vehicles/new');
  });

  it('mọi nút hành động trên thẻ ĐỀU có tên khả truy cập', () => {
    // D15.2 ĐÃ SỬA ở Wave 1C-E: `RowActions` bắt buộc `label` và biến nó thành `aria-label`.
    // Bản trước của test này khẳng định điều ngược lại (ghi nhận lỗ a11y đang tồn tại).
    grant(PERMISSION.VEHICLE_UPDATE, PERMISSION.VEHICLE_DELETE);
    setQuery({ data: { items: [vehicle()], meta: META } });
    renderPage();

    // Một lần quét duy nhất rồi so trên mảng nhãn: `getByRole` kèm `name` phải tính accessible
    // name cho cả cây con, gọi nhiều lần liên tiếp đủ chậm để vượt timeout khi chạy cả bộ test.
    const labels = within(cards()[0]!)
      .getAllByRole('button')
      .map((button) => button.textContent);

    expect(labels.every(Boolean)).toBe(true);
    // Không có "Xoá" dù đủ quyền — bản chỉnh 11/08/2026: xoá chỉ nằm trong Hồ sơ 360.
    expect(labels).toEqual(['Xem chi tiết', 'Sửa', 'Lịch']);
  });
});

/* ------------------------------------------------------------------ lọc, tìm, phân trang */

describe('/manage/vehicles — lọc, tìm kiếm, phân trang', () => {
  it('filter từ URL được truyền nguyên vẹn xuống lớp dữ liệu', () => {
    nav.params = new URLSearchParams(
      'q=sh&vehicleType=motorbike&serviceType=self_drive&operationStatus=available&publicStatus=hidden&sort=price_asc&page=2&limit=50',
    );
    setQuery({ data: { items: [vehicle()], meta: META } });
    renderPage();

    expect(query.lastFilters).toEqual({
      q: 'sh',
      vehicleType: 'motorbike',
      serviceType: 'self_drive',
      operationStatus: 'available',
      publicStatus: 'hidden',
      sort: 'price_asc',
      page: 2,
      limit: 50,
      // `view` đi cùng bộ filter vì nó cũng sống ở URL; lớp dữ liệu bỏ qua nó khi dựng query.
    });
  });

  it('ô tìm kiếm debounce 400ms rồi mới ghi vào URL', async () => {
    vi.useFakeTimers();
    try {
      setQuery({ data: { items: [vehicle()], meta: META } });
      renderPage();

      fireEvent.change(screen.getByPlaceholderText('Tìm kiếm xe...'), {
        target: { value: 'honda' },
      });

      vi.advanceTimersByTime(399);
      expect(nav.replace).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(lastReplacedUrl()).toContain('q=honda');
    } finally {
      vi.useRealTimers();
    }
  });

  it('đổi filter đưa danh sách về trang 1 và giữ nguyên sắp xếp', () => {
    // Đi qua ô tìm kiếm, không qua dropdown — xem ghi chú GIỚI HẠN ở `lastReplacedUrl`.
    vi.useFakeTimers();
    try {
      nav.params = new URLSearchParams('page=4&sort=price_asc');
      setQuery({ data: { items: [vehicle()], meta: META } });
      renderPage();

      fireEvent.change(screen.getByPlaceholderText('Tìm kiếm xe...'), {
        target: { value: 'honda' },
      });
      vi.advanceTimersByTime(400);

      expect(nav.replace).toHaveBeenCalledTimes(1);
      const url = lastReplacedUrl();
      expect(url).toContain('q=honda');
      expect(url).toContain('sort=price_asc');
      expect(url).not.toContain('page=');
    } finally {
      vi.useRealTimers();
    }
  });

  it('đổi trang giữ nguyên page trong URL và không reset', () => {
    setQuery({
      data: { items: [vehicle()], meta: { page: 1, limit: 20, total: 60, hasNext: true } },
    });
    renderPage();

    fireEvent.click(screen.getByTitle('2'));

    const url = lastReplacedUrl();
    expect(url).toContain('page=2');
    expect(url).toContain('limit=20');
  });

  it('chân khung nói rõ đang xem khoảng nào trên tổng bao nhiêu', () => {
    setQuery({ data: { items: [vehicle()], meta: { ...META, total: 245 } } });
    renderPage();

    expect(screen.getByText('Hiển thị 1-20 của 245 xe')).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ thanh lọc dùng chung */

describe('/manage/vehicles — dùng FilterBar dùng chung', () => {
  it('thanh lọc là landmark search dùng chung, không phải bản dựng riêng của Fleet', () => {
    setQuery({ data: { items: [vehicle()], meta: META } });
    renderPage();

    expect(screen.getByRole('search', { name: 'Bộ lọc danh sách' })).toBeTruthy();
  });

  it('đủ 5 điều khiển lọc của Fleet, mỗi cái có tên khả truy cập', () => {
    setQuery({ data: { items: [vehicle()], meta: META } });
    renderPage();

    const bar = within(screen.getByRole('search'));
    expect(bar.getByRole('textbox', { name: 'Tìm xe' })).toBeTruthy();
    for (const label of ['Loại xe', 'Dịch vụ', 'Vận hành', 'Công khai']) {
      expect(bar.getByRole('combobox', { name: label }), label).toBeTruthy();
    }
  });

  it('sắp xếp nằm NGOÀI cụm lọc và hiện đúng giá trị từ URL', () => {
    // `sort` không phải filter: nó không được đếm vào huy hiệu "Bộ lọc" và không bị "Xoá bộ lọc"
    // đụng tới. Figma cũng đặt nó tách ra (`186:1665`, lề phải hàng filter).
    nav.params = new URLSearchParams('sort=price_asc');
    setQuery({ data: { items: [vehicle()], meta: META } });
    renderPage();

    expect(screen.getByRole('combobox', { name: 'Sắp xếp' })).toBeTruthy();
    expect(screen.getByTitle('Giá thấp → cao')).toBeTruthy();
  });

  it('mặc định sắp xếp là "Mới nhất" khi URL không nói gì', () => {
    setQuery({ data: { items: [vehicle()], meta: META } });
    renderPage();

    expect(screen.getByTitle('Mới nhất')).toBeTruthy();
  });

  it('ô tìm kiếm hiện lại từ khoá đang có trên URL', () => {
    nav.params = new URLSearchParams('q=Honda');
    setQuery({ data: { items: [vehicle()], meta: META } });
    renderPage();

    expect(screen.getByRole('textbox', { name: 'Tìm xe' })).toHaveProperty('value', 'Honda');
  });
});

/* ------------------------------------------------------------------ quyền cấp trang */

describe('/manage/vehicles — thiếu quyền xem', () => {
  it('không có `vehicles.view`: thay TOÀN BỘ nội dung bằng màn 403 (Figma `188:2290`)', () => {
    revokeAll();
    setQuery({ data: { items: [vehicle()], meta: META } });
    renderPage();

    expect(screen.getByText('Không có quyền truy cập')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Danh sách xe' })).toBeNull();
    // Không dựng tiêu đề/bộ lọc cho một trang không xem được.
    expect(screen.queryByRole('heading', { name: 'Danh sách xe' })).toBeNull();
    expect(screen.queryByRole('search')).toBeNull();
  });

  it('màn 403 nói rõ quyền còn thiếu và có lối thoát an toàn', () => {
    revokeAll();
    renderPage();

    expect(screen.getByText(/Cần quyền:\s*vehicles\.view/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Về trang chủ/ }).getAttribute('href')).toBe('/manage');
  });

  it('màn 403 KHÔNG đẩy người dùng về trang đăng nhập', () => {
    // `134:2482`: 403 là "thiếu quyền", không phải "chưa đăng nhập".
    revokeAll();
    renderPage();

    expect(nav.push).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('có quyền xem nhưng không có quyền ghi: vẫn xem được danh sách, không có nút tạo', () => {
    grant();
    setQuery({ data: { items: [vehicle()], meta: META } });
    renderPage();

    expect(screen.getByRole('list', { name: 'Danh sách xe' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Thêm xe/ })).toBeNull();
  });
});
