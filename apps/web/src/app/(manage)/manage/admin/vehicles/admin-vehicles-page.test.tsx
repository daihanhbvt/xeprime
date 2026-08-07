import { App } from 'antd';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminVehicle } from '@/features/admin-vehicles/types';

import AdminVehiclesPage from './page';

/**
 * Test ĐẶC TẢ cho `/manage/admin/vehicles` — viết TRƯỚC khi migrate.
 *
 * Rủi ro TRUNG BÌNH: chỉ đọc + mở panel chi tiết, nhưng có hai thứ dễ mất khi gom:
 *  1. **lối tắt Segmented** suy trạng thái từ HAI tham số (`publicStatus` + `tenantStatus`) —
 *     đây là logic riêng của module, không được đẩy vào `FilterBar`;
 *  2. cột "Trên sàn" có nhánh **chưa từng lên sàn** hiển thị khác hẳn một StatusTag.
 */

const nav = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => '/manage/admin/vehicles',
  useSearchParams: () => nav.params,
}));

const query = vi.hoisted(() => ({
  data: undefined as { items: unknown[]; meta: unknown } | undefined,
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

const drawer = vi.hoisted(() => ({ vehicleId: null as string | null }));

vi.mock('@/features/admin-vehicles/components/AdminVehicleDetailDrawer', () => ({
  AdminVehicleDetailDrawer: ({ vehicleId }: { vehicleId: string | null }) => {
    drawer.vehicleId = vehicleId;
    return vehicleId ? <div data-testid="vehicle-drawer">{vehicleId}</div> : null;
  },
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
    operationStatus: 'available',
    publicStatus: 'approved_public',
    listingStatus: 'active',
    weekdayPrice: '350000',
    tenantId: 't1',
    tenantName: 'Gian hàng Demo',
    tenantStatus: 'active',
    provinceName: 'TP. Hồ Chí Minh',
    createdAt: '2026-07-01T00:00:00.000Z',
    ...over,
  } as AdminVehicle;
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

beforeEach(() => {
  nav.replace.mockReset();
  nav.params = new URLSearchParams();
  query.refetch.mockReset();
  drawer.vehicleId = null;
  setQuery();
});

afterEach(cleanup);

describe('/manage/admin/vehicles — trạng thái', () => {
  it('lỗi khi chưa có dữ liệu: câu chữ riêng + Thử lại', () => {
    setQuery({ isError: true });
    renderPage();

    expect(screen.getByText('Không tải được danh sách xe')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });

  it('lỗi khi ĐÃ có dữ liệu thì giữ bảng', () => {
    setQuery({ isError: true, data: { items: [vehicle()], meta: META } });
    renderPage();

    expect(screen.getByText('Honda SH 150i')).toBeTruthy();
    expect(screen.queryByText('Không tải được danh sách xe')).toBeNull();
  });

  it('rỗng không lọc: "Chưa có xe nào trong hệ thống", không có nút xoá lọc', () => {
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.getByText('Chưa có xe nào trong hệ thống')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).toBeNull();
  });

  it('rỗng khi đang lọc: đổi câu chữ và mở lối xoá lọc', () => {
    nav.params = new URLSearchParams('publicStatus=hidden');
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.getByText('Không có xe khớp bộ lọc')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xoá bộ lọc' })).toBeTruthy();
  });

  it('tenantId cũng tính là đang lọc (đi từ trang gian hàng sang)', () => {
    nav.params = new URLSearchParams('tenantId=t-9');
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    expect(screen.getByText('Không có xe khớp bộ lọc')).toBeTruthy();
  });
});

describe('/manage/admin/vehicles — filter và URL', () => {
  it('bốn bộ lọc mặc định là "all" và được truyền xuống lớp dữ liệu', () => {
    setQuery({ data: { items: [vehicle()], meta: META } });
    renderPage();

    expect(query.lastFilters).toEqual({
      q: undefined,
      tenantId: undefined,
      publicStatus: 'all',
      operationStatus: 'all',
      vehicleType: 'all',
      tenantStatus: 'all',
      page: undefined,
      limit: undefined,
    });
  });

  it('"Xoá bộ lọc" trả cả sáu tham số về mặc định', () => {
    nav.params = new URLSearchParams(
      'q=abc&tenantId=t9&publicStatus=hidden&operationStatus=maintenance&vehicleType=car&tenantStatus=suspended&page=4',
    );
    setQuery({ data: { items: [], meta: { ...META, total: 0 } } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));

    expect(nav.replace).toHaveBeenCalledTimes(1);
    const url = lastUrl();
    for (const key of [
      'q=',
      'tenantId=',
      'publicStatus=',
      'operationStatus=',
      'vehicleType=',
      'tenantStatus=',
      'page=',
    ]) {
      expect(url).not.toContain(key);
    }
  });

  it('lối tắt suy trạng thái từ HAI tham số cùng lúc', () => {
    // Đây là logic riêng của module — nó phải ở lại trang, không được đẩy vào FilterBar.
    // "Của shop bị khoá" chỉ sáng khi publicStatus=all VÀ tenantStatus=suspended — một tham số
    // đúng là chưa đủ.
    nav.params = new URLSearchParams('publicStatus=all&tenantStatus=suspended');
    setQuery({ data: { items: [vehicle()], meta: META } });
    const { container } = renderPage();

    expect(container.querySelector('.ant-segmented-item-selected')!.textContent).toBe(
      'Của shop bị khoá',
    );

    cleanup();
    nav.params = new URLSearchParams('publicStatus=hidden&tenantStatus=suspended');
    const second = renderPage();
    expect(second.container.querySelector('.ant-segmented-item-selected')!.textContent).toBe(
      'Tất cả',
    );
  });

  it('không lối tắt nào khớp thì không sáng cái nào ngoài "Tất cả"', () => {
    nav.params = new URLSearchParams('publicStatus=all&tenantStatus=all');
    setQuery({ data: { items: [vehicle()], meta: META } });
    const { container } = renderPage();

    expect(container.querySelector('.ant-segmented-item-selected')!.textContent).toBe('Tất cả');
  });

  it('đổi trang ghi page và limit vào URL', () => {
    setQuery({
      data: { items: [vehicle()], meta: { page: 1, limit: 20, total: 60, hasNext: true } },
    });
    renderPage();

    fireEvent.click(screen.getByTitle('2'));

    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(lastUrl()).toContain('page=2');
  });
});

describe('/manage/admin/vehicles — dữ liệu', () => {
  it('ô định danh gộp mã, biển số và loại xe', () => {
    setQuery({ data: { items: [vehicle()], meta: META } });
    renderPage();

    expect(screen.getByText('Honda SH 150i')).toBeTruthy();
    expect(screen.getByText('XM-001 · 59X1-333.44 · Xe máy')).toBeTruthy();
  });

  it('gian hàng bị khoá được gắn nhãn ngay trong ô gian hàng', () => {
    const { container } = renderPageWith(vehicle({ tenantStatus: 'suspended' }));

    expect(container.querySelectorAll('.ant-tag').length).toBeGreaterThan(1);
  });

  it('gian hàng bình thường KHÔNG gắn nhãn trạng thái', () => {
    renderPageWith(vehicle({ tenantStatus: 'active' }));

    expect(screen.getByText('Gian hàng Demo')).toBeTruthy();
  });

  it('xe chưa từng lên sàn hiện chữ riêng, không phải StatusTag', () => {
    renderPageWith(vehicle({ listingStatus: null }));

    expect(screen.getByText('Chưa lên sàn')).toBeTruthy();
  });

  it('giá hiển thị qua formatMoneyVnd', () => {
    renderPageWith(vehicle({ weekdayPrice: '350000' }));

    expect(screen.getByText('350.000 ₫')).toBeTruthy();
  });

  it('"Xem" mở panel chi tiết đúng xe', () => {
    renderPageWith(vehicle({ id: 'v-42' }));

    fireEvent.click(screen.getByRole('button', { name: 'Xem' }));
    expect(drawer.vehicleId).toBe('v-42');
  });

  it('mỗi hàng đúng một hành động — bề mặt giám sát, không sửa tại chỗ', () => {
    renderPageWith(vehicle());

    expect(within(bodyRows()[0]!).getAllByRole('button')).toHaveLength(1);
  });

  it('tổng hiển thị theo đơn vị "xe"', () => {
    setQuery({ data: { items: [vehicle()], meta: { ...META, total: 245 } } });
    renderPage();

    expect(screen.getByText('245 xe')).toBeTruthy();
  });
});

function renderPageWith(item: AdminVehicle) {
  setQuery({ data: { items: [item], meta: META } });
  return renderPage();
}
