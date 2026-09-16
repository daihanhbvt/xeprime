import { App } from 'antd';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BILLING_MODE } from '@xeprime/types';

import type { TenantPlan } from '../types';
import { PurchaseModal } from './PurchaseModal';

/**
 * Hộp thoại mua / gia hạn gói.
 *
 * Bộ này tồn tại vì một lỗi THẬT đã lọt qua: bản cũ lọc gói bán được bằng
 * `basePriceMonthly > 0`, đúng chừng nào mọi gói còn có phí nền. ADR 0029 gỡ phí nền (gói pilot
 * 100k/chỗ có nền 0đ) và vị từ đó lập tức loại đúng gói đang bán — danh sách rỗng, không ai
 * mua được gì, mà không test nào đỏ.
 *
 * Nên thứ được khoá ở đây là VỊ TỪ CHỌN GÓI, không phải bố cục:
 *  1. gói `package` phí nền 0đ VẪN phải bán được;
 *  2. gói `commission` KHÔNG bao giờ lọt vào danh sách mua (nó là TUYẾN mặc định, không SKU);
 *  3. kỳ hạn chỉ hiện những kỳ gói thật sự bán (ADR 0029 điều 3);
 *  4. mỗi kỳ hạn là một LỰA CHỌN MUA có giá thật, hiện cùng lúc — không phải một `<Select>`
 *     nơi giá chỉ lộ ra sau khi đã chọn (quyết định sản phẩm 15/09/2026).
 */
const plans = vi.hoisted(() => ({
  data: [] as TenantPlan[],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));

const purchase = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('../hooks/use-subscription', () => ({
  useTenantPlans: () => plans,
  usePurchaseSubscription: () => purchase,
  usePaymentInfo: () => ({ data: undefined, isLoading: false, isError: false }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

function makePlan(over: Partial<TenantPlan> = {}): TenantPlan {
  return {
    id: 'plan-per-vehicle',
    code: 'per-vehicle',
    name: 'Gói theo xe',
    billingMode: BILLING_MODE.PACKAGE,
    commissionPercent: null,
    // ADR 0029: phí nền 0đ — tiền nằm hết ở đơn giá chỗ.
    basePriceMonthly: '0',
    price: '0',
    status: 'active',
    limits: {
      perVehiclePrice: { car: '100000', motorbike: '40000' },
      includedCars: 0,
      includedMotorbikes: 0,
      maxCars: null,
      maxMotorbikes: null,
      maxMembers: null,
      maxBranches: null,
      terms: [
        { months: 3, discountPercent: 0 },
        { months: 6, discountPercent: 0 },
        { months: 12, discountPercent: 0 },
      ],
      graceDays: 7,
      features: [],
    },
    ...over,
  } as TenantPlan;
}

function renderModal() {
  return render(
    <App>
      <PurchaseModal open onClose={vi.fn()} />
    </App>,
  );
}

beforeEach(() => {
  plans.data = [makePlan()];
  purchase.mutate.mockReset();
});

afterEach(cleanup);

describe('PurchaseModal — gói nào được bán', () => {
  it('gói package phí nền 0đ VẪN bán được (ADR 0029)', () => {
    renderModal();
    expect(screen.queryByText(/Chưa có gói nào đang bán/)).toBeNull();
    expect(screen.getByText(/Chọn kỳ hạn cam kết/)).toBeTruthy();
  });

  it('danh mục MỘT bậc thì không bày bộ chọn gói — nó không phải một lựa chọn', () => {
    renderModal();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('danh mục HAI bậc thì bộ chọn gói xuất hiện lại', () => {
    plans.data = [makePlan(), makePlan({ id: 'plan-2', code: 'pkg-2', name: 'Gói khác' })];
    renderModal();
    expect(screen.getByRole('combobox')).toBeTruthy();
  });

  it(
    'ba kỳ hạn hiện CÙNG LÚC, mỗi kỳ kèm tổng thật của số chỗ đang chọn (ADR 0029 điều 3)',
    () => {
      renderModal();

      // 1 chỗ ô tô: 100.000đ/tháng ⇒ 3 tháng = 300.000đ, 6 = 600.000đ, 12 = 1.200.000đ.
      const carSlots = screen.getByRole('spinbutton', { name: /Số chỗ ô tô/ });
      fireEvent.change(carSlots, { target: { value: '1' } });

      const terms = screen.getAllByRole('radio');
      expect(terms).toHaveLength(3);
      expect(terms[0]!.textContent).toContain('3 tháng');
      expect(terms[1]!.textContent).toContain('6 tháng');
      expect(terms[2]!.textContent).toContain('12 tháng');

      // Kỳ 1 tháng KHÔNG được bán ⇒ không có thẻ nào cho nó.
      expect(terms.some((el) => el.textContent?.includes('1 tháng'))).toBe(false);

      expect(terms[0]!.textContent).toMatch(/300[.,]000/);
      expect(terms[2]!.textContent).toMatch(/1[.,]200[.,]000/);
    },
  );

  it(
    'chưa chọn kỳ hạn thì không tạo được hoá đơn — không mặc định sẵn một cam kết',
    () => {
      renderModal();
      const submit = screen.getByRole('button', { name: /Tạo hoá đơn/ });
      expect(submit.getAttribute('disabled')).not.toBeNull();

      const carSlots = screen.getByRole('spinbutton', { name: /Số chỗ ô tô/ });
      fireEvent.change(carSlots, { target: { value: '1' } });
      fireEvent.click(screen.getAllByRole('radio')[1]!);

      expect(screen.getByRole('button', { name: /Tạo hoá đơn/ }).getAttribute('disabled')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /Tạo hoá đơn/ }));
      expect(purchase.mutate).toHaveBeenCalledWith(
        expect.objectContaining({ termMonths: 6, slots: { car: 1, motorbike: 0 } }),
        expect.anything(),
      );
    },
  );

  it('gói tuyến hoa hồng KHÔNG lọt vào danh sách mua', () => {
    plans.data = [
      makePlan({
        id: 'plan-free',
        code: 'free',
        name: 'Hoa hồng theo chuyến',
        billingMode: BILLING_MODE.COMMISSION,
        commissionPercent: 10,
      }),
    ];
    renderModal();
    expect(screen.getByText(/Chưa có gói nào đang bán/)).toBeTruthy();
  });
});
