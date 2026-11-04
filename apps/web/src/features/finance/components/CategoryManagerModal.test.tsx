import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CategoryManagerModal } from './CategoryManagerModal';

/**
 * Hộp "Danh mục thu/chi" — design Partner-XePrime `23845:41185` (04/11/2026).
 *
 * Điều phải sống sót qua mọi lần sửa:
 *  1. Mỗi dòng LƯU NGAY bằng nút ✓ của nó (chốt 04/11/2026) — không gom chờ "Xác nhận".
 *  2. Danh mục HỆ THỐNG không có nút sửa/xoá nào (server cũng chặn).
 *  3. Xoá phải xác nhận trước — xoá nhầm một danh mục là mất nhóm của mọi phiếu cũ.
 *  4. Tên đang gõ ở dòng thêm mới sống qua lần đóng (`destroyOnClose={false}`).
 */
const list = vi.hoisted(() => ({ data: [] as unknown[], isLoading: false }));
const create = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const update = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const remove = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('../hooks/use-finance-categories', () => ({
  useFinanceCategories: () => list,
  useCreateCategory: () => create,
  useUpdateCategory: () => update,
  useDeleteCategory: () => remove,
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

function renderModal(open = true, onClose = vi.fn()) {
  const utils = render(
    <App>
      <CategoryManagerModal open={open} onClose={onClose} />
    </App>,
  );
  return { ...utils, onClose };
}

function nameInput(): HTMLInputElement {
  return screen.getByPlaceholderText('Tên danh mục mới');
}

beforeEach(() => {
  create.mutate.mockReset();
  update.mutate.mockReset();
  remove.mutate.mockReset();
  create.isPending = false;
  list.isLoading = false;
  list.data = [
    { id: 'C1', name: 'Tiền xăng', type: 'expense', isSystem: false },
    { id: 'C2', name: 'Doanh thu thuê', type: 'income', isSystem: true },
  ];
});

afterEach(cleanup);

describe('CategoryManagerModal', () => {
  it('liệt kê danh mục kèm nhãn Thu/Chi và Hệ thống', () => {
    renderModal();
    expect(screen.getByText('Danh mục thu/chi')).toBeTruthy();
    expect(screen.getByText('Tiền xăng')).toBeTruthy();
    expect(screen.getByText('Doanh thu thuê')).toBeTruthy();
    expect(screen.getByText('Hệ thống')).toBeTruthy();
  });

  it('nút lưu dòng mới bị vô hiệu khi chưa nhập tên', () => {
    renderModal();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Thêm' }).disabled).toBe(true);
  });

  it('thêm danh mục: gửi tên đã trim, báo thành công và xoá ô nhập', async () => {
    create.mutate.mockImplementation((_body, opts) => opts.onSuccess());
    renderModal();
    fireEvent.change(nameInput(), { target: { value: '  Rửa xe  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    expect(create.mutate).toHaveBeenCalledWith(
      { type: 'expense', name: 'Rửa xe' },
      expect.anything(),
    );
    expect(await screen.findByText('Đã thêm danh mục')).toBeTruthy();
    expect(nameInput().value).toBe('');
  });

  it('chỉ danh mục KHÔNG phải hệ thống mới có nút sửa/xoá', () => {
    renderModal();
    expect(screen.getAllByRole('button', { name: 'Sửa tên danh mục' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Xoá danh mục' })).toHaveLength(1);
  });

  it('sửa tên: lưu bằng ✓ của chính dòng đó, gửi tên đã trim', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Sửa tên danh mục' }));
    const input = screen.getByDisplayValue('Tiền xăng');
    fireEvent.change(input, { target: { value: ' Xăng dầu ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu danh mục' }));

    expect(update.mutate).toHaveBeenCalledWith({ id: 'C1', name: 'Xăng dầu' }, expect.anything());
  });

  it('xoá phải XÁC NHẬN trước khi gọi mutation', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Xoá danh mục' }));
    expect(remove.mutate).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: 'Xoá' }));
    await waitFor(() => expect(remove.mutate).toHaveBeenCalledWith('C1', expect.anything()));
  });

  it('đóng rồi mở lại vẫn giữ tên đang gõ', () => {
    const { rerender } = renderModal();
    fireEvent.change(nameInput(), { target: { value: 'Phí gửi xe' } });
    rerender(
      <App>
        <CategoryManagerModal open={false} onClose={vi.fn()} />
      </App>,
    );
    rerender(
      <App>
        <CategoryManagerModal open onClose={vi.fn()} />
      </App>,
    );
    expect(nameInput().value).toBe('Phí gửi xe');
  });
});
