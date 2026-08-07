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

function grant(...permissions: Permission[]) {
  perms.granted = new Set<string>(permissions);
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
    expect(screen.getByRole('button', { name: 'Xoá bộ lọc' })).toBeTruthy();
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

    fireEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));

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

/* ------------------------------------------------------------------ mobile + quyền trang */

describe('/manage/vehicles — hành vi mobile và quyền cấp trang hiện có', () => {
  it('HIỆN TRẠNG: ở mobile vẫn là bảng cuộn ngang, chưa có thẻ', () => {
    // Figma `127:2257` yêu cầu chuyển sang thẻ ở ≤640px. Hôm nay KHÔNG có.
    // Đây là mốc để Wave 1C chứng minh mình đã đổi đúng chỗ.
    viewport.mobile = true;
    setQuery({ data: { items: [vehicle()], meta: META } });
    renderPage();

    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('HIỆN TRẠNG: thiếu quyền xem cũng KHÔNG có màn 403 riêng — trang vẫn dựng', () => {
    // Bảo vệ thật nằm ở guard backend (CLAUDE.md §3). Ghi lại để Wave 1C thêm
    // `PermissionState` một cách có chủ đích chứ không phải tình cờ.
    setQuery({ data: { items: [vehicle()], meta: META } });
    renderPage();

    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.queryByText(/không có quyền/i)).toBeNull();
  });
});
