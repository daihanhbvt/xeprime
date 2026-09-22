import { act, renderHook } from '@testing-library/react-native';
import { BILLING_MODE } from '@xeprime/types';
import type { TenantPlan } from '@/api/subscription/api';

import { usePlanPurchase } from './plan-purchase';

/**
 * Bộ chọn bậc + kỳ hạn của mọi màn bán gói.
 *
 * Trọng tâm ở đây là chuyện xảy ra khi người dùng ĐỔI BẬC sau khi đã chọn kỳ hạn — ranh giới
 * giữa "mang theo ý định họ vừa nói ra" và "dựng sẵn một lựa chọn server sẽ từ chối". Từ lúc
 * bảng kỳ hạn dời vào tấm trượt, sai ở đây không còn nhìn thấy trên trang nữa: tấm mở lên trống
 * trơn và người dùng phải chọn lại mà không hiểu vì sao.
 */

function plan(id: string, months: readonly (1 | 3 | 6 | 12)[]): TenantPlan {
  return {
    id,
    code: id,
    name: id,
    billingMode: BILLING_MODE.PACKAGE,
    currency: 'VND',
    limits: {
      maxVehicles: 10,
      maxBranches: 2,
      features: [],
      termPrices: months.map((m) => ({ months: m, price: String(m * 1_000_000) })),
    },
  } as unknown as TenantPlan;
}

/** Cả hai bậc đều bán 3 tháng; chỉ bậc `basic` bán 1 tháng. */
const PLANS = [plan('basic', [1, 3, 12]), plan('pro', [3, 6, 12])];

describe('usePlanPurchase — đổi bậc sau khi đã chọn kỳ hạn', () => {
  it('MANG THEO kỳ hạn khi bậc mới cũng bán kỳ đó', async () => {
    const { result } = await renderHook(() => usePlanPurchase(PLANS));

    await act(async () => result.current.selectPlan('basic'));
    await act(async () => result.current.setTermMonths(3));
    expect(result.current.termMonths).toBe(3);

    await act(async () => result.current.selectPlan('pro'));

    // `pro` cũng bán kỳ 3 tháng ⇒ lựa chọn người dùng vừa tự tay chạm phải còn nguyên.
    expect(result.current.planId).toBe('pro');
    expect(result.current.termMonths).toBe(3);
    expect(result.current.selection).not.toBeNull();
  });

  it('BỎ kỳ hạn khi bậc mới không bán kỳ đó — server sẽ từ chối, đừng dựng sẵn một lỗi', async () => {
    const { result } = await renderHook(() => usePlanPurchase(PLANS));

    await act(async () => result.current.selectPlan('basic'));
    await act(async () => result.current.setTermMonths(1));

    await act(async () => result.current.selectPlan('pro'));

    // `pro` không bán kỳ 1 tháng.
    expect(result.current.termMonths).toBeNull();
    expect(result.current.selection).toBeNull();
  });

  it('KHÔNG tự mặc định kỳ hạn nào khi mới chỉ chọn bậc', async () => {
    const { result } = await renderHook(() => usePlanPurchase(PLANS));

    await act(async () => result.current.selectPlan('basic'));

    /*
     * Ranh giới của cả bộ test này: mang theo một kỳ hạn NGƯỜI DÙNG đã chạm thì đúng, còn tự
     * sáng sẵn một kỳ khi họ chưa chọn gì là cách khiến có người trả trước 12 tháng vì đó là thứ
     * đang nổi bật, không vì họ chọn nó.
     */
    expect(result.current.termMonths).toBeNull();
    expect(result.current.selection).toBeNull();
  });

  it('`reset` xoá cả bậc lẫn kỳ hạn — lượt chọn đã khép lại', async () => {
    const { result } = await renderHook(() => usePlanPurchase(PLANS));

    await act(async () => result.current.selectPlan('basic'));
    await act(async () => result.current.setTermMonths(3));
    await act(async () => result.current.reset());

    expect(result.current.planId).toBeNull();
    expect(result.current.termMonths).toBeNull();
  });
});
