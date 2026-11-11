import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/i18n/test-utils';
import { StaffAccountDialog } from './StaffAccountDialog';

/**
 * "Thêm nhân viên" — chủ CẤP tài khoản (ADR 0087).
 *
 *  - gửi đúng hợp đồng: tên đăng nhập đã hạ chữ thường, mật khẩu, vai, phạm vi;
 *  - tạo xong KHÔNG đóng: mật khẩu chỉ hiện ở đây, đúng một lần;
 *  - quản lý chỉ cấp được vai Nhân viên.
 */
const mutation = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
vi.mock('../hooks/use-member-mutations', () => ({ useCreateMemberAccount: () => mutation }));
vi.mock('@/features/branches/hooks/use-branches', () => ({
  useBranches: () => ({ data: { items: [] }, isLoading: false }),
}));
const me = vi.hoisted(() => ({ tenant: { branchScope: 'all', roleKey: 'shop_owner' } }));
vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: me }) }));
vi.mock('@/hooks/use-media-query', () => ({ useIsMobile: () => false, useMediaQuery: () => false }));

function renderDialog(onClose = vi.fn()) {
  renderWithIntl(
    <App>
      <StaffAccountDialog open onClose={onClose} />
    </App>,
  );
  return { onClose };
}

function fill(name: string, value: string) {
  fireEvent.change(screen.getByLabelText(name), { target: { value } });
}

beforeEach(() => {
  mutation.mutate.mockReset();
  mutation.isPending = false;
  me.tenant.roleKey = 'shop_owner';
});
afterEach(cleanup);

describe('StaffAccountDialog', () => {
  it('có sẵn một mật khẩu ngẫu nhiên hợp lệ, "Tạo ngẫu nhiên" đổi nó', () => {
    renderDialog();
    const input = screen.getByLabelText<HTMLInputElement>('Mật khẩu');
    const first = input.value;
    expect(first).toMatch(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/);
    fireEvent.click(screen.getByRole('button', { name: 'Tạo ngẫu nhiên' }));
    expect(input.value).not.toBe(first);
  });

  it('tên đăng nhập sai mẫu thì không gửi', async () => {
    renderDialog();
    fill('Họ tên', 'Lê Thị Kim');
    fill('Tên đăng nhập', '1kim');
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    expect(await screen.findByText(/bắt đầu bằng chữ cái/)).toBeTruthy();
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it('gửi đúng hợp đồng, tên đăng nhập hạ chữ thường, vai mặc định Nhân viên', async () => {
    renderDialog();
    fill('Họ tên', 'Lê Thị Kim');
    fill('Tên đăng nhập', 'Kim.Le');
    fill('Mật khẩu', 'matkhau123');
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    await waitFor(() => expect(mutation.mutate).toHaveBeenCalledTimes(1));
    expect(mutation.mutate.mock.calls[0]![0]).toEqual({
      displayName: 'Lê Thị Kim',
      username: 'kim.le',
      password: 'matkhau123',
      roleKey: 'shop_staff',
      branchScope: 'all',
    });
  });

  it('tạo xong: hiện tên đăng nhập + mật khẩu để sao chép, KHÔNG tự đóng', async () => {
    const { onClose } = renderDialog();
    fill('Họ tên', 'Lê Thị Kim');
    fill('Tên đăng nhập', 'kim.le');
    fill('Mật khẩu', 'matkhau123');
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    await waitFor(() => expect(mutation.mutate).toHaveBeenCalled());
    mutation.mutate.mock.calls[0]![1].onSuccess();

    expect(await screen.findByText('Đã tạo tài khoản')).toBeTruthy();
    expect(screen.getByText('kim.le')).toBeTruthy();
    expect(screen.getByText('matkhau123')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Xong' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('quản lý chỉ thấy vai Nhân viên trong ô chọn', async () => {
    me.tenant.roleKey = 'shop_manager';
    renderDialog();
    fireEvent.mouseDown(screen.getByLabelText('Vai trò'));
    expect((await screen.findAllByText('xử lý đơn, giao nhận xe')).length).toBeGreaterThan(0);
    expect(screen.queryByText('điều hành mọi hoạt động')).toBeNull();
  });
});
