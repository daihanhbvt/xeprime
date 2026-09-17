import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BILLING_MODE } from '@xeprime/types';

import { renderWithIntl } from '@/i18n/test-utils';
import { PlanFormModal } from './PlanFormModal';
import type { Plan } from '../types';

/**
 * Đặc tả PlanFormModal sau ADR 0041: chế độ thu phí quyết định form là CÁI GÌ (tuyến hoa hồng
 * chỉ có %, bậc gian hàng có trần + bảng giá), giá gửi lên là con số TUYỆT ĐỐI của từng kỳ hạn,
 * kỳ bỏ trống KHÔNG lọt vào `termPrices`, và `code` bị khoá khi sửa (định danh — ADR 0010).
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
  code: 'shop-basic',
  name: 'Gói cơ bản',
  description: 'Mô tả',
  billingMode: BILLING_MODE.PACKAGE,
  commissionPercent: null,
  limits: {
    maxVehicles: 3,
    maxBranches: 1,
    maxMembers: null,
    termPrices: [
      { months: 1, price: '100000' },
      { months: 12, price: '800000' },
    ],
    salesOnly: false,
    recommended: false,
    graceDays: 7,
    features: ['finance'],
  },
  currency: 'VND',
  sortOrder: 1,
  subscriptionCount: 3,
  status: 'active',
  createdAt: '2026-08-01T00:00:00.000Z',
} as Plan;

const COMMISSION_PLAN: Plan = {
  ...PLAN,
  id: 'P0',
  code: 'free',
  name: 'Tuyến hoa hồng mặc định',
  billingMode: BILLING_MODE.COMMISSION,
  commissionPercent: 10,
  limits: { ...PLAN.limits, maxVehicles: null, maxBranches: null, termPrices: [], features: [] },
} as Plan;

function renderModal(plan: Plan | null, onClose = vi.fn()) {
  renderWithIntl(
    <App>
      <PlanFormModal open plan={plan} onClose={onClose} />
    </App>,
  );
  return { onClose };
}

/** Điền bộ tối thiểu hợp lệ của một BẬC GIAN HÀNG ở chế độ tạo (mặc định của form). */
function fillMinimalPackage() {
  fireEvent.change(screen.getByLabelText('Mã gói'), { target: { value: '  shop-gold  ' } });
  fireEvent.change(screen.getByLabelText('Tên gói'), { target: { value: 'Gói Gold' } });
}

beforeEach(() => {
  create.mutate.mockReset();
  update.mutate.mockReset();
  create.isPending = false;
  update.isPending = false;
});

afterEach(cleanup);

describe('PlanFormModal — chế độ tạo', () => {
  /*
   * Danh mục chỉ được có ĐÚNG MỘT bậc `commission` và nó đã tồn tại từ seed
   * (`COMMISSION_PLAN_IS_SINGLETON` — ADR 0038 điều 13). Mở form ở chế độ đó là mở sẵn con đường
   * duy nhất mà server sẽ từ chối.
   */
  it('mặc định là BẬC GIAN HÀNG, không phải tuyến hoa hồng', () => {
    renderModal(null);
    expect(screen.getByText('Tạo gói dịch vụ')).toBeTruthy();
    expect(screen.getByLabelText('Mã gói')).toBeTruthy();
    expect(screen.getByLabelText('Số xe tối đa')).toBeTruthy();
    expect(screen.queryByLabelText('Tỷ lệ hoa hồng / chuyến')).toBeNull();
  });

  it('gửi payload: giá TUYỆT ĐỐI dạng string, kỳ bỏ trống KHÔNG vào bảng giá', async () => {
    renderModal(null);
    fillMinimalPackage();
    fireEvent.change(screen.getByLabelText('Số xe tối đa'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Giá kỳ 1 tháng'), { target: { value: '100000' } });
    fireEvent.change(screen.getByLabelText('Giá kỳ 12 tháng'), { target: { value: '800000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo gói' }));

    await waitFor(() => expect(create.mutate).toHaveBeenCalledTimes(1));
    const payload = create.mutate.mock.calls[0]![0];
    expect(payload.code).toBe('shop-gold');
    expect(payload.billingMode).toBe(BILLING_MODE.PACKAGE);
    expect(payload.limits.maxVehicles).toBe(3);
    // Chỉ hai kỳ được nhập — kỳ trống là "không bán", khác hẳn với 0đ (ADR 0041 điều 2).
    expect(payload.limits.termPrices).toEqual([
      { months: 1, price: '100000' },
      { months: 12, price: '800000' },
    ]);
    // ADR 0007: tiền qua API là string, không phải number.
    expect(typeof payload.limits.termPrices[0].price).toBe('string');
  });

  it('% tiết kiệm tính NGAY từ giá đang gõ, không đợi lưu', async () => {
    renderModal(null);
    fireEvent.change(screen.getByLabelText('Giá kỳ 1 tháng'), { target: { value: '100000' } });
    fireEvent.change(screen.getByLabelText('Giá kỳ 3 tháng'), { target: { value: '250000' } });

    // 250.000 so với 3 × 100.000 ⇒ tiết kiệm 17%.
    expect(await screen.findByText('Tiết kiệm 17%')).toBeTruthy();
  });

  it('bật "Chỉ bán qua tư vấn" thì bảng giá biến mất và payload có termPrices rỗng', async () => {
    renderModal(null);
    fillMinimalPackage();
    fireEvent.change(screen.getByLabelText('Giá kỳ 1 tháng'), { target: { value: '100000' } });
    fireEvent.click(screen.getByRole('switch', { name: /Chỉ bán qua tư vấn/ }));

    await waitFor(() => expect(screen.queryByLabelText('Giá kỳ 1 tháng')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Tạo gói' }));

    await waitFor(() => expect(create.mutate).toHaveBeenCalledTimes(1));
    const payload = create.mutate.mock.calls[0]![0];
    expect(payload.limits.salesOnly).toBe(true);
    expect(payload.limits.termPrices).toEqual([]);
  });

  it('mã gói sai định dạng thì không gửi', async () => {
    renderModal(null);
    fillMinimalPackage();
    fireEvent.change(screen.getByLabelText('Mã gói'), { target: { value: 'CHỮ HOA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo gói' }));

    await waitFor(() =>
      expect(screen.getByText('Chỉ chữ thường/số/gạch, 2-50 ký tự')).toBeTruthy(),
    );
    expect(create.mutate).not.toHaveBeenCalled();
  });

  it('thành công: báo "Đã tạo gói" rồi đóng', async () => {
    const { onClose } = renderModal(null);
    fillMinimalPackage();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo gói' }));

    await waitFor(() => expect(create.mutate).toHaveBeenCalled());
    create.mutate.mock.calls[0]![1].onSuccess();

    expect(await screen.findByText('Đã tạo gói')).toBeTruthy();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('PlanFormModal — chế độ sửa', () => {
  it('tiêu đề kèm tên gói, KHÔNG có ô mã gói, điền sẵn trần + bảng giá', () => {
    renderModal(PLAN);
    expect(screen.getByText('Sửa gói: Gói cơ bản')).toBeTruthy();
    expect(screen.queryByLabelText('Mã gói')).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>('Tên gói').value).toBe('Gói cơ bản');
    expect(screen.getByLabelText<HTMLInputElement>('Số xe tối đa').value).toBe('3');
    // MoneyInput format có dấu chấm nhóm.
    expect(screen.getByLabelText<HTMLInputElement>('Giá kỳ 1 tháng').value).toContain('100');
  });

  it('gọi update kèm id, KHÔNG gửi commissionPercent cho bậc gian hàng', async () => {
    const { onClose } = renderModal(PLAN);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(update.mutate).toHaveBeenCalledTimes(1));
    const payload = update.mutate.mock.calls[0]![0];
    expect(payload.id).toBe('P1');
    // Tuyến gói: KHÔNG gửi commissionPercent — service tự xoá, không có tổ hợp package + %.
    expect('commissionPercent' in payload).toBe(false);
    expect(payload.limits.termPrices).toHaveLength(2);
    expect(create.mutate).not.toHaveBeenCalled();

    update.mutate.mock.calls[0]![1].onSuccess();
    expect(await screen.findByText('Đã cập nhật gói')).toBeTruthy();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('PlanFormModal — tuyến hoa hồng', () => {
  it('chỉ có %, không có trần nào để sửa và không có bảng giá', () => {
    renderModal(COMMISSION_PLAN);

    expect(screen.getByLabelText('Tỷ lệ hoa hồng / chuyến')).toBeTruthy();
    expect(screen.queryByLabelText('Số xe tối đa')).toBeNull();
    expect(screen.queryByLabelText('Giá kỳ 1 tháng')).toBeNull();
    expect(screen.queryByLabelText('Tính năng của gói')).toBeNull();
  });

  /*
   * Trần của tuyến hoa hồng là `OWNER_LITE_VEHICLE_LIMIT` trong code, không phải dữ liệu bậc —
   * form hiện nó ra như THÔNG TIN để admin không đi tìm, nhưng không có ô nhập nào.
   */
  it('hiện trần Owner Lite dưới dạng thông tin, không phải ô nhập', () => {
    renderModal(COMMISSION_PLAN);
    expect(screen.getByText('3 xe')).toBeTruthy();
    expect(screen.getByText('1 chi nhánh')).toBeTruthy();
  });

  /*
   * Form của tuyến hoa hồng KHÔNG có ô cho `graceDays`/`features`, nên gửi một `limits` dựng từ
   * default của form sẽ lặng lẽ xoá cờ năng lực và số ngày ân hạn mà seed đã đặt. Bỏ trống
   * `limits` là cách nói "giữ nguyên" với `updatePlan`.
   */
  it('KHÔNG gửi limits — giữ nguyên cờ năng lực và ân hạn đang lưu', async () => {
    renderModal(COMMISSION_PLAN);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(update.mutate).toHaveBeenCalledTimes(1));
    const payload = update.mutate.mock.calls[0]![0];
    expect('limits' in payload).toBe(false);
    expect(payload.commissionPercent).toBe(10);
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
