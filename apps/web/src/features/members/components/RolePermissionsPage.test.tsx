import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TENANT_ROLE_PERMISSIONS, TENANT_ROLE_VALUES } from '@xeprime/types';
import { RolePermissionsPage } from './RolePermissionsPage';

const roles = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));

vi.mock('../hooks/use-roster', () => ({ useMemberRoles: () => roles }));

function withDefaults() {
  roles.data = TENANT_ROLE_VALUES.map((roleKey, i) => ({
    roleKey,
    memberCount: i === 0 ? 1 : i,
    permissions: [...DEFAULT_TENANT_ROLE_PERMISSIONS[roleKey]],
  }));
}

beforeEach(() => {
  roles.data = undefined;
  roles.isLoading = false;
  roles.isError = false;
  roles.refetch.mockReset();
});

afterEach(cleanup);

describe('RolePermissionsPage', () => {
  it('lỗi: câu riêng + Thử lại', () => {
    roles.isError = true;
    render(<RolePermissionsPage />);
    expect(screen.getByText('Không tải được bảng quyền')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(roles.refetch).toHaveBeenCalledTimes(1);
  });

  it('bốn cột vai theo thứ bậc, kèm số người và chú thích', () => {
    withDefaults();
    render(<RolePermissionsPage />);
    const heads = screen.getAllByRole('columnheader').slice(1).map((th) => th.textContent ?? '');
    expect(heads[0]).toContain('Chủ gian hàng');
    expect(heads[1]).toContain('Quản lý gian hàng');
    expect(heads[2]).toContain('Nhân viên');
    expect(heads[3]).toContain('Quan sát viên');
    expect(heads[0]).toContain('1 người');
    expect(screen.getByText('Toàn quyền')).toBeTruthy();
    expect(screen.getByText(/giới hạn theo chi nhánh phụ trách/)).toBeTruthy();
  });

  it('ô "có giới hạn" nói rõ giới hạn gì, và ô có tên khả truy cập', () => {
    withDefaults();
    render(<RolePermissionsPage />);
    expect(screen.getByText('Chỉ mời nhân viên')).toBeTruthy();
    expect(
      screen.getByLabelText('Quan sát viên - Doanh thu & báo cáo: Toàn quyền'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Nhân viên - Quản lý ví: Không có quyền')).toBeTruthy();
  });
});
