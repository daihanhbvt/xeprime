import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlanFormModal } from './PlanFormModal';
import type { Plan } from '../types';

/**
 * Test đặc tả viết TRƯỚC khi đổi vỏ overlay. Khoá lại: hai chế độ tạo/sửa, việc khoá `code`
 * khi sửa (định danh — ADR 0010), tiền chuyển sang string khi gửi (ADR 0007), và câu thông báo.
 */
const create = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const update = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('../hooks/use-plan-mutations', () => ({
  useCreatePlan: () => create,
  useUpdatePlan: () => update,
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

const PLAN: Plan = {
  id: 'P1',
  code: 'basic',
  name: 'Gói Cơ bản',
  description: 'Mô tả',
  price: '199000',
  durationDays: 30,
  maxVehicles: 10,
  sortOrder: 1,
} as Plan;

function renderModal(plan: Plan | null, onClose = vi.fn()) {
  render(
    <App>
      <PlanFormModal open plan={plan} onClose={onClose} />
    </App>,
  );
  return { onClose };
}

beforeEach(() => {
  create.mutate.mockReset();
  update.mutate.mockReset();
  create.isPending = false;
  update.isPending = false;
});

afterEach(cleanup);

describe('PlanFormModal — hành vi hiện tại', () => {
  describe('chế độ tạo', () => {
    it('tiêu đề "Tạo gói dịch vụ" và có ô mã gói', () => {
      renderModal(null);
      expect(screen.getByText('Tạo gói dịch vụ')).toBeTruthy();
      expect(screen.getByLabelText('Mã gói')).toBeTruthy();
    });

    it('gửi giá dạng string và code đã trim', async () => {
      renderModal(null);
      fireEvent.change(screen.getByLabelText('Mã gói'), { target: { value: '  pro  ' } });
      fireEvent.change(screen.getByLabelText('Tên gói'), { target: { value: 'Gói Pro' } });
      // NumberField (AntD InputNumber) không nối label với input — dùng role. Thứ tự: giá,
      // số ngày, giới hạn xe, thứ tự hiển thị.
      fireEvent.change(screen.getAllByRole('spinbutton')[0]!, { target: { value: '500000' } });
      fireEvent.click(screen.getByRole('button', { name: 'Tạo gói' }));

      await waitFor(() => expect(create.mutate).toHaveBeenCalledTimes(1));
      const payload = create.mutate.mock.calls[0]![0];
      expect(payload.code).toBe('pro');
      // ADR 0007: tiền qua API là string, không phải number.
      expect(payload.price).toBe('500000');
      expect(typeof payload.price).toBe('string');
    });

    it('thành công: báo "Đã tạo gói" rồi đóng', async () => {
      const { onClose } = renderModal(null);
      fireEvent.change(screen.getByLabelText('Mã gói'), { target: { value: 'pro' } });
      fireEvent.change(screen.getByLabelText('Tên gói'), { target: { value: 'Gói Pro' } });
      // NumberField (AntD InputNumber) không nối label với input — dùng role. Thứ tự: giá,
      // số ngày, giới hạn xe, thứ tự hiển thị.
      fireEvent.change(screen.getAllByRole('spinbutton')[0]!, { target: { value: '1' } });
      fireEvent.click(screen.getByRole('button', { name: 'Tạo gói' }));

      await waitFor(() => expect(create.mutate).toHaveBeenCalled());
      create.mutate.mock.calls[0]![1].onSuccess();

      expect(await screen.findByText('Đã tạo gói')).toBeTruthy();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('mã gói sai định dạng thì không gửi', async () => {
      renderModal(null);
      fireEvent.change(screen.getByLabelText('Mã gói'), { target: { value: 'CHỮ HOA' } });
      fireEvent.change(screen.getByLabelText('Tên gói'), { target: { value: 'X' } });
      // NumberField (AntD InputNumber) không nối label với input — dùng role. Thứ tự: giá,
      // số ngày, giới hạn xe, thứ tự hiển thị.
      fireEvent.change(screen.getAllByRole('spinbutton')[0]!, { target: { value: '1' } });
      fireEvent.click(screen.getByRole('button', { name: 'Tạo gói' }));

      await waitFor(() =>
        expect(screen.getByText('Chỉ chữ thường/số/gạch, 2-50 ký tự')).toBeTruthy(),
      );
      expect(create.mutate).not.toHaveBeenCalled();
    });
  });

  describe('chế độ sửa', () => {
    it('tiêu đề kèm tên gói và KHÔNG có ô mã gói', () => {
      renderModal(PLAN);
      expect(screen.getByText('Sửa gói: Gói Cơ bản')).toBeTruthy();
      expect(screen.queryByLabelText('Mã gói')).toBeNull();
    });

    it('điền sẵn giá trị của gói đang sửa', () => {
      renderModal(PLAN);
      expect(screen.getByLabelText<HTMLInputElement>('Tên gói').value).toBe('Gói Cơ bản');
    });

    it('gọi update kèm id và báo "Đã cập nhật gói"', async () => {
      const { onClose } = renderModal(PLAN);
      fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

      await waitFor(() => expect(update.mutate).toHaveBeenCalledTimes(1));
      expect(update.mutate.mock.calls[0]![0].id).toBe('P1');
      expect(create.mutate).not.toHaveBeenCalled();

      update.mutate.mock.calls[0]![1].onSuccess();
      expect(await screen.findByText('Đã cập nhật gói')).toBeTruthy();
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('lỗi: hiện thông báo và KHÔNG đóng', async () => {
    const { onClose } = renderModal(PLAN);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(update.mutate).toHaveBeenCalled());
    update.mutate.mock.calls[0]![1].onError(new Error('Mã gói đã tồn tại'));

    expect(await screen.findByText('Mã gói đã tồn tại')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('đang gửi thì nút chính loading', () => {
    update.isPending = true;
    renderModal(PLAN);
    expect(screen.getByRole('button', { name: /Lưu/ }).className).toContain('ant-btn-loading');
  });

  it('nút Huỷ gọi onClose', () => {
    const { onClose } = renderModal(PLAN);
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
