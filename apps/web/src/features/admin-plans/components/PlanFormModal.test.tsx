import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@xeprime/api-client';
import { API_ERROR_CODE, BILLING_MODE } from '@xeprime/types';

import { renderWithIntl } from '@/i18n/test-utils';
import { PlanFormModal } from './PlanFormModal';
import type { Plan } from '../types';

/**
 * Đặc tả PlanFormModal sau ADR 0015/0020: hai chế độ thu phí quyết định bộ núm, khoá `code`
 * khi sửa (định danh — ADR 0010), tiền hoá string khi gửi (ADR 0007), lỗi kiểm điểm giao đọc
 * từ MÃ và ghim trong form.
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
  code: 'standard',
  name: 'Tiêu chuẩn',
  description: 'Mô tả',
  billingMode: BILLING_MODE.PACKAGE,
  commissionPercent: null,
  basePriceMonthly: '990000',
  assumedMonthlyGmv: { monthlyGmvPerCar: '1500000', commissionPercent: 10 },
  limits: {
    perVehiclePrice: { car: '120000', motorbike: '40000' },
    includedCars: 5,
    includedMotorbikes: 0,
    maxCars: 20,
    maxMotorbikes: 20,
    maxMembers: 5,
    maxBranches: 1,
    terms: [
      { months: 1, discountPercent: 0 },
      { months: 12, discountPercent: 15 },
    ],
    graceDays: 7,
    features: ['finance'],
  },
  price: '490000',
  currency: 'VND',
  durationDays: 30,
  maxVehicles: 20,
  sortOrder: 1,
  subscriptionCount: 3,
  status: 'active',
  createdAt: '2026-08-01T00:00:00.000Z',
} as Plan;

function renderModal(plan: Plan | null, onClose = vi.fn()) {
  renderWithIntl(
    <App>
      <PlanFormModal open plan={plan} onClose={onClose} />
    </App>,
  );
  return { onClose };
}

/** Điền bộ tối thiểu hợp lệ của một gói tuyến hoa hồng ở chế độ tạo. */
function fillMinimalCommission() {
  fireEvent.change(screen.getByLabelText('Mã gói'), { target: { value: '  gold  ' } });
  fireEvent.change(screen.getByLabelText('Tên gói'), { target: { value: 'Gói Gold' } });
  fireEvent.change(screen.getByLabelText('% hoa hồng / chuyến'), { target: { value: '10' } });
}

beforeEach(() => {
  create.mutate.mockReset();
  update.mutate.mockReset();
  create.isPending = false;
  update.isPending = false;
});

afterEach(cleanup);

describe('PlanFormModal — chế độ tạo', () => {
  it('tiêu đề tạo gói, có ô mã gói, mặc định tuyến hoa hồng', () => {
    renderModal(null);
    expect(screen.getByText('Tạo gói dịch vụ')).toBeTruthy();
    expect(screen.getByLabelText('Mã gói')).toBeTruthy();
    // Tuyến hoa hồng là mặc định → có ô %, KHÔNG có phí nền.
    expect(screen.getByLabelText('% hoa hồng / chuyến')).toBeTruthy();
    expect(screen.queryByLabelText('Phí nền / tháng')).toBeNull();
  });

  it('gửi payload mới: billingMode + % + tiền dạng string + limits đủ hình', async () => {
    renderModal(null);
    fillMinimalCommission();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo gói' }));

    await waitFor(() => expect(create.mutate).toHaveBeenCalledTimes(1));
    const payload = create.mutate.mock.calls[0]![0];
    expect(payload.code).toBe('gold');
    expect(payload.billingMode).toBe(BILLING_MODE.COMMISSION);
    expect(payload.commissionPercent).toBe(10);
    // ADR 0007: tiền qua API là string, không phải number.
    expect(payload.basePriceMonthly).toBe('0');
    expect(typeof payload.basePriceMonthly).toBe('string');
    // limits luôn đủ hình ADR 0015 điều 4 — 4 kỳ hạn chuẩn, kỳ không nhập = 0%.
    expect(payload.limits.terms).toHaveLength(4);
    expect(payload.limits.includedCars).toBe(0);
  });

  it('chuyển sang tuyến gói: hiện phí nền + giả định, thiếu phí nền thì không gửi', async () => {
    renderModal(null);
    fireEvent.change(screen.getByLabelText('Mã gói'), { target: { value: 'pkg' } });
    fireEvent.change(screen.getByLabelText('Tên gói'), { target: { value: 'Gói theo chỗ' } });
    fireEvent.click(screen.getByRole('radio', { name: /Gói theo chỗ/ }));

    expect(screen.queryByLabelText('% hoa hồng / chuyến')).toBeNull();
    expect(screen.getByLabelText('Phí nền / tháng')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Tạo gói' }));
    await waitFor(() =>
      expect(screen.getByText('Nhập phí nền (0 nếu miễn phí)')).toBeTruthy(),
    );
    expect(create.mutate).not.toHaveBeenCalled();
  });

  it('cảnh báo kiểm điểm giao hiện NGAY trong form khi phí nền dưới ngưỡng', async () => {
    renderModal(null);
    fireEvent.click(screen.getByRole('radio', { name: /Gói theo chỗ/ }));

    // Ngưỡng = 5 chỗ × 10% × 1.000.000 = 500.000 — phí nền 400k phải bật cảnh báo.
    fireEvent.change(screen.getByLabelText('Phí nền / tháng'), { target: { value: '400000' } });
    fireEvent.change(screen.getByLabelText('Chỗ ô tô gồm sẵn trong phí nền'), {
      target: { value: '5' },
    });
    fireEvent.change(screen.getByLabelText('Doanh thu giả định / xe / tháng'), {
      target: { value: '1000000' },
    });
    fireEvent.change(screen.getByLabelText('% hoa hồng tuyến A để so'), {
      target: { value: '10' },
    });

    await waitFor(() =>
      expect(screen.getByText(/điểm hoà vốn rơi xuống dưới số chỗ gồm sẵn/)).toBeTruthy(),
    );
  });

  it('thành công: báo "Đã tạo gói" rồi đóng', async () => {
    const { onClose } = renderModal(null);
    fillMinimalCommission();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo gói' }));

    await waitFor(() => expect(create.mutate).toHaveBeenCalled());
    create.mutate.mock.calls[0]![1].onSuccess();

    expect(await screen.findByText('Đã tạo gói')).toBeTruthy();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('mã gói sai định dạng thì không gửi', async () => {
    renderModal(null);
    fillMinimalCommission();
    fireEvent.change(screen.getByLabelText('Mã gói'), { target: { value: 'CHỮ HOA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo gói' }));

    await waitFor(() =>
      expect(screen.getByText('Chỉ chữ thường/số/gạch, 2-50 ký tự')).toBeTruthy(),
    );
    expect(create.mutate).not.toHaveBeenCalled();
  });
});

describe('PlanFormModal — chế độ sửa', () => {
  it('tiêu đề kèm tên gói và KHÔNG có ô mã gói; điền sẵn bộ núm tuyến gói', () => {
    renderModal(PLAN);
    expect(screen.getByText('Sửa gói: Tiêu chuẩn')).toBeTruthy();
    expect(screen.queryByLabelText('Mã gói')).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>('Tên gói').value).toBe('Tiêu chuẩn');
    // Gói package → phí nền hiện sẵn giá trị (MoneyInput format có dấu chấm nhóm).
    expect(screen.getByLabelText<HTMLInputElement>('Phí nền / tháng').value).toContain('990');
  });

  it('gọi update kèm id và báo "Đã cập nhật gói"', async () => {
    const { onClose } = renderModal(PLAN);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(update.mutate).toHaveBeenCalledTimes(1));
    const payload = update.mutate.mock.calls[0]![0];
    expect(payload.id).toBe('P1');
    // Tuyến gói: KHÔNG gửi commissionPercent — service tự xoá, không có tổ hợp package + %.
    expect('commissionPercent' in payload).toBe(false);
    expect(payload.assumedMonthlyGmv).toEqual({
      monthlyGmvPerCar: '1500000',
      commissionPercent: 10,
    });
    expect(create.mutate).not.toHaveBeenCalled();

    update.mutate.mock.calls[0]![1].onSuccess();
    expect(await screen.findByText('Đã cập nhật gói')).toBeTruthy();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('PlanFormModal — lỗi', () => {
  it('lỗi thường: toast theo MÃ (fallback khi không có mã) và KHÔNG đóng', async () => {
    const { onClose } = renderModal(PLAN);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(update.mutate).toHaveBeenCalled());
    update.mutate.mock.calls[0]![1].onError(new Error('Mã gói đã tồn tại'));

    // ADR 0012: không hiện message thô của backend — không có mã thì rơi về câu chung.
    expect(await screen.findByText('Đã có lỗi xảy ra. Vui lòng thử lại.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('PLAN_INCENTIVE_INVALID: đọc từ MÃ, ghim Alert trong form, không đóng', async () => {
    const { onClose } = renderModal(PLAN);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(update.mutate).toHaveBeenCalled());
    update.mutate.mock.calls[0]![1].onError(
      new ApiClientError({
        code: API_ERROR_CODE.PLAN_INCENTIVE_INVALID,
        message: 'backend nói tiếng Việt, không được hiện thẳng',
        status: 409,
      }),
    );

    expect(
      await screen.findByText(/Mức giá này làm gói rẻ hơn hoa hồng/),
    ).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('PlanFormModal — vỏ dialog', () => {
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
