import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/i18n/test-utils';
import { ApiClientError } from '@/services/api-client';
import { DRIVER_DETAIL_TAB, type DriverAssignmentRow, type DriverDetailTab, type DriverOverview } from '../types';
import { DriverDetailDrawer } from './DriverDetailDrawer';

/**
 * Ngăn chi tiết tài xế (ADR 0075) — tầng dữ liệu (hook + API) là giả, mọi thứ còn lại thật: khoá
 * lời hứa hiển thị (thẻ số, độ tin cậy "—" thay vì 0%, tab, bảng kê) mà không cần server.
 */

const state = vi.hoisted(() => ({
  overview: null as unknown,
  overviewError: null as unknown,
  rows: [] as unknown[],
  canManage: true,
  fetchAll: vi.fn(),
  download: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock('../hooks/use-drivers', () => ({
  useDriverOverview: (id: string | null) => ({
    data: id && state.overview ? state.overview : undefined,
    isError: Boolean(state.overviewError),
    error: state.overviewError,
    refetch: state.refetch,
  }),
  useDriverAssignments: () => ({
    data: {
      items: state.rows,
      meta: { page: 1, limit: 10, total: state.rows.length, hasNext: false },
    },
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useDriverWageSettings: () => ({ data: { dailyWage: '500000' } }),
}));
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  fetchAllDriverAssignments: state.fetchAll,
}));
vi.mock('../wage-statement', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../wage-statement')>()),
  downloadCsv: state.download,
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ has: () => state.canManage }),
}));
// Biểu đồ vẽ bằng SVG đo kích thước — jsdom không có layout; chỉ cần biết nó nhận đúng điểm.
vi.mock('@/components/chart/MoneyVolumeChart', () => ({
  MoneyVolumeChart: (props: { title: string; points: unknown[]; empty: { title: string } | null }) => (
    <section aria-label={props.title}>
      {props.empty ? props.empty.title : `${props.points.length} điểm`}
    </section>
  ),
}));

const DRIVER = {
  id: 'drv-1',
  name: 'Nguyễn An',
  phone: '0912000111',
  driverType: 'full_time',
  note: null,
  linkStatus: 'active',
  invitedAt: '2026-09-01T02:00:00.000Z',
  respondedAt: '2026-09-01T03:00:00.000Z',
  endedAt: null,
  endedByParty: null,
  account: { displayName: 'An Nguyễn', avatarUrl: null },
  licence: { state: 'verified', classes: ['B'], expiresOn: '2030-01-01', fullName: null, kind: null },
  activeBookingCount: 1,
  currentOpenLinkStatus: null,
  dropCount: 1,
  criticalDropCount: 1,
  autoAssignCooldownUntil: null,
  monthCompletedTrips: 1,
  monthWageTotal: '1200000',
};

function overview(over: Partial<DriverOverview> = {}): DriverOverview {
  return {
    driver: DRIVER,
    month: {
      month: '2026-10',
      completedTrips: 1,
      drivenDays: 2,
      completedWage: '1200000',
      agreedTrips: 0,
      agreedWage: '0',
      wageTotal: '1200000',
      averageDailyWage: '600000',
      editedTrips: 1,
    },
    upcoming: { acceptedTrips: 1, acceptedWage: '1500000', pendingTrips: 1 },
    reliability: {
      windowDays: 90,
      decided: 3,
      accepted: 2,
      declined: 1,
      expired: 0,
      acceptRate: 67,
      medianResponseMinutes: 12,
    },
    trend: Array.from({ length: 6 }, (_, i) => ({
      month: `2026-0${i + 5}`,
      trips: i === 5 ? 1 : 0,
      wageTotal: i === 5 ? '1200000' : '0',
    })),
    ...over,
  } as DriverOverview;
}

const ROW: DriverAssignmentRow = {
  id: 'asg-1',
  bookingId: 'bk-1',
  bookingCode: 'DH0001',
  pickupAt: '2026-10-01T02:00:00.000Z',
  returnAt: '2026-10-03T02:00:00.000Z',
  outcome: 'completed',
  endedAt: '2026-10-03T02:00:00.000Z',
  stage: 'completed',
  wageAmount: '1200000',
  wageDays: 2,
  vehiclePlate: '51K-123.45',
  vehicleName: 'Innova 2022',
};

const props = {
  onNavigate: vi.fn(),
  onTabChange: vi.fn(),
  onMonthChange: vi.fn(),
  onEdit: vi.fn(),
  onClose: vi.fn(),
};

function renderDrawer(tab?: DriverDetailTab) {
  return renderWithIntl(
    <App>
      <DriverDetailDrawer
        driverId="drv-1"
        month="2026-10"
        tab={tab}
        previousId={null}
        nextId="drv-2"
        {...props}
      />
    </App>,
  );
}

beforeEach(() => {
  state.overview = overview();
  state.overviewError = null;
  state.rows = [ROW];
  state.canManage = true;
  state.fetchAll.mockReset().mockResolvedValue([ROW]);
  state.download.mockReset();
  Object.values(props).forEach((fn) => fn.mockReset());
});
afterEach(cleanup);

describe('DriverDetailDrawer', () => {
  it('tổng quan: bốn thẻ, tiền công tháng, độ tin cậy, xu hướng', () => {
    renderDrawer();
    expect(screen.getAllByText('Nguyễn An').length).toBeGreaterThan(0);
    expect(screen.getByText('Tiền công ghi nhận')).toBeTruthy();
    expect(screen.getAllByText(/1\.200\.000/).length).toBeGreaterThan(0);
    expect(screen.getByText('2 ngày lái')).toBeTruthy();
    expect(screen.getByText(/600\.000/)).toBeTruthy();
    expect(screen.getByText(/Mức chung 500\.000/)).toBeTruthy();
    expect(screen.getByText(/Dự kiến 1\.500\.000/)).toBeTruthy();
    expect(screen.getByText('67%')).toBeTruthy();
    expect(screen.getByText('(2/3 lượt)')).toBeTruthy();
    expect(screen.getByText('1 lần · 1 lần sát giờ')).toBeTruthy();
    expect(screen.getByLabelText('Tiền công 6 tháng gần nhất').textContent).toBe('6 điểm');
  });

  it('chưa được gán lần nào: tỉ lệ nhận là "chưa có", không phải 0%; xu hướng trống có lời', () => {
    state.overview = overview({
      reliability: {
        windowDays: 90,
        decided: 0,
        accepted: 0,
        declined: 0,
        expired: 0,
        acceptRate: null,
        medianResponseMinutes: null,
      },
      month: {
        month: '2026-10',
        completedTrips: 0,
        drivenDays: 0,
        completedWage: '0',
        agreedTrips: 0,
        agreedWage: '0',
        wageTotal: '0',
        averageDailyWage: null,
        editedTrips: 0,
      },
      trend: Array.from({ length: 6 }, (_, i) => ({ month: `2026-0${i + 5}`, trips: 0, wageTotal: '0' })),
    });
    renderDrawer();
    expect(screen.getByText('Chưa được gán chuyến nào')).toBeTruthy();
    expect(screen.queryByText('0%')).toBeNull();
    expect(screen.getByText('Chưa có chuyến nào kết thúc trong 6 tháng này.')).toBeTruthy();
  });

  it('đổi tab và sang tài xế sau báo lên trang (URL)', () => {
    renderDrawer();
    fireEvent.click(screen.getByRole('tab', { name: 'Chuyến & tiền công' }));
    expect(props.onTabChange).toHaveBeenCalledWith(DRIVER_DETAIL_TAB.TRIPS);
    fireEvent.click(screen.getByRole('button', { name: 'Tài xế sau' }));
    expect(props.onNavigate).toHaveBeenCalledWith('drv-2');
    expect((screen.getByRole('button', { name: 'Tài xế trước' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('tab chuyến: bảng có xe + biển số; tải bảng kê gom cả tháng rồi tải CSV', async () => {
    renderDrawer(DRIVER_DETAIL_TAB.TRIPS);
    const table = screen.getByRole('table');
    expect(within(table).getByText('DH0001')).toBeTruthy();
    expect(within(table).getByText('Innova 2022')).toBeTruthy();
    expect(within(table).getByText('51K-123.45')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Tải bảng kê/ }));
    await waitFor(() => expect(state.download).toHaveBeenCalledTimes(1));
    expect(state.fetchAll).toHaveBeenCalledWith('drv-1', '2026-10');
    const [fileName, csv] = state.download.mock.calls[0] as [string, string];
    expect(fileName).toBe('bang-ke-tien-cong-2026-10-0912000111.csv');
    expect(csv).toContain('Mã đơn,Xe,Biển số');
    expect(csv).toContain('Tổng,,,,,,,1200000');
  });

  it('tab chuyến: tháng không có chuyến thì nút tải bảng kê tắt', () => {
    state.rows = [];
    renderDrawer(DRIVER_DETAIL_TAB.TRIPS);
    expect(
      (screen.getByRole('button', { name: /Tải bảng kê/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('tab hồ sơ: mốc liên kết + ghi chú trống có lời; không có quyền quản lý thì không có nút sửa', () => {
    state.canManage = false;
    renderDrawer(DRIVER_DETAIL_TAB.PROFILE);
    expect(screen.getByText('An Nguyễn')).toBeTruthy();
    expect(screen.getByText('Chưa có ghi chú')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Sửa thông tin/ })).toBeNull();
  });

  it('có quyền quản lý: nút sửa mở hộp sửa của đúng tài xế', () => {
    renderDrawer(DRIVER_DETAIL_TAB.PROFILE);
    fireEvent.click(screen.getByRole('button', { name: /Sửa thông tin/ }));
    expect(props.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'drv-1' }));
  });

  it('404: nói đúng lý do, không mời thử lại', () => {
    state.overview = null;
    state.overviewError = new ApiClientError({ code: 'NOT_FOUND', message: 'x', status: 404 });
    renderDrawer();
    expect(screen.getByText('Không tìm thấy tài xế này — có thể liên kết đã bị gỡ.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Thử lại/ })).toBeNull();
  });
});
