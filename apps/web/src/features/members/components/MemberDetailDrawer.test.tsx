import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TENANT_ROLE_PERMISSIONS, TENANT_ROLE_VALUES } from '@xeprime/types';
import type { MemberRosterItem } from '../types';
import { MemberDetailDrawer } from './MemberDetailDrawer';

vi.mock('../hooks/use-roster', () => ({
  useMemberRoles: () => ({
    isLoading: false,
    data: TENANT_ROLE_VALUES.map((roleKey) => ({
      roleKey,
      memberCount: 1,
      permissions: [...DEFAULT_TENANT_ROLE_PERMISSIONS[roleKey]],
    })),
  }),
  useMemberActivity: () => ({
    isLoading: false,
    isError: false,
    data: [
      {
        id: 'a1',
        action: 'member.lock',
        targetType: 'tenant_membership',
        targetId: 'x',
        createdAt: '2026-11-09T03:00:00.000Z',
      },
    ],
  }),
}));
vi.mock('@/features/branches/hooks/use-branches', () => ({
  useBranches: () => ({ data: { items: [] }, isLoading: false }),
}));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { tenant: { branchScope: 'all' } } }),
}));
vi.mock('@/hooks/use-media-query', () => ({ useIsMobile: () => false, useMediaQuery: () => false }));

const ITEM = {
  kind: 'member',
  id: 'u1',
  userId: 'u1',
  displayName: 'Lê Thị Kim',
  nickname: null,
  email: null,
  phone: '0911222333',
  username: 'kim.le',
  managedAccount: true,
  contactPhone: '0911222333',
  avatarUrl: null,
  roleKey: 'shop_staff',
  status: 'active',
  lockedReason: null,
  branchScope: 'all',
  branchIds: [],
  lastActiveAt: null,
  joinedAt: '2026-11-01T00:00:00.000Z',
  invitedAt: null,
  expiresAt: null,
  invitedByName: 'Chủ Shop',
} as MemberRosterItem;

function renderDrawer(actions = {}, item: MemberRosterItem = ITEM) {
  render(
    <App>
      <MemberDetailDrawer
        item={item}
        open
        rolesHref="/manage/members/roles"
        isSelf={false}
        actions={actions}
        onClose={vi.fn()}
      />
    </App>,
  );
}

afterEach(cleanup);

describe('MemberDetailDrawer', () => {
  it('đủ các khối quản lý: truy cập, liên hệ, quyền của vai, hoạt động gần đây', () => {
    renderDrawer();
    for (const title of ['Quyền truy cập', 'Liên hệ', 'Quyền của vai', 'Hoạt động', 'Hoạt động gần đây']) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    }
    expect(screen.getByText('Do gian hàng cấp')).toBeTruthy();
    // Quyền của vai Nhân viên: có duyệt yêu cầu (ADR 0086), không có Quản lý ví.
    expect(screen.getByText('Xác nhận / Từ chối yêu cầu đặt xe')).toBeTruthy();
    expect(screen.queryByText('Quản lý ví')).toBeNull();
    // Hoạt động gần đây dịch từ mã hành động của nhật ký.
    expect(screen.getByText('Tạm khoá thành viên')).toBeTruthy();
  });

  it('công tắc truy cập: tắt là hỏi lại rồi mới khoá', async () => {
    const onSetLocked = vi.fn();
    renderDrawer({ onSetLocked });
    fireEvent.click(screen.getByRole('switch', { name: 'Cho phép truy cập gian hàng' }));
    expect(onSetLocked).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Tạm khoá' }));
    await waitFor(() => expect(onSetLocked).toHaveBeenCalledWith(true));
  });

  it('không có quyền (chủ / chính mình / chỉ xem): không công tắc, không nút thao tác', () => {
    renderDrawer({});
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('button', { name: /Đặt lại mật khẩu/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Gỡ khỏi gian hàng/ })).toBeNull();
  });

  it('đặt lại mật khẩu và chỉnh sửa có ở chân ngăn khi được phép', () => {
    const onResetPassword = vi.fn();
    const onEdit = vi.fn();
    renderDrawer({ onResetPassword, onEdit });
    fireEvent.click(screen.getByRole('button', { name: /Đặt lại mật khẩu/ }));
    fireEvent.click(screen.getByRole('button', { name: /Chỉnh sửa/ }));
    expect(onResetPassword).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
