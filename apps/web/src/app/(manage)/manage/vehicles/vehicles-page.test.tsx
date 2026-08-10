import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const deleteVehicle = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  variables: undefined as string | undefined,
}));

vi.mock('@/features/vehicles/hooks/use-vehicle-mutations', () => ({
  useDeleteVehicle: () => deleteVehicle,
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
 * (Figma `58:2061`). Không có quyền xem thì không có bảng, không có bộ lọc, không có gì để
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

/** Hàng dữ liệu của bảng — bỏ hàng tiêu đề, dùng vai trò chứ không dùng class AntD. */
function bodyRows(): HTMLElement[] {
  return screen
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('columnheader').length === 0);
}

beforeEach(() => {
  nav.push.mockReset();
  nav.replace.mockReset();
  nav.params = new URLSearchParams();
  query.refetch.mockReset();
  deleteVehicle.mutate.mockReset();
  deleteVehicle.isPending = false;
  deleteVehicle.variables = undefined;
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
    expect(screen.queryByText('Gian hàng chưa có xe nào')).toBeNull();
  });

  it('thanh lọc vẫn hiển thị trong lúc tải lại', () => {
    setQuery({ isFetching: true });
    renderPage();

    expect(screen.getByPlaceholderText('Tìm theo tên, mã, biển số, hãng…')).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ lỗi + thử lại */

describe('/manage/vehicles — lỗi và khôi phục', () => {
  it('lỗi khi chưa có dữ liệu thì hiện thông báo lỗi kèm nút Thử lại', () => {
    setQuery({ isError: true });
    renderPage();

    expect(screen.getByText('Không tải được danh sách xe')).toBeTruthy();
    expect(screen.getByText('Có lỗi khi lấy dữ liệu. Vui lòng thử lại.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
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

    expect(screen.getByText('Gian hàng chưa có xe nào')).toBeTruthy();
    expect(screen.queryByText('Không tìm thấy xe khớp bộ lọc')).toBeNull();
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

    expect(screen.getByText('Không tìm thấy xe khớp bộ lọc')).toBeTruthy();
    expect(screen.queryByText('Gian hàng chưa có xe nào')).toBeNull();
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
      nav.params = new URLSearchParams(qs);
      setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
      renderPage();
      expect(screen.getByText('Không tìm thấy xe khớp bộ lọc')).toBeTruthy();
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

  it('tiền hiển thị qua formatMoneyVnd, không phải số thô', () => {
    setQuery({ data: { items: [vehicle({ weekdayPrice: '350000' })], meta: META } });
    renderPage();

    expect(screen.getByText(/350\.000 ₫/)).toBeTruthy();
    expect(screen.queryByText('350000')).toBeNull();
  });

  it('không có quyền: mỗi hàng chỉ còn một hành động (Xem)', () => {
    setQuery({ data: { items: [vehicle()], meta: META } });
    renderPage();

    const row = bodyRows()[0]!;
    expect(within(row).getAllByRole('button')).toHaveLength(1);
  });

  it('có quyền sửa và xoá: mỗi hàng có ba hành động', () => {
    grant(PERMISSION.VEHICLE_UPDATE, PERMISSION.VEHICLE_DELETE);
    setQuery({ data: { items: [vehicle()], meta: META } });
    renderPage();

    const row = bodyRows()[0]!;
    expect(within(row).getAllByRole('button')).toHaveLength(3);
  });

  it('quyền tạo mở nút "Thêm xe" ở đầu trang', () => {
    grant(PERMISSION.VEHICLE_CREATE);
    setQuery({ data: { items: [vehicle()], meta: META } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Thêm xe/ }));
    expect(nav.push).toHaveBeenCalledWith('/manage/vehicles/new');
  });

  it('mọi nút hành động trong bảng ĐỀU có tên khả truy cập', () => {
    // D15.2 ĐÃ SỬA ở Wave 1C-E: `RowActions` bắt buộc `label` và biến nó thành `aria-label`.
    // Bản trước của test này khẳng định điều ngược lại (ghi nhận lỗ a11y đang tồn tại).
    grant(PERMISSION.VEHICLE_UPDATE, PERMISSION.VEHICLE_DELETE);
    setQuery({ data: { items: [vehicle()], meta: META } });
    renderPage();

    // Một lần quét duy nhất rồi so trên mảng nhãn: `getByRole` kèm `name` phải tính accessible
    // name cho cả cây con, gọi bốn lần liên tiếp đủ chậm để vượt timeout khi chạy cả bộ test.
    const labels = within(bodyRows()[0]!)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));

    expect(labels.every(Boolean)).toBe(true);
    expect(labels).toEqual(['Xem', 'Sửa', 'Xoá']);
  });
});

/* ------------------------------------------------------------------ hình học cột */

/**
 * Hồi quy cho lỗi "cột Xe rộng bất thường".
 *
 * `scroll={{ x }}` bật `table-layout: fixed`. Cột nào thiếu `width` trở thành cột `auto` duy
 * nhất và nuốt trọn phần dư của bảng — ở màn rộng, cột "Xe" từng chiếm ~800/1650px. Khi mọi
 * cột có `width`, phần dư chia theo tỷ lệ nên bố cục giữ đúng tỷ lệ của Figma `58:5`.
 *
 * Test đọc `<colgroup>` — hợp đồng bố cục thật của bảng — chứ không đọc class sinh tự động.
 */
describe('/manage/vehicles — hình học cột bảng', () => {
  function cols(container: HTMLElement): HTMLTableColElement[] {
    return Array.from(container.querySelectorAll('colgroup col'));
  }

  it('MỌI cột đều khai bề rộng — không còn cột `auto` nuốt phần dư', () => {
    setQuery({ data: { items: [vehicle()], meta: META } });
    const { container } = renderPage();

    const widths = cols(container).map((col) => col.style.width);

    expect(widths).toHaveLength(7);
    expect(widths.every((width) => width.endsWith('px'))).toBe(true);
  });

  it('cột định danh KHÔNG được rộng hơn nửa bảng', () => {
    setQuery({ data: { items: [vehicle()], meta: META } });
    const { container } = renderPage();

    const widths = cols(container).map((col) => Number.parseInt(col.style.width, 10));
    const total = widths.reduce((sum, width) => sum + width, 0);

    // Figma `58:5`: cột "Xe" chiếm 260/1136 ≈ 23%. Ngưỡng 40% chỉ để chặn hồi quy "nuốt phần dư".
    expect(widths[0]! / total).toBeLessThan(0.4);
  });

  it('sàn bề rộng bảng = tổng bề rộng các cột (không có số cứng lệch nhau)', () => {
    setQuery({ data: { items: [vehicle()], meta: META } });
    const { container } = renderPage();

    const total = cols(container).reduce(
      (sum, col) => sum + Number.parseInt(col.style.width, 10),
      0,
    );
    const table = container.querySelector('table');

    expect(table?.style.width).toBe(`${total}px`);
  });

  it('cột hành động vẫn dính phải khi bảng cuộn ngang', () => {
    // `127:2060` R1: cuộn ngang mà mất nút thao tác là hỏng. Bám vào class `-fix-end` của AntD 6
    // vì đó chính là cơ chế dính — `DataTable.module.css` cũng tô nền đục qua đúng class này.
    grant(PERMISSION.VEHICLE_UPDATE, PERMISSION.VEHICLE_DELETE);
    setQuery({ data: { items: [vehicle()], meta: META } });
    const { container } = renderPage();

    const headers = Array.from(container.querySelectorAll('thead th'));
    // Không dùng `tbody tr:first-child`: AntD chèn một hàng đo `aria-hidden` lên đầu tbody.
    const lastCell = within(bodyRows()[0]!).getAllByRole('cell').at(-1)!;

    expect(headers.at(-1)?.className).toMatch(/ant-table-cell-fix-end/);
    expect(lastCell.className).toMatch(/ant-table-cell-fix-end/);
    // Và đó phải là cột CHỨA hành động, không phải một cột rỗng dính nhầm (`127:2076` R10).
    expect(within(lastCell).getAllByRole('button')).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------ hành động hàng */

describe('/manage/vehicles — hành động trên hàng', () => {
  it('bấm vào hàng mở trang chi tiết đúng id', () => {
    setQuery({ data: { items: [vehicle({ id: 'v-99' })], meta: META } });
    renderPage();

    fireEvent.click(screen.getByText('Honda SH 150i 2023'));
    expect(nav.push).toHaveBeenCalledWith('/manage/vehicles/v-99');
  });

  it('bấm nút trong cột hành động KHÔNG kích hoạt click của cả hàng', () => {
    // D15.7 ĐÃ SỬA ở Wave 1C-E. Trước đây sự kiện nổi bọt lên `<tr>` nên nút "Sửa" sinh HAI lần
    // điều hướng và trang chi tiết thắng — tức nút Sửa không dẫn tới trang sửa. `RowActions` nay
    // chặn nổi bọt, nên chỉ còn đúng một lần điều hướng.
    grant(PERMISSION.VEHICLE_UPDATE);
    setQuery({ data: { items: [vehicle({ id: 'v-7' })], meta: META } });
    renderPage();

    fireEvent.click(within(bodyRows()[0]!).getByRole('button', { name: 'Sửa' }));

    expect(nav.push.mock.calls.map((c) => c[0])).toEqual(['/manage/vehicles/v-7/edit']);
  });

  it('xoá xe phải xác nhận trước, rồi mới gọi mutation với đúng id', async () => {
    grant(PERMISSION.VEHICLE_DELETE);
    setQuery({ data: { items: [vehicle({ id: 'v-5' })], meta: META } });
    renderPage();

    const row = bodyRows()[0]!;
    fireEvent.click(within(row).getByRole('button', { name: 'Xoá' }));

    // Chưa xác nhận thì chưa gọi gì.
    expect(deleteVehicle.mutate).not.toHaveBeenCalled();

    // Nút hành động và nút xác nhận cùng mang tên "Xoá" — nút xác nhận là nút cuối.
    const confirms = await screen.findAllByRole('button', { name: 'Xoá' });
    fireEvent.click(confirms[confirms.length - 1]!);

    await waitFor(() => expect(deleteVehicle.mutate).toHaveBeenCalledTimes(1));
    expect(deleteVehicle.mutate.mock.calls[0]![0]).toBe('v-5');
  });

  it('câu chữ xác nhận xoá giữ nguyên cảnh báo về lịch', async () => {
    grant(PERMISSION.VEHICLE_DELETE);
    setQuery({ data: { items: [vehicle()], meta: META } });
    renderPage();

    fireEvent.click(within(bodyRows()[0]!).getByRole('button', { name: 'Xoá' }));

    expect(await screen.findByText('Xoá xe này?')).toBeTruthy();
    expect(
      screen.getByText('Xe sẽ bị ẩn khỏi danh sách. Không xoá được nếu còn lịch.'),
    ).toBeTruthy();
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
    });
  });

  it('ô tìm kiếm debounce 400ms rồi mới ghi vào URL', async () => {
    vi.useFakeTimers();
    try {
      setQuery({ data: { items: [vehicle()], meta: META } });
      renderPage();

      fireEvent.change(screen.getByPlaceholderText('Tìm theo tên, mã, biển số, hãng…'), {
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

      fireEvent.change(screen.getByPlaceholderText('Tìm theo tên, mã, biển số, hãng…'), {
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

  it('tổng số hiển thị theo đơn vị "xe"', () => {
    setQuery({ data: { items: [vehicle()], meta: { ...META, total: 245 } } });
    renderPage();

    expect(screen.getByText('245 xe')).toBeTruthy();
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
    for (const label of ['Loại xe', 'Dịch vụ', 'Vận hành', 'Trạng thái public']) {
      expect(bar.getByRole('combobox', { name: label }), label).toBeTruthy();
    }
  });

  it('sắp xếp nằm NGOÀI cụm lọc và hiện đúng giá trị từ URL', () => {
    // `sort` không phải filter: nó không được đếm vào huy hiệu "Bộ lọc" và không bị "Xoá bộ lọc"
    // đụng tới. Figma cũng đặt nó tách ra (`58:129` desktop, `58:2429` mobile).
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

/* ------------------------------------------------------------------ mobile + quyền trang */

describe('/manage/vehicles — thẻ mobile (Pilot renderCard)', () => {
  /** Danh sách thẻ do `DataTable` dựng ở ≤640px — nhận diện bằng nhãn, không bằng class. */
  function cardList(): HTMLElement {
    return screen.getByRole('list', { name: 'Danh sách xe' });
  }

  function renderMobile(items = [vehicle()], meta = META) {
    viewport.mobile = true;
    setQuery({ data: { items, meta } });
    return renderPage();
  }

  it('≤640px dựng THẺ thay bảng (Figma `58:2439`)', () => {
    // Đảo có chủ ý ở Wave 2: trước Pilot, mobile vẫn là bảng cuộn ngang.
    renderMobile();

    expect(screen.queryByRole('table')).toBeNull();
    expect(cardList()).toBeTruthy();
  });

  it('desktop vẫn là bảng — cùng dữ liệu, khác cách trình bày', () => {
    viewport.mobile = false;
    setQuery({ data: { items: [vehicle()], meta: META } });
    renderPage();

    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Danh sách xe' })).toBeNull();
  });

  it('thẻ giữ định danh, thông số, giá và CẢ HAI trạng thái', () => {
    renderMobile([
      vehicle({
        name: 'Toyota Vios',
        code: 'XP-0001',
        plateNumber: '51A-123.45',
        vehicleType: 'car',
        serviceType: 'self_drive',
        manufactureYear: 2023,
        seatCount: 4,
        weekdayPrice: '850000',
      }),
    ]);

    const card = within(cardList());
    expect(card.getByText('Toyota Vios')).toBeTruthy();
    expect(card.getByText('XP-0001 · 51A-123.45')).toBeTruthy();
    expect(card.getByText('Ô tô · Tự lái · 2023 · 4 chỗ')).toBeTruthy();
    expect(card.getByText(/850\.000/)).toBeTruthy();
    // Hai trục trạng thái độc lập — thẻ không được nuốt mất trục nào.
    expect(card.getByText('Sẵn sàng')).toBeTruthy();
    expect(card.getByText('Đã duyệt public')).toBeTruthy();
  });

  it('tên xe là link dẫn tới đúng trang chi tiết', () => {
    renderMobile([vehicle({ id: 'v-77', name: 'Kia Seltos' })]);

    expect(within(cardList()).getByRole('link', { name: 'Kia Seltos' }).getAttribute('href')).toBe(
      '/manage/vehicles/v-77',
    );
  });

  it('mọi hành động gom vào MỘT menu có tên khả truy cập', () => {
    grant(PERMISSION.VEHICLE_UPDATE, PERMISSION.VEHICLE_DELETE);
    renderMobile([vehicle({ name: 'Toyota Vios' })]);

    const card = within(cardList());
    // Thẻ chỉ có một điều khiển hành động (Figma `58:2459`), không phải ba nút như bảng.
    expect(card.getByRole('button', { name: 'Thao tác cho Toyota Vios' })).toBeTruthy();
    expect(card.queryByRole('button', { name: 'Sửa' })).toBeNull();
  });

  it('menu thẻ mở đúng các hành động theo quyền', async () => {
    grant(PERMISSION.VEHICLE_UPDATE);
    renderMobile([vehicle({ name: 'Toyota Vios' })]);

    fireEvent.click(within(cardList()).getByRole('button', { name: 'Thao tác cho Toyota Vios' }));

    expect(await screen.findByRole('menuitem', { name: 'Xem' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Sửa' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Xoá' })).toBeNull();
  });

  it('xoá từ menu thẻ VẪN phải xác nhận trước khi gọi mutation', async () => {
    grant(PERMISSION.VEHICLE_DELETE);
    renderMobile([vehicle({ id: 'v-9', name: 'Toyota Vios' })]);

    fireEvent.click(within(cardList()).getByRole('button', { name: 'Thao tác cho Toyota Vios' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Xoá' }));

    expect(deleteVehicle.mutate).not.toHaveBeenCalled();
    expect(await screen.findByText('Xoá xe này?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Xoá' }));
    await waitFor(() => expect(deleteVehicle.mutate).toHaveBeenCalledTimes(1));
    expect(deleteVehicle.mutate.mock.calls[0]![0]).toBe('v-9');
  });

  it('phân trang vẫn còn ở chế độ thẻ', () => {
    renderMobile([vehicle()], { page: 1, limit: 20, total: 60, hasNext: true });

    fireEvent.click(screen.getByTitle('2'));

    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(lastReplacedUrl()).toContain('page=2');
  });

  it('rỗng / không-kết-quả / lỗi ở mobile dùng chung một bộ trạng thái với desktop', () => {
    viewport.mobile = true;
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();
    expect(screen.getByText('Gian hàng chưa có xe nào')).toBeTruthy();
    cleanup();

    viewport.mobile = true;
    nav.params = new URLSearchParams('q=abc');
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();
    expect(screen.getByText('Không tìm thấy xe khớp bộ lọc')).toBeTruthy();
    cleanup();

    viewport.mobile = true;
    nav.params = new URLSearchParams();
    setQuery({ isError: true });
    renderPage();
    expect(screen.getByText('Không tải được danh sách xe')).toBeTruthy();
  });

  it('ô tìm kiếm vẫn hiện ở mobile, các lọc còn lại vào bộ lọc riêng', () => {
    renderMobile();

    expect(screen.getByRole('textbox', { name: 'Tìm xe' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Bộ lọc/ })).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ quyền cấp trang */

describe('/manage/vehicles — thiếu quyền xem', () => {
  it('không có `vehicles.view`: thay TOÀN BỘ nội dung bằng màn 403 (Figma `58:2061`)', () => {
    revokeAll();
    setQuery({ data: { items: [vehicle()], meta: META } });
    renderPage();

    expect(screen.getByText('Không có quyền truy cập')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
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

  it('có quyền xem nhưng không có quyền ghi: vẫn xem được bảng, không có nút tạo', () => {
    grant();
    setQuery({ data: { items: [vehicle()], meta: META } });
    renderPage();

    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Thêm xe/ })).toBeNull();
  });
});
