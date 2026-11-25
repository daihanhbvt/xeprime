import { App } from 'antd';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION } from '@xeprime/types';
import { renderWithIntl } from '@/i18n/test-utils';
import type { Driver, DriverRosterSummary, InternalDriver } from '../types';
import { DriversPage } from './DriversPage';

/**
 * Màn Quản lý tài xế (Figma `23737:41945`, cập nhật 25/11/2026) — tầng dữ liệu là giả, phần còn lại
 * thật: lưới GỘP thẻ liên kết + thẻ nội bộ, dải số đếm là lối lọc trên URL (ADR 0004), cổng quyền
 * của các nút ghi, và link cũ `?open=` chuyển sang trang chi tiết.
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
const licenceCheck = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('../hooks/use-drivers', () => ({
  useDriverRoster: () => ({
    data: {
      items: state.items,
      meta: { page: 1, limit: 20, total: state.items.length, hasNext: false },
    },
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useDriverRosterSummary: () => ({ data: state.summary, isLoading: false, isError: false }),
  useDriverAccountLookup: () => ({ data: undefined, isFetching: false, isError: false }),
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
  useSuspendDriver: () => idle,
  useResumeDriver: () => idle,
  useEndDriver: () => idle,
  useSetDriverLicenceChecked: () => ({ ...idle, mutate: licenceCheck.mutate }),
  useInviteDriver: () => idle,
  useUpdateDriver: () => idle,
}));
vi.mock('../hooks/use-internal-drivers', () => ({
  useArchiveInternalDriver: () => idle,
  useRestoreInternalDriver: () => idle,
  useCreateInternalDriver: () => idle,
  useUpdateInternalDriver: () => idle,
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
    licenceCheck: null,
    monthCompletedTrips: 0,
    monthWageTotal: '0',
    ...over,
  } as Driver;
}

function internal(over: Partial<InternalDriver> = {}): InternalDriver {
  return {
    id: 'int-1',
    name: 'Phạm Nội Bộ',
    phone: '0911000001',
    note: 'Chạy tuyến sân bay',
    photoUrl: null,
    archivedAt: null,
    activeTripCount: 0,
    createdAt: '2026-10-01T02:00:00.000Z',
    ...over,
  } as InternalDriver;
}

const linkedRow = (d: Driver) => ({ kind: 'linked', linked: d, internal: null });
const internalRow = (d: InternalDriver) => ({ kind: 'internal', linked: null, internal: d });

const SUMMARY: DriverRosterSummary = {
  open: 5,
  active: 1,
  invited: 2,
  suspended: 1,
  closed: 0,
  licenceCheck: 1,
  internalActive: 1,
  internalArchived: 0,
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
  state.items = [linkedRow(driver())];
  state.summary = SUMMARY;
  state.granted = new Set([PERMISSION.DRIVER_VIEW, PERMISSION.DRIVER_MANAGE]);
});
afterEach(cleanup);

describe('Quản lý tài xế', () => {
  it('thẻ tài xế: bằng lái đã xác thực + chuyến đang gán dẫn tới TRANG chi tiết', () => {
    renderPage();
    const card = screen.getByRole('article', { name: 'Trần Hữu Trọng' });
    expect(within(card).getByText('Đã xác thực')).toBeTruthy();
    expect(within(card).getByText('Hạng B2')).toBeTruthy();
    expect(within(card).getByText('TRAN HUU TRONG')).toBeTruthy();
    expect(within(card).getByText('01/01/2031')).toBeTruthy();
    expect(within(card).getByText('Cộng tác viên')).toBeTruthy();
    expect(within(card).getByRole('link', { name: '1 chuyến' }).getAttribute('href')).toBe(
      '/manage/drivers/drv-1',
    );
    // Sửa thông tin ở trang chi tiết — thẻ có "Chi tiết" thay cho "Chỉnh sửa thông tin".
    expect(within(card).queryByRole('button', { name: 'Chỉnh sửa thông tin' })).toBeNull();
    expect(within(card).getByRole('link', { name: 'Chi tiết' }).getAttribute('href')).toBe(
      '/manage/drivers/drv-1',
    );
    expect(within(card).getByRole('link', { name: 'Xem chuyến' }).getAttribute('href')).toBe(
      '/manage/drivers/drv-1?tab=trips',
    );
    // Mức tiền công chung ở đầu trang (ADR 0075) — nút cạnh "Thêm tài xế mới".
    expect(screen.getByRole('button', { name: /Tiền công: 500\.000/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Thêm tài xế mới/ })).toBeTruthy();
  });

  it('tên trên bằng lệch tên đã mời: nhãn "Cần đối chiếu" + lời nhắc đối chiếu khi giao xe', () => {
    state.items = [
      linkedRow(
        driver({ licence: { ...driver().licence, fullName: 'LE VAN CUONG' } as Driver['licence'] }),
      ),
    ];
    renderPage();
    expect(screen.getByText('Cần đối chiếu')).toBeTruthy();
    expect(screen.getByText(/Tên trên bằng khác tên bạn đã nhập/)).toBeTruthy();
  });

  it('đã đối chiếu đúng bằng hiện tại: nhãn "Đã đối chiếu", không còn lời nhắc', () => {
    state.items = [
      linkedRow(
        driver({
          licence: { ...driver().licence, fullName: 'LE VAN CUONG' } as Driver['licence'],
          licenceCheck: { checkedAt: '2026-11-20T02:00:00.000Z', checkedByName: 'Chủ xe' },
        }),
      ),
    ];
    renderPage();
    expect(screen.getByText('Đã đối chiếu')).toBeTruthy();
    expect(screen.queryByText('Cần đối chiếu')).toBeNull();
    expect(screen.queryByText(/Tên trên bằng khác tên bạn đã nhập/)).toBeNull();
  });

  it('tên lệch chưa đối chiếu: menu "…" có "Đã đối chiếu giấy tờ" gọi đánh dấu', async () => {
    licenceCheck.mutate.mockClear();
    state.items = [
      linkedRow(
        driver({ licence: { ...driver().licence, fullName: 'LE VAN CUONG' } as Driver['licence'] }),
      ),
    ];
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Thao tác cho Trần Hữu Trọng' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Đã đối chiếu giấy tờ' }));
    expect(licenceCheck.mutate.mock.calls[0]![0]).toEqual({ id: 'drv-1', checked: true });
  });

  it('chưa có bằng lái: khối "Chưa cập nhật", không bịa hạng/hạn', () => {
    state.items = [
      linkedRow(
        driver({
          licence: { state: 'none', classes: [], expiresOn: null, fullName: null, kind: null },
        }),
      ),
    ];
    renderPage();
    expect(screen.getByText('Chưa cập nhật')).toBeTruthy();
    expect(screen.queryByText(/^Hạng /)).toBeNull();
  });

  it('thẻ tài xế nội bộ chung lưới: "Nhân viên nội bộ", trạng thái, không khối bằng lái', () => {
    state.items = [linkedRow(driver()), internalRow(internal())];
    renderPage();
    const card = screen.getByRole('article', { name: 'Phạm Nội Bộ' });
    expect(within(card).getByText('Nhân viên nội bộ')).toBeTruthy();
    expect(within(card).getByText('Đang hoạt động')).toBeTruthy();
    expect(within(card).queryByText('Bằng lái')).toBeNull();
    expect(within(card).getByRole('link', { name: 'Chi tiết' }).getAttribute('href')).toBe(
      '/manage/drivers/internal/int-1',
    );
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

  it('link cũ của ngăn chi tiết "?open=<id>&tab=trips" chuyển sang trang chi tiết', () => {
    nav.params = new URLSearchParams('open=drv-9&tab=trips');
    renderPage();
    expect(nav.replace).toHaveBeenCalledWith('/manage/drivers/drv-9?tab=trips');
  });

  it('"Thêm tài xế mới" mở hộp hai tab: Mời tài xế · Tài xế nội bộ (ảnh tuỳ chọn)', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Thêm tài xế mới/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Thông tin tài xế')).toBeTruthy();
    fireEvent.click(within(dialog).getByText('Tài xế nội bộ'));
    expect(within(dialog).getByText('Họ và tên')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Tải ảnh lên' })).toBeTruthy();
  });

  it('thẻ đã kết thúc: nút "Mời lại" thay cho "Chỉnh sửa thông tin"', () => {
    state.items = [
      linkedRow(
        driver({ linkStatus: 'ended', endedAt: '2026-10-20T02:00:00.000Z', endedByParty: 'driver' }),
      ),
    ];
    renderPage();
    expect(screen.getByRole('button', { name: 'Mời lại' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Chỉnh sửa thông tin' })).toBeNull();
    expect(screen.getByText('Tài xế ngừng')).toBeTruthy();
  });

  it('chỉ có quyền xem: không có nút thêm / sửa, tiền công chỉ đọc', () => {
    state.granted = new Set([PERMISSION.DRIVER_VIEW]);
    renderPage();
    expect(screen.queryByRole('button', { name: /Thêm tài xế mới/ })).toBeNull();
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
