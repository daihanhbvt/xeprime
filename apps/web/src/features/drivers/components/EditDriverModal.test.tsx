import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/i18n/test-utils';
import type { Driver } from '../types';
import { EditDriverModal } from './EditDriverModal';

/** Hộp sửa tài xế liên kết — cùng khuôn hộp sửa tài xế nội bộ (25/11/2026); SĐT/ảnh chỉ xem. */

const update = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('../hooks/use-drivers', () => ({
  useUpdateDriver: () => ({ mutate: update.mutate, isPending: false }),
}));

const DRIVER = {
  id: 'drv-1',
  name: 'Nguyễn Văn Dũng',
  phone: '0921000001',
  driverType: 'staff',
  note: null,
  account: { displayName: 'Nguyễn Văn Dũng', avatarUrl: null },
} as unknown as Driver;

afterEach(cleanup);

describe('EditDriverModal', () => {
  it('SĐT khoá, sửa tên + ghi chú gửi đúng body', async () => {
    renderWithIntl(
      <App>
        <EditDriverModal driver={DRIVER} onClose={vi.fn()} />
      </App>,
    );
    const dialog = await screen.findByRole('dialog');
    expect((within(dialog).getByLabelText('Số điện thoại tài khoản') as HTMLInputElement).disabled).toBe(
      true,
    );
    fireEvent.change(within(dialog).getByLabelText('Tên tài xế'), { target: { value: 'Dũng Lái' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update.mutate).toHaveBeenCalledTimes(1));
    expect(update.mutate.mock.calls[0]![0]).toEqual({
      id: 'drv-1',
      body: { name: 'Dũng Lái', driverType: 'staff', note: null },
    });
  });
});
