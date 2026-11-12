import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION, type Permission } from '@xeprime/types';

import type { MemberRosterItem } from '@/features/members/types';

import MembersPage from './page';

/**
 * Test ĐẶC TẢ cho `/manage/members` theo ADR 0086 — rủi ro CAO (quyền tenant).
 *
 *  1. **Chủ gian hàng và chính mình không có thao tác** nào ngoài "Xem chi tiết".
 *  2. Ba quyền `members.invite` / `members.update_role` / `members.remove` mở ba lối khác nhau.
 *  3. Lời mời còn chờ là MỘT dòng của cùng bảng: "Chờ xác nhận", Mời lại / Thu hồi.
 *  4. Khoá vì hết gói không mở tay được; quản lý không "Mời lại" một vai họ không mời được.
 *  5. Bộ lọc sống trên URL — đi qua `setFilters` bằng patch.
 */

const query = vi.hoisted(() => ({
  data: undefined as { items: unknown[]; meta: unknown } | undefined,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
}));

vi.mock('@/features/members/hooks/use-roster', () => ({
  useRoster: () => query,
}));

const url = vi.hoisted(() => ({
  filters: {} as Record<string, unknown>,
  setFilters: vi.fn(),
}));

vi.mock('@/features/members/hooks/use-roster-filters', () => ({
  useRosterFilters: () => url,
}));

const setLock = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, variables: undefined }));
const removeMember = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, variables: undefined }));
const revoke = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, variables: undefined }));

vi.mock('@/features/members/hooks/use-member-mutations', () => ({
  useSetMemberLock: () => setLock,
  useRemoveMember: () => removeMember,
  useRevokeInvite: () => revoke,
}));

vi.mock('@/features/branches/hooks/use-branches', () => ({
  useBranches: () => ({
    data: {
      items: [
        { id: 'b-q5', name: 'Chi nhánh Quận 5', provinceName: null },
        { id: 'b-bc', name: 'Chi nhánh Bình Chánh', provinceName: null },
      ],
    },
    isLoading: false,
  }),
}));

vi.mock('@/features/members/components/StaffAccountDialog', () => ({
  StaffAccountDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="add-staff" /> : null,
}));
vi.mock('@/features/members/components/ResetPasswordDialog', () => ({
  ResetPasswordDialog: ({ member }: { member: { id: string } | null }) =>
    member ? <div data-testid="reset-password">{member.id}</div> : null,
}));
vi.mock('@/features/members/components/MemberEditDialog', () => ({
  MemberEditDialog: ({ member }: { member: { id: string } | null }) =>
    member ? <div data-testid="edit-member">{member.id}</div> : null,
}));
vi.mock('@/features/members/components/MemberDetailDrawer', () => ({
  MemberDetailDrawer: () => null,
}));

vi.mock('@/components/feedback/FeatureWriteTooltip', () => ({
  FeatureWriteTooltip: ({ children }: { children: (disabled: boolean) => React.ReactNode }) =>
    children(false),
}));
const feature = vi.hoisted(() => ({ canWrite: true }));
vi.mock('@/hooks/use-feature', () => ({ useFeature: () => feature }));

vi.mock('@/features/tenant-support/support-session', () => ({
  useAvailableHref: () => (href: string | null) => href,
}));

const me = vi.hoisted(() => ({
  id: 'me-1',
  tenant: { roleKey: 'shop_owner', branchScope: 'all' },
}));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: me, isLoading: false }),
}));

const perms = vi.hoisted(() => ({ granted: new Set<string>() }));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.has(p),
    hasAny: (...ps: string[]) => ps.some((p) => perms.granted.has(p)),
    isLoading: false,
  }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

function member(over: Partial<MemberRosterItem> = {}): MemberRosterItem {
  return {
    kind: 'member',
    id: 'u1',
    userId: 'u1',
    displayName: 'Lê Thị Kim',
    nickname: null,
    email: 'kim@congty.vn',
    phone: '0987654321',
    username: null,
    managedAccount: false,
    contactPhone: null,
    avatarUrl: null,
    roleKey: 'shop_staff',
    status: 'active',
    lockedReason: null,
    branchScope: 'all',
    branchIds: [],
    lastActiveAt: null,
    joinedAt: '2026-07-01T00:00:00.000Z',
    invitedAt: null,
    expiresAt: null,
    invitedByName: null,
    ...over,
  } as MemberRosterItem;
}

function invite(over: Partial<MemberRosterItem> = {}): MemberRosterItem {
  return member({
    kind: 'invite',
    id: 'inv-1',
    userId: null,
    displayName: null,
    nickname: 'Hạnh quầy',
    email: null,
    phone: '0919789668',
    status: 'pending',
    joinedAt: null,
    invitedAt: '2026-11-04T03:00:00.000Z',
    expiresAt: '2026-11-11T03:00:00.000Z',
    ...over,
  });
}

function setQuery(over: Partial<typeof query> = {}) {
  query.data = undefined;
  query.isError = false;
  query.isFetching = false;
  Object.assign(query, over);
}

function grant(...permissions: Permission[]) {
  perms.granted = new Set<string>(permissions);
}

function renderWith(items: MemberRosterItem[]) {
  setQuery({ data: { items, meta: { page: 1, limit: 20, total: items.length, hasNext: false } } });
  return render(
    <App>
      <MembersPage />
    </App>,
  );
}

function rowOf(text: string): HTMLElement {
  return screen.getAllByRole('row').find((row) => within(row).queryByText(text))!;
}

async function openMenu(text: string) {
  fireEvent.click(within(rowOf(text)).getByRole('button', { name: 'Thêm thao tác' }));
}

beforeEach(() => {
  query.refetch.mockReset();
  url.filters = {};
  url.setFilters.mockReset();
  setLock.mutate.mockReset();
  removeMember.mutate.mockReset();
  revoke.mutate.mockReset();
  feature.canWrite = true;
  me.tenant.roleKey = 'shop_owner';
  grant();
  setQuery();
});

afterEach(cleanup);

describe('/manage/members - khung trang', () => {
  it('tiêu đề, mô tả và nút "Vai trò & quyền" như design', () => {
    renderWith([member()]);
    expect(screen.getByRole('heading', { level: 1, name: 'Nhân viên & Phân quyền' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Vai trò & quyền/ }).getAttribute('href')).toContain(
      '/members/roles',
    );
  });

  it('lỗi khi chưa có dữ liệu: câu chữ riêng + Thử lại', () => {
    setQuery({ isError: true });
    render(
      <App>
        <MembersPage />
      </App>,
    );
    expect(screen.getByText('Không tải được danh sách nhân viên')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });

  it('rỗng + có quyền mời: có lối mời ngay trong ô rỗng', () => {
    grant(PERMISSION.MEMBER_INVITE);
    renderWith([]);
    expect(screen.getByText('Gian hàng chưa có nhân viên nào ngoài bạn')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Thêm nhân viên/ }).length).toBeGreaterThan(0);
  });

  it('KHÔNG có quyền mời: không có nút mời nào', () => {
    renderWith([]);
    expect(screen.queryByRole('button', { name: /Thêm nhân viên/ })).toBeNull();
  });
});

describe('/manage/members - các cột', () => {
  it('hiện SĐT, vai, tên chi nhánh và trạng thái', () => {
    renderWith([
      member({ branchScope: 'limited', branchIds: ['b-q5', 'b-bc'], roleKey: 'shop_manager' }),
    ]);
    const row = rowOf('Lê Thị Kim');
    expect(within(row).getByText('0987654321')).toBeTruthy();
    expect(within(row).getByText('Quản lý gian hàng')).toBeTruthy();
    // Nhãn chi nhánh là `Tên · Tỉnh` (`branchLabel`) — khớp theo tên.
    expect(within(row).getByText(/^Chi nhánh Quận 5/)).toBeTruthy();
    expect(within(row).getByText(/^Chi nhánh Bình Chánh/)).toBeTruthy();
    expect(within(row).getByText('Đang hoạt động')).toBeTruthy();
  });

  it('phạm vi toàn gian hàng ghi "Tất cả chi nhánh"', () => {
    renderWith([member()]);
    expect(within(rowOf('Lê Thị Kim')).getByText('Tất cả chi nhánh')).toBeTruthy();
  });

  it('hoạt động trong 5 phút là "Đang trực tuyến"', () => {
    renderWith([member({ lastActiveAt: new Date(Date.now() - 60_000).toISOString() })]);
    expect(within(rowOf('Lê Thị Kim')).getByText('Đang trực tuyến')).toBeTruthy();
  });

  it('lời mời còn chờ: tên gợi nhớ, "Chờ xác nhận", "Đã mời lúc …"', () => {
    renderWith([invite()]);
    const row = rowOf('Hạnh quầy');
    expect(within(row).getByText('Chờ xác nhận')).toBeTruthy();
    expect(within(row).getByText(/Đã mời lúc/)).toBeTruthy();
  });

  it('đánh dấu "(Bạn)" ở dòng của chính mình', () => {
    renderWith([member({ userId: 'me-1', id: 'me-1' })]);
    expect(screen.getByText('(Bạn)')).toBeTruthy();
  });
});

describe('/manage/members - thao tác theo quyền', () => {
  it('không quyền ghi nào: chỉ có "Xem chi tiết", không có menu ⋮', () => {
    renderWith([member()]);
    const row = rowOf('Lê Thị Kim');
    expect(within(row).getByRole('button', { name: 'Xem chi tiết' })).toBeTruthy();
    expect(within(row).queryByRole('button', { name: 'Thêm thao tác' })).toBeNull();
  });

  it('chủ gian hàng và chính mình: không có thao tác, kể cả khi có đủ quyền', () => {
    grant(PERMISSION.MEMBER_UPDATE_ROLE, PERMISSION.MEMBER_REMOVE);
    renderWith([
      member({ id: 'o', userId: 'o', displayName: 'Chủ Shop', roleKey: 'shop_owner' }),
      member({ id: 'me-1', userId: 'me-1', displayName: 'Tôi' }),
    ]);
    expect(within(rowOf('Chủ Shop')).queryByRole('button', { name: 'Thêm thao tác' })).toBeNull();
    expect(within(rowOf('Tôi')).queryByRole('button', { name: 'Thêm thao tác' })).toBeNull();
  });

  it('Xem chi tiết ghi dòng đang mở lên URL, không về trang 1', () => {
    renderWith([member({ id: 'u-7', userId: 'u-7' })]);
    fireEvent.click(within(rowOf('Lê Thị Kim')).getByRole('button', { name: 'Xem chi tiết' }));
    expect(url.setFilters).toHaveBeenCalledWith({ open: 'u-7' }, { resetPage: false });
  });

  it('Chỉnh sửa mở hộp sửa của đúng người', async () => {
    grant(PERMISSION.MEMBER_UPDATE_ROLE);
    renderWith([member({ id: 'u-9', userId: 'u-9' })]);
    await openMenu('Lê Thị Kim');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Chỉnh sửa' }));
    expect(screen.getByTestId('edit-member').textContent).toBe('u-9');
  });

  it('Tạm khoá phải xác nhận rồi mới gọi mutation', async () => {
    grant(PERMISSION.MEMBER_UPDATE_ROLE);
    renderWith([member({ id: 'u-42', userId: 'u-42' })]);
    await openMenu('Lê Thị Kim');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Tạm khoá' }));
    expect(setLock.mutate).not.toHaveBeenCalled();
    expect(await screen.findByText('Tạm khoá Lê Thị Kim?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tạm khoá' }));
    await waitFor(() => expect(setLock.mutate).toHaveBeenCalledTimes(1));
    expect(setLock.mutate.mock.calls[0]![0]).toEqual({ userId: 'u-42', locked: true });
  });

  it('khoá tay thì có Mở khoá; khoá vì hết gói thì KHÔNG', async () => {
    grant(PERMISSION.MEMBER_UPDATE_ROLE);
    renderWith([
      member({ id: 'a', userId: 'a', displayName: 'Khoá Tay', status: 'locked' }),
      member({
        id: 'b',
        userId: 'b',
        displayName: 'Khoá Hệ Thống',
        status: 'locked',
        lockedReason: 'plan_lapsed',
      }),
    ]);
    await openMenu('Khoá Tay');
    expect(await screen.findByRole('menuitem', { name: 'Mở khoá' })).toBeTruthy();
    cleanup();

    renderWith([
      member({
        id: 'b',
        userId: 'b',
        displayName: 'Khoá Hệ Thống',
        status: 'locked',
        lockedReason: 'plan_lapsed',
      }),
    ]);
    const row = rowOf('Khoá Hệ Thống');
    expect(within(row).getByText(/hết gói/)).toBeTruthy();
    await openMenu('Khoá Hệ Thống');
    expect(await screen.findByRole('menuitem', { name: 'Chỉnh sửa' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Mở khoá' })).toBeNull();
  });

  it('Gỡ khỏi gian hàng chỉ với members.remove, có xác nhận', async () => {
    grant(PERMISSION.MEMBER_REMOVE);
    renderWith([member({ id: 'u-5', userId: 'u-5' })]);
    await openMenu('Lê Thị Kim');
    expect(screen.queryByRole('menuitem', { name: 'Chỉnh sửa' })).toBeNull();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Gỡ khỏi gian hàng' }));
    expect(await screen.findByText('Gỡ Lê Thị Kim khỏi gian hàng?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ' }));
    await waitFor(() => expect(removeMember.mutate).toHaveBeenCalledTimes(1));
    expect(removeMember.mutate.mock.calls[0]![0]).toBe('u-5');
  });

  it('gói hết hạn (chỉ xem): không có thao tác ghi dù có quyền', () => {
    feature.canWrite = false;
    grant(PERMISSION.MEMBER_UPDATE_ROLE, PERMISSION.MEMBER_REMOVE, PERMISSION.MEMBER_INVITE);
    renderWith([member(), invite()]);
    expect(within(rowOf('Lê Thị Kim')).queryByRole('button', { name: 'Thêm thao tác' })).toBeNull();
    expect(within(rowOf('Hạnh quầy')).queryByRole('button', { name: 'Thêm thao tác' })).toBeNull();
  });
});

describe('/manage/members - tài khoản do gian hàng cấp (ADR 0087)', () => {
  it('"Thêm nhân viên" mở hộp cấp tài khoản', () => {
    grant(PERMISSION.MEMBER_INVITE);
    renderWith([member()]);
    fireEvent.click(screen.getByRole('button', { name: /Thêm nhân viên/ }));
    expect(screen.getByTestId('add-staff')).toBeTruthy();
  });

  it('cột Nhân viên hiện tên đăng nhập; Đặt lại mật khẩu chỉ với tài khoản do gian hàng cấp', async () => {
    grant(PERMISSION.MEMBER_UPDATE_ROLE);
    renderWith([
      member({ id: 'm1', userId: 'm1', displayName: 'Cấp Sẵn', username: 'kim.le', managedAccount: true }),
      member({ id: 'm2', userId: 'm2', displayName: 'Tự Đăng Ký' }),
    ]);
    expect(within(rowOf('Cấp Sẵn')).getByText(/@kim.le/)).toBeTruthy();

    await openMenu('Cấp Sẵn');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Đặt lại mật khẩu' }));
    expect(screen.getByTestId('reset-password').textContent).toBe('m1');
    cleanup();

    renderWith([member({ id: 'm2', userId: 'm2', displayName: 'Tự Đăng Ký' })]);
    await openMenu('Tự Đăng Ký');
    expect(await screen.findByRole('menuitem', { name: 'Chỉnh sửa' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Đặt lại mật khẩu' })).toBeNull();
  });
});

describe('/manage/members - lời mời còn chờ', () => {
  it('Thu hồi phải xác nhận rồi gọi với id lời mời', async () => {
    grant(PERMISSION.MEMBER_INVITE);
    renderWith([invite({ id: 'inv-9' })]);
    await openMenu('Hạnh quầy');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Thu hồi lời mời' }));
    expect(await screen.findByText('Thu hồi lời mời này?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thu hồi lời mời' }));
    await waitFor(() => expect(revoke.mutate).toHaveBeenCalledTimes(1));
    expect(revoke.mutate.mock.calls[0]![0]).toBe('inv-9');
  });

  it('lời mời cũ chỉ còn Thu hồi — không còn Mời lại (ADR 0087)', async () => {
    grant(PERMISSION.MEMBER_INVITE);
    renderWith([invite()]);
    await openMenu('Hạnh quầy');
    expect(await screen.findByRole('menuitem', { name: 'Thu hồi lời mời' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Mời lại' })).toBeNull();
  });
});

describe('/manage/members - lọc và phân trang', () => {
  it('đổi trang ghi page lên URL', () => {
    setQuery({
      data: { items: [member()], meta: { page: 1, limit: 20, total: 60, hasNext: true } },
    });
    render(
      <App>
        <MembersPage />
      </App>,
    );
    fireEvent.click(screen.getByTitle('2'));
    expect(url.setFilters).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2 }),
      { resetPage: false },
    );
  });

  it('tổng hiển thị theo đơn vị "nhân viên"', () => {
    setQuery({
      data: { items: [member()], meta: { page: 1, limit: 20, total: 60, hasNext: true } },
    });
    render(
      <App>
        <MembersPage />
      </App>,
    );
    expect(screen.getByText(/60 nhân viên/)).toBeTruthy();
  });
});
