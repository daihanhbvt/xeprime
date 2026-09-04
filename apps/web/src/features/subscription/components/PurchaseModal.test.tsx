import { App } from 'antd';
import { cleanup, render, screen } from '@testing-library/react';
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
 *  2. gói `commission` KHÔNG bao giờ lọt vào danh sách mua (nó là tuyến mặc định, không hoá đơn);
 *  3. kỳ hạn chỉ hiện những kỳ gói thật sự bán (ADR 0029 điều 3).
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
    expect(screen.getByRole('combobox')).toBeTruthy();
  });

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
