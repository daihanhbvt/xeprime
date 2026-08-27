import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AddMemberModal } from './AddMemberModal';

/**
 * Test đặc tả (characterization) viết TRƯỚC khi đổi vỏ overlay sang `ResponsiveDialog`.
 * Mục đích không phải chứng minh component đúng, mà khoá lại HÀNH VI ĐANG CÓ để lần thay vỏ
 * không âm thầm đổi: payload gửi đi, câu thông báo, thời điểm đóng, và việc form có giữ
 * dữ liệu khi đóng rồi mở lại hay không.
 */
const mutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}));

vi.mock('../hooks/use-member-mutations', () => ({
  useAddMember: () => mutation,
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

function renderModal(props: Partial<{ open: boolean; onClose: () => void }> = {}) {
  const onClose = props.onClose ?? vi.fn();
  const utils = render(
    <App>
      <AddMemberModal open={props.open ?? true} onClose={onClose} />
    </App>,
  );
  return { ...utils, onClose };
}

function fillForm(email = 'nhanvien@congty.vn') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
}

beforeEach(() => {
  mutation.mutate.mockReset();
  mutation.isPending = false;
});

afterEach(cleanup);

describe('AddMemberModal — hành vi hiện tại', () => {
  it('tiêu đề là "Thêm thành viên"', () => {
    renderModal();
    expect(screen.getByText('Thêm thành viên')).toBeTruthy();
  });

  it('vai trò mặc định là shop_staff và không cho chọn shop_owner', () => {
    renderModal();
    // Giá trị mặc định hiển thị trên Select.
    expect(screen.getByText('Nhân viên gian hàng')).toBeTruthy();
  });

  it('email rỗng thì không gọi mutation', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    await waitFor(() => expect(screen.getByText('Nhập email')).toBeTruthy());
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it('email sai định dạng thì không gọi mutation', async () => {
    renderModal();
    fillForm('khong-phai-email');
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    await waitFor(() => expect(screen.getByText('Email không hợp lệ')).toBeTruthy());
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it('gửi email đã trim kèm roleKey', async () => {
    renderModal();
    fillForm('  nhanvien@congty.vn  ');
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    await waitFor(() => expect(mutation.mutate).toHaveBeenCalledTimes(1));
    expect(mutation.mutate.mock.calls[0]![0]).toEqual({
      email: 'nhanvien@congty.vn',
      roleKey: 'shop_staff',
    });
  });

  it('thành công: báo "Đã thêm thành viên" rồi đóng', async () => {
    const { onClose } = renderModal();
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    await waitFor(() => expect(mutation.mutate).toHaveBeenCalled());
    mutation.mutate.mock.calls[0]![1].onSuccess();

    expect(await screen.findByText('Đã thêm thành viên')).toBeTruthy();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lỗi: hiện thông báo lỗi và KHÔNG đóng', async () => {
    const { onClose } = renderModal();
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    await waitFor(() => expect(mutation.mutate).toHaveBeenCalled());
    mutation.mutate.mock.calls[0]![1].onError(new Error('Email đã là thành viên'));

    expect(await screen.findByText('Email đã là thành viên')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('đang gửi thì nút Thêm ở trạng thái loading', () => {
    mutation.isPending = true;
    renderModal();
    expect(screen.getByRole('button', { name: /Thêm/ }).className).toContain('ant-btn-loading');
  });

  it('nút Huỷ gọi onClose', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * Hành vi ĐANG CÓ, cố ý khoá lại: docstring của component nói "remount theo `open`", nhưng
   * caller không truyền `key`, nên `useForm` sống sót qua lần đóng — mở lại vẫn thấy email cũ.
   * Không sửa ở batch này; chỉ ghi nhận để lần thay vỏ không vô tình đổi.
   */
  it('đóng rồi mở lại vẫn giữ email đã nhập', () => {
    const { rerender } = renderModal();
    fillForm('giu-lai@congty.vn');

    rerender(
      <App>
        <AddMemberModal open={false} onClose={vi.fn()} />
      </App>,
    );
    rerender(
      <App>
        <AddMemberModal open onClose={vi.fn()} />
      </App>,
    );

    expect(screen.getByLabelText<HTMLInputElement>('Email').value).toBe('giu-lai@congty.vn');
  });
});
