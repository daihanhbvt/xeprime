import { App } from 'antd';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminTenant } from '@/features/admin-tenants/types';

import AdminTenantsPage from './page';

/**
 * Test ĐẶC TẢ (characterization) cho `/manage/admin/tenants` — viết TRƯỚC Wave 1C.
 *
 * Vì sao chọn trang này làm đại diện thứ hai: nó là **bản đối lập** của `/manage/vehicles`.
 * Cùng một bài toán danh sách nhưng khác ở bốn điểm mà Wave 1C sẽ gom lại làm một:
 *  1. một `<Empty>` dùng chung cho cả rỗng lẫn không-có-kết-quả (vehicles tách hai)
 *  2. ô tìm kiếm **không debounce** và **không kiểm soát** (`defaultValue`)
 *  3. hook filter là bản copy riêng — **không xoá giá trị `'all'`** khỏi URL
 *  4. không có một lệnh kiểm quyền nào ở tầng trang
 *
 * Bốn điểm đó là thứ dễ mất nhất khi gom, nên đây là nơi phải khoá chặt nhất.
 * Không sửa gì trong batch này (chỉ thị 1C-A mục 10).
 */

/* ------------------------------------------------------------------ hạ tầng mock */

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => '/manage/admin/tenants',
  useSearchParams: () => nav.params,
}));

const query = vi.hoisted(() => ({
  data: undefined as { items: unknown[]; meta: unknown } | undefined,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
  lastFilters: undefined as unknown,
}));

vi.mock('@/features/admin-tenants/hooks/use-admin-tenants', () => ({
  useAdminTenants: (filters: unknown) => {
    query.lastFilters = filters;
    return query;
  },
}));

/**
 * Panel chi tiết có test riêng ([AdminTenantDetailDrawer]); ở đây chỉ cần biết trang mở nó với
 * ĐÚNG id nào. Thay bằng stub để test không phụ thuộc nội thất của drawer.
 */
const drawer = vi.hoisted(() => ({ tenantId: null as string | null }));

vi.mock('@/features/admin-tenants/components/AdminTenantDetailDrawer', () => ({
  AdminTenantDetailDrawer: ({ tenantId }: { tenantId: string | null }) => {
    drawer.tenantId = tenantId;
    return tenantId ? <div data-testid="tenant-drawer">{tenantId}</div> : null;
  },
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

/* ------------------------------------------------------------------ dữ liệu mẫu */

function tenant(over: Partial<AdminTenant> = {}): AdminTenant {
  return {
    id: 't1',
    code: 'GH-001',
    name: 'Gian hàng Demo XePrime',
    slug: 'gian-hang-demo',
    tenantType: 'business',
    status: 'active',
    ownerName: 'Chủ shop demo',
    phone: '0901234567',
    provinceName: 'TP. Hồ Chí Minh',
    vehicleCount: 12,
    createdAt: '2026-07-01T00:00:00.000Z',
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

function renderPage() {
  return render(
    <App>
      <AdminTenantsPage />
    </App>,
  );
}

/**
 * URL cuối cùng mà filter hook đã ghi (`router.replace`).
 *
 * ⚠️ Mọi test dùng hàm này PHẢI có ít nhất một khẳng định KHẲNG ĐỊNH. Tương tác không chạy →
 * chuỗi rỗng → `not.toContain(...)` một mình đúng vô nghĩa.
 *
 * ⚠️ GIỚI HẠN: `Select` của AntD 6 không chốt được lựa chọn dưới jsdom bằng sự kiện tổng hợp,
 * nên đường "đổi trạng thái bằng dropdown" KHÔNG được phủ. Hợp đồng tương đương được khoá qua ô
 * tìm kiếm (Enter) và nút "Xoá bộ lọc".
 */
function lastReplacedUrl(): string {
  const calls = nav.replace.mock.calls;
  return calls.length ? (calls[calls.length - 1]![0] as string) : '';
}

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
  drawer.tenantId = null;
  setQuery();
});

afterEach(cleanup);

/* ------------------------------------------------------------------ tải / lỗi */

describe('/manage/admin/tenants — tải và lỗi', () => {
  it('lần tải đầu hiện trạng thái chờ, chưa hiện câu "chưa có gian hàng"', () => {
    // ĐỔI CÓ CHỦ ĐÍCH ở Wave 1C-D: trước đây dựng bảng rỗng kèm spinner; nay là skeleton
    // (Figma `134:2011` R1 — biết trước bố cục thì dùng skeleton). Khẳng định ở mức hành vi:
    // đang chờ thì KHÔNG được nói "chưa có dữ liệu".
    setQuery({ isFetching: true });
    renderPage();

    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByText('Chưa có gian hàng nào')).toBeNull();
  });

  it('lỗi khi chưa có dữ liệu: câu chữ riêng của module, kèm nút Thử lại', () => {
    setQuery({ isError: true });
    renderPage();

    expect(screen.getByText('Không tải được danh sách gian hàng')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('HIỆN TRẠNG: màn lỗi ở đây KHÔNG có dòng phụ đề như /manage/vehicles', () => {
    // vehicles có `subTitle="Có lỗi khi lấy dữ liệu. Vui lòng thử lại."`, trang này không.
    // Gom về `EmptyState` sẽ làm hai trang giống nhau — đó là thay đổi thấy được, phải chủ ý.
    setQuery({ isError: true });
    renderPage();

    expect(screen.queryByText('Có lỗi khi lấy dữ liệu. Vui lòng thử lại.')).toBeNull();
  });

  it('Thử lại gọi refetch', () => {
    setQuery({ isError: true });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });

  it('lỗi khi ĐÃ có dữ liệu thì giữ bảng', () => {
    setQuery({ isError: true, data: { items: [tenant()], meta: META } });
    renderPage();

    expect(screen.getByText('Gian hàng Demo XePrime')).toBeTruthy();
    expect(screen.queryByText('Không tải được danh sách gian hàng')).toBeNull();
  });
});

/* ------------------------------------------------------------------ rỗng vs không-kết-quả */

describe('/manage/admin/tenants — rỗng và không có kết quả', () => {
  it('không lọc và rỗng: "Chưa có gian hàng nào", không có nút xoá lọc', () => {
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.getByText('Chưa có gian hàng nào')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).toBeNull();
  });

  it('đang lọc và rỗng: đổi câu chữ và hiện nút xoá lọc', () => {
    nav.params = new URLSearchParams('status=suspended');
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.getByText('Không có gian hàng khớp bộ lọc')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xoá bộ lọc' })).toBeTruthy();
  });

  it('HIỆN TRẠNG: rỗng và không-kết-quả dùng CHUNG một khối, chỉ khác dòng mô tả', () => {
    // Khác `/manage/vehicles` (hai nhánh riêng, nhánh rỗng còn có nút tạo).
    // Ở đây không có lối tạo gian hàng nào — đúng nghiệp vụ: nền tảng không tự tạo shop.
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.queryByRole('button', { name: /Thêm|Tạo/ })).toBeNull();
  });

  it('q rỗng chuỗi KHÔNG được tính là đang lọc', () => {
    nav.params = new URLSearchParams('q=');
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.getByText('Chưa có gian hàng nào')).toBeTruthy();
  });

  it('status=all KHÔNG được tính là đang lọc', () => {
    nav.params = new URLSearchParams('status=all');
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.getByText('Chưa có gian hàng nào')).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ filter + URL */

describe('/manage/admin/tenants — filter và URL', () => {
  it('mặc định status là "all" và được truyền xuống lớp dữ liệu', () => {
    setQuery({ data: { items: [tenant()], meta: META } });
    renderPage();

    expect(query.lastFilters).toEqual({ status: 'all', q: undefined, page: undefined });
  });

  it('đọc q và page từ URL', () => {
    nav.params = new URLSearchParams('q=demo&status=active&page=3');
    setQuery({ data: { items: [tenant()], meta: META } });
    renderPage();

    expect(query.lastFilters).toEqual({ status: 'active', q: 'demo', page: 3 });
  });

  it('page không hợp lệ bị bỏ qua', () => {
    nav.params = new URLSearchParams('page=abc');
    setQuery({ data: { items: [tenant()], meta: META } });
    renderPage();

    expect((query.lastFilters as { page?: number }).page).toBeUndefined();
  });

  it('"Xoá bộ lọc" xoá HẲN cả q lẫn status khỏi URL', () => {
    // ĐỔI CÓ CHỦ ĐÍCH ở Wave 1C-D. Trước đây bản copy của hook chỉ xoá `undefined`/`null`/`''`
    // nên URL còn lại `?status=all`. `useUrlFilters` coi `'all'` là sentinel không-lọc và xoá
    // hẳn — link chia sẻ sạch hơn và đồng nhất với 12 danh sách còn lại (quy tắc URL 7 của 1C-C).
    nav.params = new URLSearchParams('q=demo&status=suspended');
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));

    expect(nav.replace).toHaveBeenCalledTimes(1);
    const url = lastReplacedUrl();
    expect(url).not.toContain('status=');
    expect(url).not.toContain('q=');
  });

  it('đổi filter đưa về trang 1', () => {
    // Đi qua ô tìm kiếm, không qua dropdown — xem ghi chú GIỚI HẠN ở `lastReplacedUrl`.
    vi.useFakeTimers();
    try {
      nav.params = new URLSearchParams('status=suspended&page=5');
      setQuery({ data: { items: [tenant()], meta: META } });
      renderPage();

      fireEvent.change(screen.getByPlaceholderText('Tìm tên / mã / SĐT'), {
        target: { value: 'demo' },
      });
      vi.advanceTimersByTime(400);

      expect(nav.replace).toHaveBeenCalledTimes(1);
      const url = lastReplacedUrl();
      expect(url).toContain('q=demo');
      // Đổi một filter KHÔNG được chạm filter còn lại.
      expect(url).toContain('status=suspended');
      expect(url).not.toContain('page=');
    } finally {
      vi.useRealTimers();
    }
  });

  it('tìm kiếm debounce 400ms rồi mới ghi URL', () => {
    // ĐỔI CÓ CHỦ ĐÍCH ở Wave 1C-D: trước đây là `Input.Search` phải nhấn Enter mới áp dụng;
    // nay dùng `FilterBar` — gõ tới đâu debounce tới đó, giống `/manage/vehicles` đã làm từ trước.
    vi.useFakeTimers();
    try {
      setQuery({ data: { items: [tenant()], meta: META } });
      renderPage();

      fireEvent.change(screen.getByPlaceholderText('Tìm tên / mã / SĐT'), {
        target: { value: 'demo' },
      });

      vi.advanceTimersByTime(399);
      expect(nav.replace).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(lastReplacedUrl()).toContain('q=demo');
    } finally {
      vi.useRealTimers();
    }
  });

  it('tìm kiếm trim khoảng trắng, chuỗi trắng thì xoá tham số', () => {
    vi.useFakeTimers();
    try {
      nav.params = new URLSearchParams('q=cu');
      setQuery({ data: { items: [tenant()], meta: META } });
      renderPage();

      fireEvent.change(screen.getByPlaceholderText('Tìm tên / mã / SĐT'), {
        target: { value: '   ' },
      });
      vi.advanceTimersByTime(400);

      expect(nav.replace).toHaveBeenCalledTimes(1);
      expect(lastReplacedUrl()).not.toContain('q=');
    } finally {
      vi.useRealTimers();
    }
  });

  it('ô tìm kiếm nay ĐƯỢC kiểm soát — filter đổi từ ngoài thì ô nhập đồng bộ theo', () => {
    // ĐỔI CÓ CHỦ ĐÍCH ở Wave 1C-D, và là một lỗi được sửa: bản cũ dùng `defaultValue` nên bấm
    // "Xoá bộ lọc" hay nút Back đều để lại chữ cũ trong ô nhập.
    nav.params = new URLSearchParams('q=demo');
    setQuery({ data: { items: [tenant()], meta: META } });
    const { rerender } = renderPage();

    expect((screen.getByPlaceholderText('Tìm tên / mã / SĐT') as HTMLInputElement).value).toBe(
      'demo',
    );

    // Mô phỏng URL đổi (xoá lọc / back): Next cấp searchParams mới.
    nav.params = new URLSearchParams();
    rerender(
      <App>
        <AdminTenantsPage />
      </App>,
    );

    expect((screen.getByPlaceholderText('Tìm tên / mã / SĐT') as HTMLInputElement).value).toBe('');
  });
});

/* ------------------------------------------------------------------ dữ liệu, hàng, phân trang */

describe('/manage/admin/tenants — dữ liệu và hành động', () => {
  it('hiện tên, mã, tỉnh và chủ shop', () => {
    setQuery({ data: { items: [tenant()], meta: META } });
    renderPage();

    expect(screen.getByText('Gian hàng Demo XePrime')).toBeTruthy();
    expect(screen.getByText('GH-001 · TP. Hồ Chí Minh')).toBeTruthy();
    expect(screen.getByText('Chủ shop demo')).toBeTruthy();
  });

  it('thiếu chủ shop thì hiện gạch ngang, không phải chuỗi rỗng', () => {
    setQuery({ data: { items: [tenant({ ownerName: null, phone: null })], meta: META } });
    renderPage();

    expect(screen.getByText('—')).toBeTruthy();
  });

  it('"Xem" mở panel chi tiết đúng gian hàng, KHÔNG điều hướng trang', () => {
    setQuery({ data: { items: [tenant({ id: 't-42' })], meta: META } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Xem' }));

    expect(drawer.tenantId).toBe('t-42');
    expect(screen.getByTestId('tenant-drawer').textContent).toBe('t-42');
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('HIỆN TRẠNG: bấm vào hàng KHÔNG mở gì — chỉ nút "Xem" mới mở', () => {
    // Khác `/manage/vehicles` (có `onRow` click). Wave 1C phải giữ khác biệt này hoặc đổi có chủ ý.
    setQuery({ data: { items: [tenant()], meta: META } });
    renderPage();

    fireEvent.click(screen.getByText('Gian hàng Demo XePrime'));

    expect(drawer.tenantId).toBeNull();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('mỗi hàng đúng một hành động, và nó có tên khả truy cập', () => {
    setQuery({ data: { items: [tenant()], meta: META } });
    renderPage();

    const buttons = within(bodyRows()[0]!).getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.textContent).toBe('Xem');
  });

  it('đổi trang ghi page và limit vào URL', () => {
    setQuery({
      data: { items: [tenant()], meta: { page: 1, limit: 20, total: 60, hasNext: true } },
    });
    renderPage();

    fireEvent.click(screen.getByTitle('2'));

    const url = lastReplacedUrl();
    expect(url).toContain('page=2');
    expect(url).toContain('limit=20');
  });

  it('tổng số hiển thị theo đơn vị "gian hàng"', () => {
    setQuery({ data: { items: [tenant()], meta: { ...META, total: 245 } } });
    renderPage();

    expect(screen.getByText('245 gian hàng')).toBeTruthy();
  });

  it('HIỆN TRẠNG: trang không kiểm quyền — bảo vệ nằm ở admin/layout và guard backend', () => {
    setQuery({ data: { items: [tenant()], meta: META } });
    renderPage();

    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.queryByText(/không có quyền/i)).toBeNull();
  });
});
