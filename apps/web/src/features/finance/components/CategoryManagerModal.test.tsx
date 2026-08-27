import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CategoryManagerModal } from './CategoryManagerModal';

/**
 * Test đặc tả viết TRƯỚC khi đổi vỏ overlay.
 *
 * Hai điểm khác hẳn các dialog còn lại, phải giữ nguyên:
 *  1. Modal này **không** có `destroyOnClose` → state cục bộ (`type`, `name`) sống qua lần
 *     đóng. `ResponsiveDialog` mặc định huỷ, nên phải truyền `destroyOnClose={false}`.
 *  2. Xoá danh mục **không có bước xác nhận** — bấm là gọi mutation ngay. Đó là hành vi đang
 *     có; thêm confirm sẽ là redesign, không thuộc batch này (ghi ở backlog).
 */
const list = vi.hoisted(() => ({ data: [] as unknown[], isLoading: false }));
const create = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const remove = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('../hooks/use-finance-categories', () => ({
  useFinanceCategories: () => list,
  useCreateCategory: () => create,
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
  remove.mutate.mockReset();
  create.isPending = false;
  list.isLoading = false;
  list.data = [
    { id: 'C1', name: 'Tiền xăng', type: 'expense', isSystem: false },
    { id: 'C2', name: 'Doanh thu thuê', type: 'income', isSystem: true },
  ];
});

afterEach(cleanup);

describe('CategoryManagerModal — hành vi hiện tại', () => {
  it('tiêu đề "Danh mục thu/chi"', () => {
    renderModal();
    expect(screen.getByText('Danh mục thu/chi')).toBeTruthy();
  });

  it('liệt kê danh mục kèm nhãn Thu/Chi và Hệ thống', () => {
    renderModal();
    expect(screen.getByText('Tiền xăng')).toBeTruthy();
    expect(screen.getByText('Doanh thu thuê')).toBeTruthy();
    expect(screen.getByText('Hệ thống')).toBeTruthy();
  });

  it('đang tải thì hiện "Đang tải…"', () => {
    list.isLoading = true;
    renderModal();
    expect(screen.getByText('Đang tải…')).toBeTruthy();
  });

  it('nút Thêm bị vô hiệu khi chưa nhập tên', () => {
    renderModal();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Thêm/ }).disabled).toBe(true);
  });

  it('thêm danh mục: gửi tên đã trim, báo thành công và xoá ô nhập', async () => {
    renderModal();
    fireEvent.change(nameInput(), { target: { value: '  Phí cầu đường  ' } });
    fireEvent.click(screen.getByRole('button', { name: /Thêm/ }));

    await waitFor(() => expect(create.mutate).toHaveBeenCalledTimes(1));
    expect(create.mutate.mock.calls[0]![0]).toEqual({ type: 'expense', name: 'Phí cầu đường' });

    create.mutate.mock.calls[0]![1].onSuccess();
    expect(await screen.findByText('Đã thêm danh mục')).toBeTruthy();
    expect(nameInput().value).toBe('');
  });

  it('thêm lỗi thì hiện thông báo lỗi', async () => {
    renderModal();
    fireEvent.change(nameInput(), { target: { value: 'Trùng' } });
    fireEvent.click(screen.getByRole('button', { name: /Thêm/ }));

    await waitFor(() => expect(create.mutate).toHaveBeenCalled());
    create.mutate.mock.calls[0]![1].onError(new Error('Danh mục đã tồn tại'));
    expect(await screen.findByText('Danh mục đã tồn tại')).toBeTruthy();
  });

  it('chỉ danh mục KHÔNG phải hệ thống mới có nút xoá', () => {
    renderModal();
    expect(screen.getAllByRole('button', { name: 'Xoá danh mục' })).toHaveLength(1);
  });

  it('xoá gọi mutation NGAY, không có bước xác nhận (hành vi hiện tại)', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Xoá danh mục' }));
    expect(remove.mutate).toHaveBeenCalledTimes(1);
    expect(remove.mutate.mock.calls[0]![0]).toBe('C1');
  });

  /** Không có `destroyOnClose`: state cục bộ phải sống qua lần đóng. */
  it('đóng rồi mở lại vẫn giữ tên đang gõ', () => {
    const { rerender } = renderModal();
    fireEvent.change(nameInput(), { target: { value: 'Bản nháp' } });

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

    expect(nameInput().value).toBe('Bản nháp');
  });
});
