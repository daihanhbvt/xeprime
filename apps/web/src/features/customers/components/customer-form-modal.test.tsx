import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ERROR_CODE } from '@xeprime/types';
import { ApiClientError } from '@/services/api-client';
import { CustomerFormModal } from './CustomerFormModal';

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

const mutations = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
}));
vi.mock('../hooks/use-customers', () => ({
  useCreateCustomer: () => ({ mutate: mutations.create, isPending: false }),
  useUpdateCustomer: () => ({ mutate: mutations.update, isPending: false }),
}));

function duplicateError(customerId?: string) {
  return new ApiClientError({
    code: API_ERROR_CODE.CUSTOMER_PHONE_DUPLICATE,
    message: 'Số điện thoại này đã thuộc hồ sơ "Nguyễn Văn An" trong sổ khách',
    status: 409,
    details: customerId ? { customerId } : undefined,
  });
}

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText('Họ và tên'), { target: { value: 'An NV' } });
  fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: '0901234567' } });
  fireEvent.click(screen.getByRole('button', { name: 'Thêm khách' }));
}

beforeEach(() => {
  mutations.create = vi.fn();
  mutations.update = vi.fn();
});
afterEach(cleanup);

describe('CustomerFormModal — trùng số điện thoại', () => {
  it('409 trùng SĐT: giải thích rõ và MỞ ĐƯỢC hồ sơ đang giữ số đó, không tự gộp', async () => {
    mutations.create = vi.fn((_body: unknown, handlers: { onError: (e: unknown) => void }) =>
      handlers.onError(duplicateError('cus-9')),
    );
    const onOpenExisting = vi.fn();
    const onClose = vi.fn();

    render(
      <App>
        <CustomerFormModal open customer={null} onClose={onClose} onOpenExisting={onOpenExisting} />
      </App>,
    );
    fillAndSubmit();

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(
      screen.getByText('Số điện thoại này đã thuộc hồ sơ "Nguyễn Văn An" trong sổ khách'),
    ).toBeTruthy();
    expect(screen.getByText(/không được tự gộp lại/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Mở hồ sơ đang có' }));
    expect(onOpenExisting).toHaveBeenCalledWith('cus-9');
    expect(onClose).toHaveBeenCalled();
  });

  it('409 KHÔNG kèm id hồ sơ: vẫn giải thích, chỉ không có lối mở nhanh', async () => {
    mutations.create = vi.fn((_body: unknown, handlers: { onError: (e: unknown) => void }) =>
      handlers.onError(duplicateError()),
    );

    render(
      <App>
        <CustomerFormModal open customer={null} onClose={vi.fn()} onOpenExisting={vi.fn()} />
      </App>,
    );
    fillAndSubmit();

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Mở hồ sơ đang có' })).toBeNull();
  });

  it('SĐT sai định dạng bị chặn ngay ở client, không gửi request', async () => {
    render(
      <App>
        <CustomerFormModal open customer={null} onClose={vi.fn()} />
      </App>,
    );
    fireEvent.change(screen.getByLabelText('Họ và tên'), { target: { value: 'An NV' } });
    fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm khách' }));

    await waitFor(() =>
      expect(screen.getByText('Số điện thoại không hợp lệ (ví dụ 0901234567)')).toBeTruthy(),
    );
    expect(mutations.create).not.toHaveBeenCalled();
  });
});
