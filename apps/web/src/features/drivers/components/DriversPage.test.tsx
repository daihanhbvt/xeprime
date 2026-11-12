import { App } from 'antd';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION } from '@xeprime/types';
import { renderWithIntl } from '@/i18n/test-utils';
import type { Driver, DriverSummary } from '../types';
import { DriversPage } from './DriversPage';

/**
 * Màn Quản lý tài xế (Figma `23737:41945`, 04/11/2026) — tầng dữ liệu là giả, phần còn lại thật:
 * khoá thẻ tài xế, dải số đếm là lối lọc trên URL (ADR 0004), và cổng quyền của các nút ghi.
 */

const nav = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  usePathname: () => '/manage/drivers',
  useSearchParams: () => nav.params,
}));

const state = vi.hoisted(() => ({
  items: [] as unknown[],
  summary: undefined as unknown,
  granted: new Set<string>(),
}));

const idle = { mutate: vi.fn(), isPending: false, variables: undefined, reset: vi.fn() };
vi.mock('../hooks/use-drivers', () => ({
  useDrivers: () => ({
    data: {
      items: state.items,
      meta: { page: 1, limit: 20, total: state.items.length, hasNext: false },
    },
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useDriverSummary: () => ({ data: state.summary, isLoading: false, isError: false }),
  useDriverWageSettings: () => ({
    data: {
      dailyWage: '500000',
      suggestedDaily: '500000',
      wageDaily: { min: '100000', max: '3000000' },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUpdateDriverWageSettings: () => idle,
  useDriverOverview: () => ({ data: undefined, isError: false, error: null, refetch: vi.fn() }),
  useSuspendDriver: () => idle,
  useResumeDriver: () => idle,
  useEndDriver: () => idle,
  useInviteDriver: () => idle,
  useUpdateDriver: () => idle,
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ has: (key: string) => state.granted.has(key) }),
}));

function driver(over: Partial<Driver> = {}): Driver {
  return {
    id: 'drv-1',
    name: 'Trần Hữu Trọng',
    phone: '0987789799',
    driverType: 'collaborator',
    note: null,
    linkStatus: 'active',
    invitedAt: '2026-10-01T02:00:00.000Z',
    respondedAt: '2026-10-01T03:00:00.000Z',
    endedAt: null,
    endedByParty: null,
    account: { displayName: 'Trần Hữu Trọng', avatarUrl: null },
    licence: {
      state: 'verified',
      classes: ['B2'],
      expiresOn: '2031-01-01',
      fullName: 'TRAN HUU TRONG',
      kind: 'vn',
    },
    activeBookingCount: 1,
    currentOpenLinkStatus: null,
    dropCount: 0,
    criticalDropCount: 0,
    autoAssignCooldownUntil: null,
    monthCompletedTrips: 0,
    monthWageTotal: '0',
    ...over,
  } as Driver;
}

const SUMMARY: DriverSummary = {
  open: 5,
  active: 1,
  invited: 2,
  suspended: 1,
  closed: 0,
  licenceCheck: 1,
};

function renderPage() {
  return renderWithIntl(
    <App>
      <DriversPage />
    </App>,
  );
}

beforeEach(() => {
  nav.params = new URLSearchParams();
  nav.replace.mockClear();
  state.items = [driver()];
  state.summary = SUMMARY;
  state.granted = new Set([PERMISSION.DRIVER_VIEW, PERMISSION.DRIVER_MANAGE]);
});
afterEach(cleanup);

describe('Quản lý tài xế', () => {
  it('thẻ tài xế: bằng lái đã xác thực (hạng, tên trên bằng, hạn, loại) + chuyến đang gán', () => {
    renderPage();
    const card = screen.getByRole('article', { name: 'Trần Hữu Trọng' });
    expect(within(card).getByText('Đã xác thực')).toBeTruthy();
    expect(within(card).getByText('Hạng B2')).toBeTruthy();
    expect(within(card).getByText('TRAN HUU TRONG')).toBeTruthy();
    expect(within(card).getByText('01/01/2031')).toBeTruthy();
    expect(within(card).getByText('Cộng tác viên')).toBeTruthy();
    expect(within(card).getByRole('button', { name: '1 chuyến' })).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Chỉnh sửa thông tin' })).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Xem chuyến' })).toBeTruthy();
    // Mức tiền công chung ở đầu trang (ADR 0075) — chốt 04/11: nút cạnh "Mời tài xế mới".
    expect(screen.getByRole('button', { name: /Tiền công: 500\.000/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Mời tài xế mới/ })).toBeTruthy();
  });

  it('tên trên bằng lệch tên đã mời: nhãn "Cần đối chiếu" + lời nhắc đối chiếu khi giao xe', () => {
    state.items = [
      driver({ licence: { ...driver().licence, fullName: 'LE VAN CUONG' } as Driver['licence'] }),
    ];
    renderPage();
    expect(screen.getByText('Cần đối chiếu')).toBeTruthy();
    expect(screen.getByText(/Tên trên bằng khác tên bạn đã nhập/)).toBeTruthy();
  });

  it('chưa có bằng lái: khối "Chưa cập nhật", không bịa hạng/hạn', () => {
    state.items = [
      driver({
        licence: { state: 'none', classes: [], expiresOn: null, fullName: null, kind: null },
      }),
    ];
    renderPage();
    expect(screen.getByText('Chưa cập nhật')).toBeTruthy();
    expect(screen.queryByText(/^Hạng /)).toBeNull();
  });

  it('dải số đếm: bấm "Cần đối chiếu giấy tờ" ghi bộ lọc lên URL', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Cần đối chiếu giấy tờ/ }));
    expect(String(nav.replace.mock.calls.at(-1)?.[0])).toContain('licenceCheck=needed');
  });

  it('ô "Tất cả tài xế" đang chọn khi không lọc trạng thái', () => {
    renderPage();
    const all = screen.getByRole('button', { name: /Tất cả tài xế/ });
    expect(all.getAttribute('aria-pressed')).toBe('true');
  });

  it('thẻ đã kết thúc: nút "Mời lại" thay cho "Chỉnh sửa thông tin"', () => {
    state.items = [
      driver({ linkStatus: 'ended', endedAt: '2026-10-20T02:00:00.000Z', endedByParty: 'driver' }),
    ];
    renderPage();
    expect(screen.getByRole('button', { name: 'Mời lại' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Chỉnh sửa thông tin' })).toBeNull();
    expect(screen.getByText('Tài xế ngừng')).toBeTruthy();
  });

  it('chỉ có quyền xem: không có nút mời / sửa, tiền công chỉ đọc', () => {
    state.granted = new Set([PERMISSION.DRIVER_VIEW]);
    renderPage();
    expect(screen.queryByRole('button', { name: /Mời tài xế mới/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Chỉnh sửa thông tin' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Tiền công: 500\.000/ })).toBeNull();
    expect(screen.getByText(/Tiền công: 500\.000/)).toBeTruthy();
  });

  it('không có quyền xem: màn không có quyền thay toàn bộ nội dung', () => {
    state.granted = new Set();
    renderPage();
    expect(screen.queryByRole('article')).toBeNull();
  });

  it('lọc mà không có kết quả: gợi ý xoá bộ lọc', () => {
    nav.params = new URLSearchParams('q=khongco');
    state.items = [];
    renderPage();
    expect(screen.getByText('Không có tài xế nào khớp bộ lọc')).toBeTruthy();
  });
});
