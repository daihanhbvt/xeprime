import { App } from 'antd';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { filterBarPatch } from '@/features/admin-vehicles/hooks/use-admin-vehicle-filters';
import type { AdminVehicle, AdminVehicleCounts } from '@/features/admin-vehicles/types';

import AdminVehiclesPage from './page';

/**
 * Trang "Xe toàn hệ thống" (site quản trị, URL `/vehicles`).
 *
 * Khoá: bộ lọc / sắp xếp / trang / xe đang mở sống ở URL (ADR 0004) và đi nguyên vào hook truy
 * vấn SERVER; tab góc nhìn suy từ BA tham số và mang số đếm từ cùng lần đọc; lọc theo gian hàng
 * (chỉ đến từ link) có chip gỡ được; đủ trạng thái rỗng/lỗi; cột "Trên chợ" có nhánh "chưa lên sàn".
 */
const nav = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => '/admin/vehicles',
  useSearchParams: () => nav.params,
}));

const query = vi.hoisted(() => ({
  data: undefined as
    | { items: unknown[]; meta: unknown; counts: AdminVehicleCounts }
    | undefined,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
  lastFilters: undefined as unknown,
}));

vi.mock('@/features/admin-vehicles/hooks/use-admin-vehicles', () => ({
  useAdminVehicles: (filters: unknown) => {
    query.lastFilters = filters;
    return query;
  },
}));

const drawer = vi.hoisted(() => ({
  vehicleId: null as string | null,
  previousId: null as string | null,
  nextId: null as string | null,
  onNavigate: (() => undefined) as (id: string) => void,
}));

vi.mock('@/features/admin-vehicles/components/AdminVehicleDetailDrawer', () => ({
  AdminVehicleDetailDrawer: (props: typeof drawer) => {
    Object.assign(drawer, props);
    return props.vehicleId ? <div data-testid="vehicle-drawer">{props.vehicleId}</div> : null;
  },
}));

vi.mock('@/features/locations/hooks/use-provinces', () => ({
  useProvinceOptions: () => ({
    options: [{ value: '79', label: 'TP. Hồ Chí Minh' }],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

function vehicle(over: Partial<AdminVehicle> = {}): AdminVehicle {
  return {
    id: 'v1',
    code: 'XM-001',
    name: 'Honda SH 150i',
    plateNumber: '59X1-333.44',
    vehicleType: 'motorbike',
    serviceTypes: ['self_drive'],
    operationStatus: 'available',
    publicStatus: 'approved_public',
    listingStatus: 'active',
    marketplaceEnabled: true,
    isMarketplaceVisible: true,
    marketplaceVisibilityReason: 'visible',
    mainImageUrl: null,
    weekdayPrice: '350000',
    tenantId: 't1',
    tenantName: 'Gian hàng Demo',
    tenantStatus: 'active',
    provinceName: 'Hồ Chí Minh',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-09-15T00:00:00.000Z',
    ...over,
  } as AdminVehicle;
}

const META = { page: 1, limit: 20, total: 1, hasNext: false };
const COUNTS: AdminVehicleCounts = {
  all: 1245,
  visible: 980,
  pending_review: 12,
  platform_hidden: 3,
  suspended_shop: 7,
};

function setQuery(over: Partial<typeof query> = {}) {
  query.data = undefined;
  query.isError = false;
  query.isFetching = false;
  Object.assign(query, over);
}

function setItems(items: AdminVehicle[], meta: Partial<typeof META> = {}) {
  setQuery({ data: { items, meta: { ...META, ...meta }, counts: COUNTS } });
}

function renderPage() {
  return render(
    <App>
      <AdminVehiclesPage />
    </App>,
  );
}

function lastUrl(): string {
  const calls = nav.replace.mock.calls;
  return calls.length ? (calls[calls.length - 1]![0] as string) : '';
}

function bodyRows(): HTMLElement[] {
  return screen
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('columnheader').length === 0);
}

function selectedTab(): string | null {
  return screen.queryByRole('tab', { selected: true })?.textContent ?? null;
}

beforeEach(() => {
  nav.replace.mockReset();
  nav.params = new URLSearchParams();
  query.refetch.mockReset();
  drawer.vehicleId = null;
  setQuery();
});

afterEach(cleanup);

describe('Xe toàn hệ thống — trạng thái', () => {
  it('tiêu đề + mô tả', () => {
    setItems([vehicle()]);
    renderPage();

    expect(screen.getByRole('heading', { name: 'Xe toàn hệ thống' })).toBeTruthy();
    expect(screen.getByText(/Mọi xe của gian hàng và chủ xe cá nhân/)).toBeTruthy();
  });

  it('lỗi khi chưa có dữ liệu: câu chữ riêng + Thử lại', () => {
    setQuery({ isError: true });
    renderPage();

    expect(screen.getByText('Không tải được danh sách xe')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });

  it('lỗi khi ĐÃ có dữ liệu thì giữ bảng', () => {
    setItems([vehicle()]);
    query.isError = true;
    renderPage();

    expect(screen.getByText('Honda SH 150i')).toBeTruthy();
    expect(screen.queryByText('Không tải được danh sách xe')).toBeNull();
  });

  it('rỗng không lọc: "Chưa có xe nào trong hệ thống", không có nút xoá lọc', () => {
    setItems([], { total: 0 });
    renderPage();

    expect(screen.getByText('Chưa có xe nào trong hệ thống')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).toBeNull();
  });

  it('rỗng khi đang lọc: đổi câu chữ và mở lối xoá lọc', () => {
    nav.params = new URLSearchParams('publicStatus=hidden');
    setItems([], { total: 0 });
    renderPage();

    expect(screen.getByText('Không có xe khớp bộ lọc')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Xoá bộ lọc' }).length).toBeGreaterThan(0);
  });

  it('tenantId (đi từ trang đối tác sang) tính là đang lọc và có chip mang tên gian hàng', () => {
    nav.params = new URLSearchParams('tenantId=t1');
    setItems([vehicle()]);
    renderPage();

    expect(screen.getByText('Gian hàng: Gian hàng Demo')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Bỏ lọc theo gian hàng'));
    expect(lastUrl()).not.toContain('tenantId=');
  });

  it('tenantId mà chưa có dòng nào: chip nói chung chung, không đoán tên', () => {
    nav.params = new URLSearchParams('tenantId=t-9');
    setItems([], { total: 0 });
    renderPage();

    expect(screen.getByText('Đang lọc theo một gian hàng')).toBeTruthy();
    expect(screen.getByText('Không có xe khớp bộ lọc')).toBeTruthy();
  });
});

describe('Xe toàn hệ thống — bộ lọc, sắp xếp và URL', () => {
  it('mặc định mọi chiều là "all", sort mặc định không gửi, `open` KHÔNG đi vào truy vấn', () => {
    nav.params = new URLSearchParams('open=v1');
    setItems([vehicle()]);
    renderPage();

    expect(query.lastFilters).toEqual({
      q: undefined,
      tenantId: undefined,
      publicStatus: 'all',
      operationStatus: 'all',
      vehicleType: 'all',
      serviceType: 'all',
      provinceCode: 'all',
      tenantStatus: 'all',
      marketplaceVisible: 'all',
      sort: undefined,
      page: undefined,
      limit: undefined,
    });
  });

  it('giá trị lạ trên URL rơi về mặc định thay vì lên server', () => {
    nav.params = new URLSearchParams('publicStatus=abc&sort=zzz&serviceType=teleport&limit=9999');
    setItems([vehicle()]);
    renderPage();

    expect(query.lastFilters).toMatchObject({
      publicStatus: 'all',
      sort: undefined,
      serviceType: 'all',
      limit: undefined,
    });
  });

  it('"Xoá bộ lọc" trả mọi bộ lọc về mặc định nhưng GIỮ sắp xếp và xe đang mở', () => {
    nav.params = new URLSearchParams(
      'q=abc&tenantId=t9&publicStatus=hidden&operationStatus=maintenance&vehicleType=car&serviceType=with_driver&provinceCode=79&tenantStatus=suspended&marketplaceVisible=true&page=4&sort=name&open=v1',
    );
    setItems([], { total: 0 });
    renderPage();

    fireEvent.click(screen.getAllByRole('button', { name: 'Xoá bộ lọc' })[0]!);

    const url = lastUrl();
    for (const key of [
      'q=',
      'tenantId=',
      'publicStatus=',
      'operationStatus=',
      'vehicleType=',
      'serviceType=',
      'provinceCode=',
      'tenantStatus=',
      'marketplaceVisible=',
      'page=',
    ]) {
      expect(url).not.toContain(key);
    }
    expect(url).toContain('sort=name');
    expect(url).toContain('open=v1');
  });

  it('tab góc nhìn mang số đếm từ cùng lần đọc', () => {
    setItems([vehicle()]);
    renderPage();

    expect(screen.getByRole('tab', { name: /Tất cả/ }).textContent).toContain('1.245');
    expect(screen.getByRole('tab', { name: /Chờ duyệt/ }).textContent).toContain('12');
    expect(screen.getByRole('tab', { name: /Nền tảng đã ẩn/ }).textContent).toContain('3');
  });

  it('tab sáng suy từ BA tham số cùng lúc — một tham số đúng là chưa đủ', () => {
    nav.params = new URLSearchParams('tenantStatus=suspended');
    setItems([vehicle()]);
    renderPage();
    expect(selectedTab()).toContain('Gian hàng bị khoá');

    cleanup();
    nav.params = new URLSearchParams('publicStatus=hidden&tenantStatus=suspended');
    setItems([vehicle()]);
    renderPage();
    expect(selectedTab()).toBeNull();
  });

  it('bộ lọc tay không có tên (publicStatus=draft) thì không tab nào sáng', () => {
    nav.params = new URLSearchParams('publicStatus=draft');
    setItems([vehicle()]);
    renderPage();

    expect(selectedTab()).toBeNull();
  });

  /*
   * ADR 0048: "Đang hiển thị" KHÔNG được lọc bằng `publicStatus=approved_public`.
   *
   * Cột đó vẫn là `approved_public` khi chủ xe tắt công tắc hoặc gian hàng bị khoá, nên bộ lọc
   * cũ trả về một danh sách có lẫn xe không ai nhìn thấy — dưới đúng cái nhãn "Đang hiển thị".
   */
  it('tab "Đang hiển thị" lọc theo kết quả hiệu lực, không theo trạng thái kiểm duyệt', () => {
    setItems([vehicle()]);
    renderPage();

    fireEvent.click(screen.getByRole('tab', { name: /Đang hiển thị/ }));

    const url = lastUrl();
    expect(url).toContain('marketplaceVisible=true');
    expect(url).not.toContain('publicStatus=');
  });

  it('tab "Chờ duyệt" ghi publicStatus và XOÁ hai chiều còn lại (trạng thái đích, không cộng dồn)', () => {
    nav.params = new URLSearchParams('tenantStatus=suspended');
    setItems([vehicle()]);
    renderPage();

    fireEvent.click(screen.getByRole('tab', { name: /Chờ duyệt/ }));

    const url = lastUrl();
    expect(url).toContain('publicStatus=pending_public_review');
    expect(url).not.toContain('tenantStatus=');
  });

  it('sort=updated đi lên server và cột ngày đổi thành "Cập nhật"', () => {
    nav.params = new URLSearchParams('sort=updated');
    setItems([vehicle()]);
    renderPage();

    expect(query.lastFilters).toMatchObject({ sort: 'updated' });
    expect(screen.getByRole('columnheader', { name: 'Cập nhật' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Ngày tạo' })).toBeNull();
  });

  it('đổi trang ghi page và limit vào URL', () => {
    setItems([vehicle()], { total: 60, hasNext: true });
    renderPage();

    fireEvent.click(screen.getByTitle('2'));

    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(lastUrl()).toContain('page=2');
  });
});

describe('filterBarPatch', () => {
  it('sort mặc định hoặc lạ thì XOÁ tham số; khoá lạ bị bỏ qua', () => {
    expect(filterBarPatch({ sort: 'newest' })).toEqual({ sort: undefined });
    expect(filterBarPatch({ sort: 'zzz' })).toEqual({ sort: undefined });
    expect(filterBarPatch({ sort: 'price_desc' })).toEqual({ sort: 'price_desc' });
    expect(filterBarPatch({ vehicleType: 'car', tenantId: 'x' })).toEqual({ vehicleType: 'car' });
  });
});

describe('Xe toàn hệ thống — dữ liệu và panel chi tiết', () => {
  it('ô định danh gộp mã, biển số và loại xe', () => {
    setItems([vehicle()]);
    renderPage();

    expect(screen.getByText('Honda SH 150i')).toBeTruthy();
    expect(screen.getByText('XM-001 · 59X1-333.44 · Xe máy')).toBeTruthy();
  });

  it('gian hàng bị khoá được gắn nhãn ngay trong ô gian hàng; gian hàng thường thì không', () => {
    setItems([vehicle({ tenantStatus: 'suspended' })]);
    const { container } = renderPage();
    expect(container.querySelectorAll('.ant-tag').length).toBeGreaterThan(3);

    cleanup();
    setItems([vehicle({ tenantStatus: 'active' })]);
    const second = renderPage();
    expect(second.container.querySelectorAll('.ant-tag').length).toBe(3);
  });

  it('xe chưa từng lên sàn hiện chữ riêng, không phải StatusTag', () => {
    setItems([vehicle({ listingStatus: null })]);
    renderPage();

    expect(screen.getByText('Chưa lên sàn')).toBeTruthy();
  });

  it('giá hiển thị theo định dạng VND, tổng theo đơn vị "xe"', () => {
    setItems([vehicle({ weekdayPrice: '350000' })], { total: 245 });
    renderPage();

    expect(screen.getByText('350.000 ₫')).toBeTruthy();
    expect(screen.getByText('245 xe')).toBeTruthy();
  });

  it('mỗi hàng đúng một hành động — bề mặt giám sát, không sửa tại chỗ', () => {
    setItems([vehicle()]);
    renderPage();

    expect(within(bodyRows()[0]!).getAllByRole('button')).toHaveLength(1);
  });

  it('"Xem chi tiết" ghi ?open=ID, GIỮ trang hiện tại', () => {
    nav.params = new URLSearchParams('page=2');
    setItems([vehicle({ id: 'v-42' })], { page: 2 });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết' }));
    expect(lastUrl()).toBe('/admin/vehicles?page=2&open=v-42');
  });

  it('xe đang mở ở URL → panel nhận id + hàng xóm trước/sau, hàng đó được đánh dấu', () => {
    nav.params = new URLSearchParams('open=v2');
    setItems([vehicle(), vehicle({ id: 'v2' }), vehicle({ id: 'v3' })]);
    renderPage();

    expect(drawer).toMatchObject({ vehicleId: 'v2', previousId: 'v1', nextId: 'v3' });
    expect(bodyRows()[1]!.getAttribute('aria-current')).toBe('true');
  });

  it('ẩn xong, xe rời góc nhìn "Đang hiển thị": trước/sau vẫn theo thứ tự lúc mở', () => {
    nav.params = new URLSearchParams('marketplaceVisible=true&open=v2');
    setItems([vehicle(), vehicle({ id: 'v2' }), vehicle({ id: 'v3' })]);
    const { rerender } = renderPage();
    expect(drawer).toMatchObject({ vehicleId: 'v2', previousId: 'v1', nextId: 'v3' });

    setItems([vehicle(), vehicle({ id: 'v3' })]);
    rerender(
      <App>
        <AdminVehiclesPage />
      </App>,
    );
    expect(drawer).toMatchObject({ vehicleId: 'v2', previousId: 'v1', nextId: 'v3' });

    act(() => drawer.onNavigate('v3'));
    expect(lastUrl()).toContain('open=v3');
    expect(lastUrl()).toContain('marketplaceVisible=true');
  });
});
