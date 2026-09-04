import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION, type Permission } from '@xeprime/types';

import type { Member } from '@/features/members/types';

import MembersPage from './page';

/**
 * Test ĐẶC TẢ cho `/manage/members` — rủi ro CAO (quyền tenant).
 *
 * Ba bất biến phải sống sót qua migrate:
 *  1. **`shop_owner` không bao giờ bị gỡ hay đổi vai trò** từ giao diện này;
 *  2. **không ai tự thao tác lên dòng của chính mình**;
 *  3. ba quyền `MEMBER_INVITE` / `MEMBER_UPDATE_ROLE` / `MEMBER_REMOVE` mở ba lối khác nhau.
 */

const query = vi.hoisted(() => ({
  data: undefined as { items: unknown[]; meta: unknown } | undefined,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
  lastFilters: undefined as unknown,
}));

vi.mock('@/features/members/hooks/use-members', () => ({
  useMembers: (filters: unknown) => {
    query.lastFilters = filters;
    return query;
  },
}));

const updateRole = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, variables: undefined }));
const removeMember = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  variables: undefined,
}));

vi.mock('@/features/members/hooks/use-member-mutations', () => ({
  useUpdateMemberRole: () => updateRole,
  useRemoveMember: () => removeMember,
}));

vi.mock('@/features/members/components/InviteMemberModal', () => ({
  InviteMemberModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="invite-member" /> : null,
}));

// Bảng lời mời có bộ test riêng và query riêng — bộ này chỉ kiểm bảng THÀNH VIÊN.
vi.mock('@/features/members/components/PendingInvitesPanel', () => ({
  PendingInvitesPanel: () => null,
}));

const me = vi.hoisted(() => ({ id: 'me-1' }));

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

function member(over: Partial<Member> = {}): Member {
  return {
    userId: 'u1',
    displayName: 'Nguyễn Văn A',
    email: 'a@congty.vn',
    avatarUrl: null,
    roleKey: 'shop_staff',
    status: 'active',
    joinedAt: '2026-07-01T00:00:00.000Z',
    ...over,
  } as Member;
}

const META = { page: 1, limit: 20, total: 1, hasNext: false };

function setQuery(over: Partial<typeof query> = {}) {
  query.data = undefined;
  query.isError = false;
  query.isFetching = false;
  Object.assign(query, over);
}

function grant(...permissions: Permission[]) {
  perms.granted = new Set<string>(permissions);
}

function renderWith(items: Member[]) {
  setQuery({ data: { items, meta: META } });
  return render(
    <App>
      <MembersPage />
    </App>,
  );
}

function bodyRows(): HTMLElement[] {
  return screen
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('columnheader').length === 0);
}

beforeEach(() => {
  query.refetch.mockReset();
  updateRole.mutate.mockReset();
  removeMember.mutate.mockReset();
  grant();
  setQuery();
});

afterEach(cleanup);

describe('/manage/members — trạng thái', () => {
  it('lỗi khi chưa có dữ liệu: câu chữ riêng + Thử lại', () => {
    setQuery({ isError: true });
    render(
      <App>
        <MembersPage />
      </App>,
    );

    expect(screen.getByText('Không tải được danh sách thành viên')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });

  it('rỗng: câu chữ "Chưa có thành viên nào"', () => {
    renderWith([]);

    expect(screen.getByText('Chưa có thành viên nào')).toBeTruthy();
  });

  it('rỗng + KHÔNG có quyền mời: không có lối thêm nào', () => {
    renderWith([]);

    expect(screen.queryByRole('button', { name: /Mời thành viên/ })).toBeNull();
  });

  it('rỗng + có quyền mời: mở được form thêm', () => {
    grant(PERMISSION.MEMBER_INVITE);
    renderWith([]);

    fireEvent.click(screen.getAllByRole('button', { name: /Mời thành viên/ })[0]!);
    expect(screen.getByTestId('invite-member')).toBeTruthy();
  });
});

describe('/manage/members — định danh và vai trò', () => {
  it('hiện tên và email', () => {
    renderWith([member()]);

    expect(screen.getByText('Nguyễn Văn A')).toBeTruthy();
    expect(screen.getByText('a@congty.vn')).toBeTruthy();
  });

  it('đánh dấu "(bạn)" ở dòng của chính mình', () => {
    renderWith([member({ userId: 'me-1' })]);

    expect(screen.getByText(/\(bạn\)/)).toBeTruthy();
  });

  it('thiếu email hiện gạch ngang', () => {
    renderWith([member({ email: null })]);

    expect(screen.getByText('—')).toBeTruthy();
  });

  it('KHÔNG có quyền đổi vai trò: vai trò hiển thị dạng nhãn, không phải ô chọn', () => {
    renderWith([member()]);

    expect(within(bodyRows()[0]!).queryByRole('combobox')).toBeNull();
  });

  it('có quyền đổi vai trò: thành viên thường có ô chọn', () => {
    grant(PERMISSION.MEMBER_UPDATE_ROLE);
    renderWith([member()]);

    expect(within(bodyRows()[0]!).getByRole('combobox')).toBeTruthy();
  });

  it('shop_owner KHÔNG bao giờ đổi được vai trò, kể cả khi có quyền', () => {
    grant(PERMISSION.MEMBER_UPDATE_ROLE);
    renderWith([member({ roleKey: 'shop_owner' })]);

    expect(within(bodyRows()[0]!).queryByRole('combobox')).toBeNull();
  });

  it('không tự đổi vai trò của chính mình', () => {
    grant(PERMISSION.MEMBER_UPDATE_ROLE);
    renderWith([member({ userId: 'me-1' })]);

    expect(within(bodyRows()[0]!).queryByRole('combobox')).toBeNull();
  });
});

describe('/manage/members — gỡ thành viên', () => {
  it('KHÔNG có quyền gỡ: không có nút gỡ', () => {
    renderWith([member()]);

    expect(within(bodyRows()[0]!).queryAllByRole('button')).toHaveLength(0);
  });

  it('shop_owner không gỡ được dù có quyền', () => {
    grant(PERMISSION.MEMBER_REMOVE);
    renderWith([member({ roleKey: 'shop_owner' })]);

    expect(within(bodyRows()[0]!).queryAllByRole('button')).toHaveLength(0);
  });

  it('không tự gỡ chính mình', () => {
    grant(PERMISSION.MEMBER_REMOVE);
    renderWith([member({ userId: 'me-1' })]);

    expect(within(bodyRows()[0]!).queryAllByRole('button')).toHaveLength(0);
  });

  it('có quyền: gỡ phải xác nhận rồi mới gọi mutation với đúng userId', async () => {
    grant(PERMISSION.MEMBER_REMOVE);
    renderWith([member({ userId: 'u-42' })]);

    fireEvent.click(within(bodyRows()[0]!).getAllByRole('button')[0]!);
    expect(removeMember.mutate).not.toHaveBeenCalled();

    expect(await screen.findByText('Gỡ thành viên này?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ' }));

    await waitFor(() => expect(removeMember.mutate).toHaveBeenCalledTimes(1));
    expect(removeMember.mutate.mock.calls[0]![0]).toBe('u-42');
  });
});

describe('/manage/members — lọc và phân trang', () => {
  it('lọc là state cục bộ, không ghi URL', () => {
    renderWith([member()]);

    expect(window.location.search).toBe('');
  });

  it('đổi trang gọi lại lớp dữ liệu với page mới', () => {
    setQuery({
      data: { items: [member()], meta: { page: 1, limit: 20, total: 60, hasNext: true } },
    });
    render(
      <App>
        <MembersPage />
      </App>,
    );

    fireEvent.click(screen.getByTitle('2'));

    expect((query.lastFilters as { page?: number }).page).toBe(2);
  });

  it('tổng hiển thị theo đơn vị "thành viên"', () => {
    setQuery({ data: { items: [member()], meta: { ...META, total: 245 } } });
    render(
      <App>
        <MembersPage />
      </App>,
    );

    expect(screen.getByText('245 thành viên')).toBeTruthy();
  });
});
