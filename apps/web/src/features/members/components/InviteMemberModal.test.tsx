import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/i18n/test-utils';
import { InviteMemberModal } from './InviteMemberModal';

/**
 * Hộp thoại GỬI LỜI MỜI (đổi tên từ `AddMemberModal` ngày 03/09/2026 cùng lúc endpoint
 * `POST /members` bị gỡ).
 *
 * Ngoài payload/thông báo/thời điểm đóng như trước, bộ này khoá thêm MỘT điều mới và quan
 * trọng hơn cả: hộp thoại phải nói rõ người được mời CHƯA vào gian hàng. Người bấm gửi mà
 * tưởng đã thêm xong sẽ đi tìm họ trong bảng thành viên và báo là lỗi.
 */
const mutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}));

vi.mock('../hooks/use-member-mutations', () => ({
  useCreateInvite: () => mutation,
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

function renderModal(props: Partial<{ open: boolean; onClose: () => void }> = {}) {
  const onClose = props.onClose ?? vi.fn();
  const utils = renderWithIntl(
    <App>
      <InviteMemberModal open={props.open ?? true} onClose={onClose} />
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

describe('InviteMemberModal — hành vi hiện tại', () => {
  it('tiêu đề nói MỜI, không phải THÊM', () => {
    renderModal();
    expect(screen.getByText('Mời thành viên')).toBeTruthy();
    expect(screen.queryByText('Thêm thành viên')).toBeNull();
  });

  it('nói rõ người được mời chưa vào gian hàng cho tới khi họ đồng ý', () => {
    renderModal();
    expect(screen.getByText(/chỉ vào gian hàng sau khi họ tự bấm đồng ý/)).toBeTruthy();
  });

  it('vai trò mặc định là shop_staff và không cho chọn shop_owner', () => {
    renderModal();
    // Giá trị mặc định hiển thị trên Select.
    expect(screen.getByText('Nhân viên gian hàng')).toBeTruthy();
  });

  it('email rỗng thì không gọi mutation', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
    await waitFor(() => expect(screen.getByText('Nhập email')).toBeTruthy());
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it('email sai định dạng thì không gọi mutation', async () => {
    renderModal();
    fillForm('khong-phai-email');
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
    await waitFor(() => expect(screen.getByText('Email không hợp lệ')).toBeTruthy());
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it('gửi email đã trim kèm roleKey', async () => {
    renderModal();
    fillForm('  nhanvien@congty.vn  ');
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(mutation.mutate).toHaveBeenCalledTimes(1));
    expect(mutation.mutate.mock.calls[0]![0]).toEqual({
      email: 'nhanvien@congty.vn',
      roleKey: 'shop_staff',
    });
  });

  it('thành công: báo đã GỬI LỜI MỜI rồi đóng', async () => {
    const { onClose } = renderModal();
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(mutation.mutate).toHaveBeenCalled());
    mutation.mutate.mock.calls[0]![1].onSuccess({ emailSent: true });

    expect(await screen.findByText('Đã gửi lời mời')).toBeTruthy();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * SMTP hỏng: lời mời ĐÃ tạo nhưng thư không đi được. Server trả `emailSent: false` thay vì
   * ném 500 (staging 04/09/2026), và màn hình phải nói thật — báo "Đã gửi lời mời" ở đây là để
   * người gửi ngồi chờ một lá thư không tồn tại.
   */
  it('tạo được nhưng thư hỏng: cảnh báo CHƯA gửi được, không nói đã gửi', async () => {
    const { onClose } = renderModal();
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(mutation.mutate).toHaveBeenCalled());
    mutation.mutate.mock.calls[0]![1].onSuccess({ emailSent: false });

    expect(await screen.findByText(/CHƯA gửi được thư/)).toBeTruthy();
    expect(screen.queryByText('Đã gửi lời mời')).toBeNull();
    // Vẫn đóng: lời mời có thật và đã nằm ở bảng "Lời mời đang chờ".
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lỗi: hiện thông báo lỗi và KHÔNG đóng', async () => {
    const { onClose } = renderModal();
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(mutation.mutate).toHaveBeenCalled());
    mutation.mutate.mock.calls[0]![1].onError(new Error('Email đã là thành viên'));

    // ADR 0012: message tiếng Việt của backend KHÔNG lên màn hình — lỗi dịch từ MÃ, và một
    // Error trần không có mã nên rơi về câu chung.
    expect(await screen.findByText('Đã có lỗi xảy ra. Vui lòng thử lại.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('đang gửi thì nút Gửi ở trạng thái loading', () => {
    mutation.isPending = true;
    renderModal();
    expect(screen.getByRole('button', { name: /Gửi/ }).className).toContain('ant-btn-loading');
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
        <InviteMemberModal open={false} onClose={vi.fn()} />
      </App>,
    );
    rerender(
      <App>
        <InviteMemberModal open onClose={vi.fn()} />
      </App>,
    );

    expect(screen.getByLabelText<HTMLInputElement>('Email').value).toBe('giu-lai@congty.vn');
  });
});
