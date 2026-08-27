import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION } from '@xeprime/types';
import MaintenancePage from './page';
import type {
  MaintenanceBoardItem,
  MaintenanceBoardSummary,
} from '@/features/vehicle-maintenance/types';

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  params: new URLSearchParams(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  usePathname: () => '/manage/maintenance',
  useSearchParams: () => nav.params,
}));

const layout = vi.hoisted(() => ({ mobile: false }));
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => layout.mobile,
  useIsTablet: () => false,
  useIsDesktop: () => !layout.mobile,
  useMediaQuery: () => false,
}));

/**
 * Hàng đợi "Thiếu KM trả" (Wave 8) sống ở trang này nhưng dữ liệu đến từ bàn giao — mock ở
 * tầng hook như các nhóm việc khác (harness không có QueryClientProvider).
 */
const queue = vi.hoisted(() => ({
  data: undefined as { items: unknown[]; meta: unknown } | undefined,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
  enabled: undefined as boolean | undefined,
}));
vi.mock('@/features/handovers/hooks', () => ({
  useMissingOdometerQueue: (_params: unknown, enabled?: boolean) => {
    queue.enabled = enabled;
    return queue;
  },
  useHandoverContext: () => ({ data: undefined, isLoading: true, isError: false }),
  useInvalidateHandovers: () => vi.fn(),
}));
vi.mock('@/features/vehicles/hooks/use-vehicle-alerts', () => ({
  useVehicleAlerts: () => ({ byId: new Map(), isLoading: false, isError: false }),
  useInvalidateVehicleSurfaces: () => vi.fn(),
}));

const permissions = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (permission: string) => permissions.granted.has(permission),
    hasAny: (...keys: string[]) => keys.some((key) => permissions.granted.has(key)),
    isLoading: false,
  }),
}));

const queries = vi.hoisted(() => ({
  board: {
    data: undefined as { items: MaintenanceBoardItem[]; meta: unknown } | undefined,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  },
  summary: {
    data: undefined as MaintenanceBoardSummary | undefined,
    isLoading: false,
    refetch: vi.fn(),
  },
  boardEnabled: undefined as boolean | undefined,
  lastFilters: undefined as Record<string, unknown> | undefined,
}));
vi.mock('@/features/vehicle-maintenance/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/vehicle-maintenance/hooks')>();
  return {
    // Hook filter THẬT: test này phải chứng minh bộ lọc đi qua URL (ADR 0004).
    useMaintenanceBoardFilters: actual.useMaintenanceBoardFilters,
    useMaintenanceBoard: (filters: Record<string, unknown>, enabled?: boolean) => {
      queries.lastFilters = filters;
      queries.boardEnabled = enabled;
      return queries.board;
    },
    useMaintenanceBoardSummary: () => queries.summary,
    useMaintenanceProfile: () => ({ data: undefined, isLoading: true, isError: false }),
    useMaintenanceRecords: () => ({ data: [], isLoading: false, isError: false }),
    useOdometerHistory: () => ({ data: undefined, isLoading: true, isError: false }),
    useInvalidateMaintenance: () => vi.fn(),
  };
});

function item(overrides: Partial<MaintenanceBoardItem> = {}): MaintenanceBoardItem {
  return {
    vehicleId: 'vehicle-1',
    vehicleName: 'Toyota Vios 2024',
    vehicleCode: 'XP-V001',
    plateNumber: '51A-123.45',
    operationStatus: 'available',
    mainImageUrl: null,
    currentOdometerKm: 45_230,
    currentOdometerAt: '2026-08-05T03:00:00.000Z',
    oilChangeIntervalKm: 5_000,
    nextMaintenanceKm: 45_000,
    remainingKm: -230,
    dueStatus: 'overdue',
    dueSoonKm: 500,
    activeRecord: null,
    lastCompletedAt: '2026-07-15T02:00:00.000Z',
    expiringDocumentCount: 0,
    updatedAt: '2026-08-05T03:00:00.000Z',
    ...overrides,
  } as MaintenanceBoardItem;
}

const summary: MaintenanceBoardSummary = {
  total: 26,
  overdue: 3,
  dueSoon: 5,
  inProgress: 2,
  missingOdometer: 4,
  upcoming: 5,
  expiringDocuments: 1,
  missingReturnKm: 2,
};

function renderPage() {
  return render(
    <App>
      <MaintenancePage />
    </App>,
  );
}

beforeEach(() => {
  permissions.granted = new Set([
    PERMISSION.VEHICLE_MAINTENANCE_VIEW,
    PERMISSION.VEHICLE_MAINTENANCE_MANAGE,
    PERMISSION.VEHICLE_ODOMETER_CORRECT,
  ]);
  layout.mobile = false;
  nav.params = new URLSearchParams();
  nav.replace.mockClear();
  queries.board = {
    data: { items: [item()], meta: { page: 1, limit: 20, total: 26, hasNext: true } },
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  };
  queries.summary = { data: summary, isLoading: false, refetch: vi.fn() };
  queue.data = undefined;
  queue.isFetching = false;
  queue.isError = false;
  queue.enabled = undefined;
  queue.refetch = vi.fn();
});
afterEach(cleanup);

describe('/manage/maintenance — Trung tâm bảo dưỡng (Wave 6)', () => {
  it('thiếu quyền: hiện màn không có quyền và KHÔNG gọi API danh sách', () => {
    permissions.granted = new Set();
    renderPage();
    expect(screen.getByText('Không có quyền xem trung tâm bảo dưỡng')).toBeTruthy();
    expect(queries.boardEnabled).toBe(false);
  });

  it('dải việc-cần-làm hiện đủ nhóm kèm số đếm toàn đội xe (không phải của trang hiện tại)', () => {
    renderPage();
    const tablist = screen.getByRole('tablist', { name: 'Nhóm việc bảo dưỡng' });
    for (const label of [
      'Tất cả',
      'Quá hạn',
      'Sắp đến hạn',
      'Đang bảo dưỡng',
      'Thiếu dữ liệu KM',
      'Lịch sắp tới',
    ]) {
      expect(screen.getByRole('tab', { name: new RegExp(label) })).toBeTruthy();
    }
    // Số đếm đến từ endpoint summary riêng — 26 xe tổng dù trang chỉ có 1 dòng.
    expect(tablist.textContent).toContain('26');
    expect(tablist.textContent).toContain('3');
  });

  it('chọn nhóm việc ghi vào URL, không giữ trong state cục bộ (ADR 0004)', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Quá hạn/ }));
    expect(String(nav.replace.mock.calls.at(-1)?.[0])).toContain('filter=overdue');
  });

  it('tìm kiếm đẩy lên URL và về trang 1', async () => {
    nav.params = new URLSearchParams('page=4');
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Tên xe, mã xe hoặc biển số/), {
      target: { value: 'vios' },
    });
    await waitFor(
      () => {
        const url = String(nav.replace.mock.calls.at(-1)?.[0] ?? '');
        expect(url).toContain('q=vios');
        expect(url).not.toContain('page=4');
      },
      { timeout: 2000 },
    );
  });

  it('desktop: bảng có cột thao tác dính phải và bề rộng tối thiểu để cuộn ngang', () => {
    const view = renderPage();
    expect(screen.getByRole('region', { name: 'Danh sách xe cần bảo dưỡng' })).toBeTruthy();

    // Cột giữ bề rộng sàn (1120px) và vùng bảng tự cuộn ngang — KHÔNG nén cột cho vừa.
    const table = view.container.querySelector('table') as HTMLTableElement;
    expect(table).toBeTruthy();
    expect(Number.parseInt(table.style.width, 10)).toBeGreaterThanOrEqual(1000);
    const scrollArea = view.container.querySelector('.ant-table-content') as HTMLElement;
    expect(scrollArea.style.overflowX).toBe('auto');
    // Cột thao tác cố định bên phải, nếu không cuộn ngang là mất nút.
    // AntD 6 dùng thuật ngữ logical: `fix-end`.
    expect(view.container.querySelector('.ant-table-cell-fix-end')).toBeTruthy();
    // Vùng cuộn nằm TRONG khung bảng, không đẩy tràn ngang ra cấp trang.
    expect(view.container.querySelector('[class*="tableRoot"]')).toBeTruthy();
  });

  it('desktop: KM và ngày canh phải, quá hạn nói rõ vượt bao nhiêu', () => {
    renderPage();
    expect(screen.getByText('45.230 km')).toBeTruthy();
    // Nói rõ vượt bao nhiêu, không chỉ gắn nhãn đỏ.
    expect(screen.getByText('Quá hạn 230 km')).toBeTruthy();
    expect(screen.getAllByText('Quá hạn').length).toBeGreaterThan(0);
  });

  it('xe thiếu KM: gắn nhãn riêng thay vì hiện 0 km, và mốc tiếp theo là "—"', () => {
    queries.board.data = {
      items: [
        item({
          currentOdometerKm: null,
          currentOdometerAt: null,
          nextMaintenanceKm: null,
          remainingKm: null,
          dueStatus: 'unknown',
        }),
      ],
      meta: { page: 1, limit: 20, total: 1, hasNext: false },
    };
    renderPage();
    expect(screen.getByText('Thiếu KM')).toBeTruthy();
    expect(screen.getAllByText('Chưa đủ dữ liệu').length).toBeGreaterThan(0);
    // Chưa biết số thì để trống/nói thẳng, KHÔNG dựng "0 km" (docs §9).
    expect(screen.queryByText('0 km')).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('mobile: đổi sang thẻ gọn, KHÔNG render bảng desktop', () => {
    layout.mobile = true;
    const view = renderPage();
    expect(view.container.querySelector('table')).toBeNull();
    expect(screen.getByRole('list', { name: 'Danh sách xe cần bảo dưỡng' })).toBeTruthy();
    expect(screen.getByText('Toyota Vios 2024')).toBeTruthy();
    // Hành động trên thẻ dùng RowActions chung; mobile vẫn giữ vùng chạm 44px.
    expect(screen.getAllByRole('button', { name: 'Chi tiết' }).length).toBeGreaterThan(0);
  });

  it('thiếu quyền quản lý: thẻ mobile vẫn xem được chi tiết nhưng không có nút sửa/hoàn tất', () => {
    layout.mobile = true;
    permissions.granted = new Set([PERMISSION.VEHICLE_MAINTENANCE_VIEW]);
    renderPage();
    expect(screen.getByRole('button', { name: 'Chi tiết' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Lên lịch|Sửa lịch|Hoàn tất/ })).toBeNull();
  });

  it('không có kết quả sau khi lọc: gợi ý xoá bộ lọc thay vì màn rỗng chung', () => {
    nav.params = new URLSearchParams('q=khongco');
    queries.board.data = { items: [], meta: { page: 1, limit: 20, total: 0, hasNext: false } };
    renderPage();
    expect(screen.getByText('Không có xe nào khớp bộ lọc')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xóa bộ lọc' })).toBeTruthy();
  });

  it('lỗi tải lần đầu: hiện lỗi có nút thử lại', () => {
    queries.board = { data: undefined, isFetching: false, isError: true, refetch: vi.fn() };
    renderPage();
    expect(screen.getByText('Không tải được danh sách bảo dưỡng')).toBeTruthy();
  });

  it('bộ lọc gửi xuống API đúng như trên URL', () => {
    nav.params = new URLSearchParams('filter=due_soon&type=oil_change&sort=name_asc&page=2');
    renderPage();
    expect(queries.lastFilters).toMatchObject({
      filter: 'due_soon',
      type: 'oil_change',
      sort: 'name_asc',
      page: 2,
    });
  });
});

describe('/manage/maintenance — nhóm việc "Thiếu KM trả" theo quyền (Wave 8.1)', () => {
  it('có handovers.view: tab hiện kèm số đếm', () => {
    permissions.granted.add(PERMISSION.HANDOVER_VIEW);
    renderPage();

    const tab = screen.getByRole('tab', { name: /Thiếu KM trả/ });
    expect(tab).toBeTruthy();
    expect(tab.textContent).toContain('2');
  });

  it('thiếu handovers.view: tab BIẾN MẤT hẳn, không hiện tab luôn báo 0', () => {
    renderPage(); // chỉ có quyền bảo dưỡng
    expect(screen.queryByRole('tab', { name: /Thiếu KM trả/ })).toBeNull();
    // Các nhóm việc bảo dưỡng khác vẫn nguyên.
    expect(screen.getByRole('tab', { name: /Quá hạn/ })).toBeTruthy();
  });

  it('gõ tay filter=missing_return_km mà thiếu quyền: chuẩn hoá về nhóm mặc định', () => {
    nav.params = new URLSearchParams('filter=missing_return_km');
    renderPage();

    // Không mở hàng đợi và KHÔNG gọi API bàn giao.
    expect(queue.enabled).toBe(false);
    expect(screen.queryByRole('list', { name: 'Việc thiếu KM trả' })).toBeNull();
    // Bảng đội xe vẫn chạy với nhóm "Tất cả".
    expect(queries.lastFilters).toMatchObject({ filter: 'all' });
    expect(screen.getByRole('region', { name: 'Danh sách xe cần bảo dưỡng' })).toBeTruthy();
  });

  it('có quyền + filter hàng đợi: đổi sang bảng biên bản, không gọi bảng đội xe', () => {
    permissions.granted.add(PERMISSION.HANDOVER_VIEW);
    nav.params = new URLSearchParams('filter=missing_return_km');
    queue.data = { items: [], meta: { page: 1, limit: 20, total: 0, hasNext: false } };
    renderPage();

    expect(queue.enabled).toBe(true);
    expect(queries.boardEnabled).toBe(false);
    expect(screen.getByText('Không còn việc thiếu KM trả')).toBeTruthy();
  });
});
