import { App } from 'antd';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLATFORM_PARTNER_KIND, type PlatformPartnerKind } from '@xeprime/types';

import type { AdminTenant } from '@/features/admin-tenants/types';
import { renderWithIntl } from '@/i18n/test-utils';

import { AdminPartnerListPage } from './AdminPartnerListPage';

/**
 * Danh sách đối tác dùng chung cho "Gian hàng gói" (`/manage/admin/partners/shops`) và "Chủ xe cá
 * nhân" (`/manage/admin/partners/owners`).
 *
 * Kế thừa bộ test đặc tả của `/manage/admin/tenants` cũ (Wave 1C): mọi hợp đồng lọc/URL/trạng
 * thái của danh sách chung vẫn phải đúng ở CẢ HAI loại. Thêm vào đó là hợp đồng của đợt tách
 * 28/09/2026: loại đi thẳng từ route xuống tham số API và không đổi được bằng URL; panel chi
 * tiết sống ở `?tenant=` để link từ nơi khác mở đúng gian hàng.
 */

/* ------------------------------------------------------------------ hạ tầng mock */

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(),
  pathname: '/manage/admin/partners/shops',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => nav.pathname,
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
 * Panel chi tiết có test riêng ([PartnerDetailDrawer]); ở đây chỉ cần biết trang mở nó với
 * ĐÚNG id nào. Thay bằng stub để test không phụ thuộc nội thất của drawer.
 */
const drawer = vi.hoisted(() => ({
  tenantId: null as string | null,
  tab: undefined as string | undefined,
  onClose: null as null | (() => void),
  onTabChange: null as null | ((tab: string) => void),
}));

vi.mock('@/features/admin-tenants/partner-detail/PartnerDetailDrawer', () => ({
  PartnerDetailDrawer: ({
    tenantId,
    tab,
    onClose,
    onTabChange,
  }: {
    tenantId: string | null;
    tab: string | undefined;
    onClose: () => void;
    onTabChange: (tab: string) => void;
  }) => {
    drawer.tenantId = tenantId;
    drawer.tab = tab;
    drawer.onClose = onClose;
    drawer.onTabChange = onTabChange;
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

const { PACKAGE_SHOP, INDIVIDUAL_OWNER } = PLATFORM_PARTNER_KIND;

function tenant(over: Partial<AdminTenant> = {}): AdminTenant {
  return {
    id: 't1',
    code: 'GH-001',
    name: 'Gian hàng Demo XePrime',
    slug: 'gian-hang-demo',
    tenantType: 'business',
    status: 'active',
    partnerKind: PACKAGE_SHOP,
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

function renderPage(kind: PlatformPartnerKind = PACKAGE_SHOP) {
  return render(
    <App>
      <AdminPartnerListPage partnerKind={kind} />
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
 * nên đường "đổi trạng thái / sắp xếp bằng dropdown" KHÔNG được phủ. Hợp đồng tương đương được
 * khoá qua URL đọc vào, ô tìm kiếm và nút "Xoá bộ lọc".
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
  nav.pathname = '/manage/admin/partners/shops';
  query.refetch.mockReset();
  drawer.tenantId = null;
  drawer.onClose = null;
  setQuery();
});

afterEach(cleanup);

/* ------------------------------------------------------------------ loại đối tác */

describe('danh sách đối tác — loại cố định theo route', () => {
  it('"Gian hàng gói" gửi partnerKind=package_shop, tiêu đề và câu chữ của gian hàng', () => {
    setQuery({ data: { items: [tenant()], meta: { ...META, total: 245 } } });
    renderPage(PACKAGE_SHOP);

    expect(query.lastFilters).toMatchObject({ partnerKind: PACKAGE_SHOP });
    expect(screen.getByRole('heading', { name: 'Gian hàng gói' })).toBeTruthy();
    expect(screen.getByPlaceholderText('Tìm tên / mã / SĐT')).toBeTruthy();
    expect(screen.getByText('245 gian hàng')).toBeTruthy();
  });

  it('"Chủ xe cá nhân" gửi partnerKind=individual_owner, câu chữ của chủ xe', () => {
    nav.pathname = '/manage/admin/partners/owners';
    setQuery({
      data: {
        items: [
          tenant({ name: 'Xe anh Minh', tenantType: 'individual', partnerKind: INDIVIDUAL_OWNER }),
        ],
        meta: { ...META, total: 7 },
      },
    });
    renderPage(INDIVIDUAL_OWNER);

    expect(query.lastFilters).toMatchObject({ partnerKind: INDIVIDUAL_OWNER });
    expect(screen.getByRole('heading', { name: 'Chủ xe cá nhân' })).toBeTruthy();
    expect(screen.getByText('7 chủ xe')).toBeTruthy();
    expect(screen.getByText('Cá nhân')).toBeTruthy();
  });

  it('URL KHÔNG đổi được loại: ?partnerKind=… bị bỏ qua, loại vẫn là của route', () => {
    nav.params = new URLSearchParams('partnerKind=individual_owner&q=demo');
    setQuery({ data: { items: [tenant()], meta: META } });
    renderPage(PACKAGE_SHOP);

    expect(query.lastFilters).toMatchObject({ partnerKind: PACKAGE_SHOP, q: 'demo' });
  });

  it('rỗng / lỗi nói theo đúng loại', () => {
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage(INDIVIDUAL_OWNER);
    expect(screen.getByText('Chưa có chủ xe cá nhân nào')).toBeTruthy();
    cleanup();

    setQuery({ isError: true });
    renderPage(INDIVIDUAL_OWNER);
    expect(screen.getByText('Không tải được danh sách chủ xe')).toBeTruthy();
  });

  it('tiếng Anh: tiêu đề, cột và tổng số đều đã dịch', () => {
    setQuery({ data: { items: [tenant()], meta: { ...META, total: 2 } } });
    renderWithIntl(
      <App>
        <AdminPartnerListPage partnerKind={PACKAGE_SHOP} />
      </App>,
      { locale: 'en' },
    );

    expect(screen.getByRole('heading', { name: 'Subscription shops' })).toBeTruthy();
    expect(screen.getByText('2 shops')).toBeTruthy();
    expect(screen.getAllByText('Legal entity').length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ tải / lỗi */

describe('danh sách đối tác — tải và lỗi', () => {
  it('lần tải đầu hiện trạng thái chờ, chưa hiện câu "chưa có gian hàng"', () => {
    setQuery({ isFetching: true });
    renderPage();

    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByText('Chưa có gian hàng nào')).toBeNull();
  });

  it('lỗi khi chưa có dữ liệu: câu chữ riêng của module, kèm nút Thử lại gọi refetch', () => {
    setQuery({ isError: true });
    renderPage();

    expect(screen.getByText('Không tải được danh sách gian hàng')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
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

describe('danh sách đối tác — rỗng và không có kết quả', () => {
  it('không lọc và rỗng: "Chưa có gian hàng nào", không có nút xoá lọc, không có nút tạo', () => {
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.getByText('Chưa có gian hàng nào')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).toBeNull();
    // Nền tảng không tự tạo gian hàng — không có lối tạo nào.
    expect(screen.queryByRole('button', { name: /Thêm|Tạo/ })).toBeNull();
  });

  it('đang lọc và rỗng: đổi câu chữ và hiện nút xoá lọc', () => {
    nav.params = new URLSearchParams('status=suspended');
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.getByText('Không có gian hàng khớp bộ lọc')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xoá bộ lọc' })).toBeTruthy();
  });

  it('q rỗng chuỗi, status=all hay sort KHÔNG được tính là đang lọc', () => {
    nav.params = new URLSearchParams('q=&status=all&sort=vehicles');
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.getByText('Chưa có gian hàng nào')).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ filter + URL */

describe('danh sách đối tác — filter, sắp xếp và URL', () => {
  it('mặc định: mọi trạng thái, sort mặc định của server, không có panel mở', () => {
    setQuery({ data: { items: [tenant()], meta: META } });
    renderPage();

    expect(query.lastFilters).toEqual({
      partnerKind: PACKAGE_SHOP,
      status: 'all',
      q: undefined,
      sort: undefined,
      page: undefined,
      limit: undefined,
    });
    expect(screen.getByText('Mới tạo gần nhất')).toBeTruthy();
  });

  it('đọc q, status, sort, page, limit từ URL — `tenant` KHÔNG lọt xuống lớp dữ liệu', () => {
    nav.params = new URLSearchParams(
      'q=demo&status=active&sort=vehicles&page=3&limit=50&tenant=t9',
    );
    setQuery({ data: { items: [tenant()], meta: META } });
    renderPage();

    expect(query.lastFilters).toEqual({
      partnerKind: PACKAGE_SHOP,
      status: 'active',
      q: 'demo',
      sort: 'vehicles',
      page: 3,
      limit: 50,
    });
    expect(screen.getByText('Nhiều xe nhất')).toBeTruthy();
  });

  it('giá trị lạ trong URL rơi về mặc định thay vì thành lỗi 400', () => {
    nav.params = new URLSearchParams('status=abc&sort=hot&page=abc');
    setQuery({ data: { items: [tenant()], meta: META } });
    renderPage();

    expect(query.lastFilters).toMatchObject({ status: 'all', sort: undefined, page: undefined });
  });

  it('"Xoá bộ lọc" xoá HẲN q lẫn status, nhưng GIỮ cách sắp xếp', () => {
    nav.params = new URLSearchParams('q=demo&status=suspended&sort=name');
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));

    expect(nav.replace).toHaveBeenCalledTimes(1);
    const url = lastReplacedUrl();
    expect(url).toContain('sort=name');
    expect(url).not.toContain('status=');
    expect(url).not.toContain('q=');
  });

  it('đổi filter đưa về trang 1, không chạm filter còn lại và không ghi loại lên URL', () => {
    vi.useFakeTimers();
    try {
      nav.params = new URLSearchParams('status=suspended&sort=oldest&page=5');
      setQuery({ data: { items: [tenant()], meta: META } });
      renderPage();

      fireEvent.change(screen.getByPlaceholderText('Tìm tên / mã / SĐT'), {
        target: { value: 'demo' },
      });
      vi.advanceTimersByTime(400);

      expect(nav.replace).toHaveBeenCalledTimes(1);
      const url = lastReplacedUrl();
      expect(url.startsWith('/manage/admin/partners/shops?')).toBe(true);
      expect(url).toContain('q=demo');
      expect(url).toContain('status=suspended');
      expect(url).toContain('sort=oldest');
      expect(url).not.toContain('page=');
      expect(url).not.toContain('partnerKind');
    } finally {
      vi.useRealTimers();
    }
  });

  it('tìm kiếm debounce 400ms, trim khoảng trắng, chuỗi trắng thì xoá tham số', () => {
    vi.useFakeTimers();
    try {
      nav.params = new URLSearchParams('q=cu');
      setQuery({ data: { items: [tenant()], meta: META } });
      renderPage();

      const input = screen.getByPlaceholderText('Tìm tên / mã / SĐT');
      fireEvent.change(input, { target: { value: 'demo' } });
      vi.advanceTimersByTime(399);
      expect(nav.replace).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(lastReplacedUrl()).toContain('q=demo');

      fireEvent.change(input, { target: { value: '   ' } });
      vi.advanceTimersByTime(400);
      expect(nav.replace).toHaveBeenCalledTimes(2);
      expect(lastReplacedUrl()).not.toContain('q=');
    } finally {
      vi.useRealTimers();
    }
  });

  it('ô tìm kiếm được kiểm soát — filter đổi từ ngoài thì ô nhập đồng bộ theo', () => {
    nav.params = new URLSearchParams('q=demo');
    setQuery({ data: { items: [tenant()], meta: META } });
    const { rerender } = renderPage();

    expect((screen.getByPlaceholderText('Tìm tên / mã / SĐT') as HTMLInputElement).value).toBe(
      'demo',
    );

    nav.params = new URLSearchParams();
    rerender(
      <App>
        <AdminPartnerListPage partnerKind={PACKAGE_SHOP} />
      </App>,
    );

    expect((screen.getByPlaceholderText('Tìm tên / mã / SĐT') as HTMLInputElement).value).toBe('');
  });
});

/* ------------------------------------------------------------------ dữ liệu, hàng, phân trang */

describe('danh sách đối tác — dữ liệu và hành động', () => {
  it('hiện tên, mã, tỉnh và chủ shop; thiếu chủ shop thì gạch ngang', () => {
    setQuery({
      data: { items: [tenant(), tenant({ id: 't2', ownerName: null, phone: null })], meta: META },
    });
    renderPage();

    expect(screen.getAllByText('Gian hàng Demo XePrime')).toHaveLength(2);
    expect(screen.getAllByText('GH-001 · TP. Hồ Chí Minh').length).toBeGreaterThan(0);
    expect(screen.getByText('Chủ shop demo')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('"Xem chi tiết" ghi ?tenant= lên URL, GIỮ trang hiện tại, không điều hướng trang', () => {
    nav.params = new URLSearchParams('page=3');
    setQuery({ data: { items: [tenant({ id: 't-42' })], meta: META } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết' }));

    const url = lastReplacedUrl();
    expect(url).toContain('tenant=t-42');
    expect(url).toContain('page=3');
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('bấm vào hàng cũng mở chi tiết', () => {
    setQuery({ data: { items: [tenant()], meta: META } });
    renderPage();

    fireEvent.click(screen.getByText('Gian hàng Demo XePrime'));

    expect(lastReplacedUrl()).toContain('tenant=t1');
  });

  it('?tenant= trong URL mở sẵn panel đúng gian hàng; đóng panel xoá tham số, giữ trang', () => {
    nav.params = new URLSearchParams('tenant=t-7&page=2');
    setQuery({ data: { items: [tenant()], meta: META } });
    renderPage(INDIVIDUAL_OWNER);

    expect(screen.getByTestId('tenant-drawer').textContent).toBe('t-7');

    drawer.onClose?.();
    const url = lastReplacedUrl();
    expect(url).toContain('page=2');
    expect(url).not.toContain('tenant=');
  });

  it('mỗi hàng đúng một hành động, và nó có tên khả truy cập', () => {
    setQuery({ data: { items: [tenant()], meta: META } });
    renderPage();

    const buttons = within(bodyRows()[0]!).getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.textContent).toBe('Xem chi tiết');
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

  it('?tab= đi cùng ?tenant=: drawer nhận đúng tab; đổi tab ghi URL mà GIỮ trang nền', () => {
    nav.params = new URLSearchParams('tenant=t-9&tab=vehicles&page=2');
    setQuery({ data: { items: [tenant()], meta: META } });
    renderPage();

    expect(drawer.tab).toBe('vehicles');
    drawer.onTabChange?.('activity');
    const url = lastReplacedUrl();
    expect(url).toContain('tab=activity');
    expect(url).toContain('tenant=t-9');
    expect(url).toContain('page=2');
  });

  it('mở một đối tác khác thì tab về mặc định; đóng drawer xoá cả tenant lẫn tab', () => {
    nav.params = new URLSearchParams('tenant=t-9&tab=vehicles');
    setQuery({ data: { items: [tenant({ id: 't-10' })], meta: META } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết' }));
    let url = lastReplacedUrl();
    expect(url).toContain('tenant=t-10');
    expect(url).not.toContain('tab=');

    drawer.onClose?.();
    url = lastReplacedUrl();
    expect(url).not.toContain('tenant=');
    expect(url).not.toContain('tab=');
  });
});
