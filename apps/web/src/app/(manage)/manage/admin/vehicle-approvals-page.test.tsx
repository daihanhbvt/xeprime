import { App } from 'antd';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VehicleApprovalRow } from '@/features/approvals/types';
import VehicleApprovalsPage from './page';

/**
 * Trang "Duyệt xe" (`/manage/admin`).
 *
 * Khoá: bộ lọc/trang/phiếu đang mở sống ở URL (ADR 0004) và đi nguyên vào hook truy vấn SERVER;
 * tab mang số đếm từ cùng lần đọc; không có nút quyết định trên dòng; đủ trạng thái rỗng/lỗi.
 */
const nav = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => '/manage/admin',
  useSearchParams: () => nav.params,
}));

const query = vi.hoisted(() => ({
  data: undefined as
    | {
        items: unknown[];
        meta: unknown;
        counts: { all: number; car: number; motorbike: number };
      }
    | undefined,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
  lastFilters: undefined as unknown,
}));
vi.mock('@/features/approvals/hooks/use-vehicle-approvals', () => ({
  useVehicleApprovals: (filters: unknown) => {
    query.lastFilters = filters;
    return query;
  },
}));

const drawer = vi.hoisted(() => ({
  taskId: null as string | null,
  previousId: null as string | null,
  nextId: null as string | null,
  onNavigate: (() => undefined) as (taskId: string) => void,
}));
vi.mock('@/features/approvals/components/VehicleApprovalDrawer', () => ({
  VehicleApprovalDrawer: (props: typeof drawer) => {
    Object.assign(drawer, props);
    return null;
  },
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

function row(over: Partial<VehicleApprovalRow> = {}): VehicleApprovalRow {
  return {
    approvalTaskId: 'T1',
    approvalStatus: 'pending',
    vehicleId: 'V1',
    vehicleCode: 'XE-240608-014',
    vehicleName: 'Toyota Vios 2023',
    vehicleType: 'car',
    plateNumber: '75A-123.45',
    mainImageUrl: 'https://img.example/vios.jpg',
    storefrontKind: 'shop',
    sourceName: 'Huế Rental',
    submittedByName: 'Nguyễn Văn Minh',
    submittedAt: '2026-06-08T02:00:00.000Z',
    ...over,
  } as VehicleApprovalRow;
}

const META = { page: 1, limit: 20, total: 3, hasNext: false };
const COUNTS = { all: 16, car: 10, motorbike: 6 };

function setData(items: VehicleApprovalRow[], meta: Partial<typeof META> = {}) {
  query.data = { items, meta: { ...META, ...meta }, counts: COUNTS };
}

function renderPage() {
  return render(
    <App>
      <VehicleApprovalsPage />
    </App>,
  );
}

function lastUrl(): string {
  const calls = nav.replace.mock.calls;
  return calls.length ? (calls[calls.length - 1]![0] as string) : '';
}

beforeEach(() => {
  nav.replace.mockReset();
  nav.params = new URLSearchParams();
  query.data = undefined;
  query.isError = false;
  query.isFetching = false;
  query.refetch.mockReset();
  drawer.taskId = null;
});

afterEach(cleanup);

describe('Tiêu đề + bộ lọc mặc định', () => {
  it('tiêu đề "Duyệt xe" + mô tả; hàng đợi mặc định là phiếu CHỜ, mọi loại xe, mọi nguồn', () => {
    setData([row()]);
    renderPage();

    expect(screen.getByRole('heading', { name: 'Duyệt xe' })).toBeTruthy();
    expect(screen.getByText('Kiểm tra xe trước khi hiển thị trên nền tảng')).toBeTruthy();
    expect(query.lastFilters).toMatchObject({
      status: 'pending',
      vehicleType: 'all',
      storefrontKind: 'all',
    });
  });

  it('tab mang số đếm từ server: Tất cả 16 · Ô tô 10 · Xe máy 6', () => {
    setData([row()]);
    renderPage();

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Tất cả16', 'Ô tô10', 'Xe máy6']);
  });

  it('bấm tab "Xe máy" → ?vehicleType=motorbike, về trang 1', () => {
    nav.params = new URLSearchParams('page=3');
    setData([row()]);
    renderPage();

    fireEvent.click(screen.getByRole('tab', { name: /Xe máy/ }));
    expect(lastUrl()).toBe('/manage/admin?vehicleType=motorbike');
  });

  it('đọc bộ lọc từ URL và đưa NGUYÊN vào truy vấn server', () => {
    nav.params = new URLSearchParams(
      'vehicleType=motorbike&storefrontKind=personal&status=any&q=75A&page=2&submittedFrom=2026-06-01',
    );
    setData([row()]);
    renderPage();

    expect(query.lastFilters).toMatchObject({
      vehicleType: 'motorbike',
      storefrontKind: 'personal',
      status: 'any',
      q: '75A',
      page: 2,
      submittedFrom: '2026-06-01',
    });
  });

  it('giá trị rác trong URL rơi về mặc định thay vì thành một lỗi 400', () => {
    nav.params = new URLSearchParams('vehicleType=truck&storefrontKind=x&status=weird');
    setData([row()]);
    renderPage();

    expect(query.lastFilters).toMatchObject({
      vehicleType: 'all',
      storefrontKind: 'all',
      status: 'pending',
    });
  });
});

describe('Bảng', () => {
  it('dòng: ảnh, tên, mã, loại xe, nguồn đăng + tên nguồn, người gửi, trạng thái', () => {
    setData([
      row(),
      row({
        approvalTaskId: 'T2',
        vehicleCode: 'XE-240518-003',
        vehicleName: 'Yamaha Exciter 155',
        vehicleType: 'motorbike',
        storefrontKind: 'personal',
        sourceName: 'Trần Văn Nam',
        mainImageUrl: null,
      }),
    ]);
    renderPage();

    expect(screen.getByRole('img', { name: 'Ảnh đại diện của Toyota Vios 2023' })).toBeTruthy();
    expect(screen.getByText(/XE-240608-014/)).toBeTruthy();
    expect(screen.getByText('Huế Rental')).toBeTruthy();
    expect(screen.getByText('Trần Văn Nam')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Chưa có ảnh' })).toBeTruthy();
    expect(screen.getAllByText('Chờ duyệt').length).toBeGreaterThan(0);
  });

  it('KHÔNG có nút Phê duyệt / Từ chối trên dòng — phải mở chi tiết trước', () => {
    setData([row()]);
    renderPage();

    const table = screen.getByRole('table');
    expect(within(table).queryByRole('button', { name: /Phê duyệt|Từ chối/ })).toBeNull();
  });

  it('mở chi tiết → ?task=ID, GIỮ trang hiện tại', () => {
    nav.params = new URLSearchParams('page=2');
    setData([row()], { page: 2 });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết' }));
    expect(lastUrl()).toBe('/manage/admin?page=2&task=T1');
  });

  it('phiếu đang mở ở URL → drawer nhận id + hàng xóm trước/sau trong trang', () => {
    nav.params = new URLSearchParams('task=T2');
    setData([row(), row({ approvalTaskId: 'T2' }), row({ approvalTaskId: 'T3' })]);
    renderPage();

    expect(drawer).toMatchObject({ taskId: 'T2', previousId: 'T1', nextId: 'T3' });
  });

  it('duyệt xong, phiếu rời trang: trước/sau vẫn theo thứ tự lúc mở — không tắt cả hai nút', () => {
    setData([row(), row({ approvalTaskId: 'T2' }), row({ approvalTaskId: 'T3' })]);
    const { rerender } = renderPage();

    fireEvent.click(screen.getAllByRole('button', { name: 'Xem chi tiết' })[1]!);
    expect(lastUrl()).toBe('/manage/admin?task=T2');

    // URL đổi theo, rồi hàng đợi CHỜ nạp lại sau quyết định: T2 không còn trên trang.
    nav.params = new URLSearchParams('task=T2');
    setData([row(), row({ approvalTaskId: 'T3' })]);
    rerender(
      <App>
        <VehicleApprovalsPage />
      </App>,
    );
    expect(drawer).toMatchObject({ taskId: 'T2', previousId: 'T1', nextId: 'T3' });

    // Sang T3 (còn trên trang) ⇒ trở lại đọc thứ tự của trang hiện tại.
    act(() => drawer.onNavigate('T3'));
    nav.params = new URLSearchParams('task=T3');
    rerender(
      <App>
        <VehicleApprovalsPage />
      </App>,
    );
    expect(drawer).toMatchObject({ taskId: 'T3', previousId: 'T1', nextId: null });
  });

  it('vào thẳng bằng link/F5 (?task=): duyệt xong, trước/sau vẫn còn', () => {
    nav.params = new URLSearchParams('task=T2');
    setData([row(), row({ approvalTaskId: 'T2' }), row({ approvalTaskId: 'T3' })]);
    const { rerender } = renderPage();
    expect(drawer).toMatchObject({ taskId: 'T2', previousId: 'T1', nextId: 'T3' });

    setData([row(), row({ approvalTaskId: 'T3' })]);
    rerender(
      <App>
        <VehicleApprovalsPage />
      </App>,
    );
    expect(drawer).toMatchObject({ taskId: 'T2', previousId: 'T1', nextId: 'T3' });
  });

  it('phân trang ghi trang vào URL', () => {
    setData([row()], { total: 45, hasNext: true });
    renderPage();

    fireEvent.click(screen.getByTitle('2'));
    expect(lastUrl()).toBe('/manage/admin?page=2&limit=20');
  });
});

describe('Trạng thái', () => {
  it('lỗi khi chưa có dữ liệu: câu riêng + Thử lại', () => {
    query.isError = true;
    renderPage();

    expect(screen.getByText('Không tải được danh sách duyệt xe')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });

  it('rỗng ở hàng đợi mặc định: "Không có xe nào chờ duyệt"', () => {
    setData([], { total: 0 });
    renderPage();

    expect(screen.getByText('Không có xe nào chờ duyệt')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).toBeNull();
  });

  it('rỗng vì bộ lọc: câu khác + Xoá bộ lọc đưa về hàng đợi mặc định', () => {
    nav.params = new URLSearchParams('vehicleType=motorbike&q=abc');
    setData([], { total: 0 });
    renderPage();

    expect(screen.getByText('Không có xe khớp bộ lọc')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /Xoá bộ lọc/ })[0]!);
    expect(lastUrl()).toBe('/manage/admin');
  });
});
