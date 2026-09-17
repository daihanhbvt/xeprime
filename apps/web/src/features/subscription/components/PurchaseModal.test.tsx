import { App } from 'antd';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BILLING_MODE } from '@xeprime/types';

import type { TenantPlan } from '../types';
import { PurchaseModal } from './PurchaseModal';

/**
 * Hộp thoại mua / gia hạn gói.
 *
 * Bộ này tồn tại vì một lỗi THẬT đã lọt qua: một bản cũ lọc gói bán được bằng
 * `basePriceMonthly > 0`, đúng chừng nào mọi gói còn có phí nền — rồi mô hình định giá đổi và vị
 * từ đó lập tức loại đúng gói đang bán. Danh sách rỗng, không ai mua được gì, mà không test nào
 * đỏ.
 *
 * Nên thứ được khoá ở đây là LUẬT ĐỌC BẢNG GIÁ, không phải bố cục:
 *  1. bậc `commission` KHÔNG bao giờ lọt vào bảng giá (nó là TUYẾN mặc định, không phải SKU);
 *  2. kỳ hạn chỉ hiện những kỳ bậc thật sự bán (ADR 0041 điều 2);
 *  3. mỗi kỳ hạn là một LỰA CHỌN MUA có giá thật, hiện cùng lúc;
 *  4. bậc `salesOnly` VẪN có thẻ nhưng không mua được (ADR 0041 điều 5).
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
    id: 'plan-basic',
    code: 'shop-basic',
    name: 'Gói cơ bản',
    description: 'Cho cửa hàng nhỏ',
    billingMode: BILLING_MODE.PACKAGE,
    commissionPercent: null,
    status: 'active',
    currency: 'VND',
    sortOrder: 1,
    limits: {
      maxVehicles: 3,
      maxBranches: 1,
      maxMembers: null,
      // Kỳ 1 tháng CÓ bán ⇒ có mốc để tính % tiết kiệm của các kỳ dài hơn.
      termPrices: [
        { months: 1, price: '100000' },
        { months: 3, price: '250000' },
        { months: 12, price: '800000' },
      ],
      salesOnly: false,
      recommended: false,
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

/** Thẻ kỳ hạn = radio bên trong nhóm "Chọn thời hạn"; thẻ BẬC nằm ở nhóm còn lại. */
function termCards(): HTMLElement[] {
  const group = screen.getByRole('radiogroup', { name: 'Chọn thời hạn' });
  return Array.from(group.querySelectorAll('[role="radio"]')) as HTMLElement[];
}

function pickTier(name: string) {
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(name) }));
}

beforeEach(() => {
  plans.data = [makePlan()];
  purchase.mutate.mockReset();
});

afterEach(cleanup);

describe('PurchaseModal — bậc nào được bán', () => {
  it('bậc gian hàng hiện thẻ kèm trần xe và giá tháng', () => {
    renderModal();
    expect(screen.queryByText(/Chưa có gói nào đang bán/)).toBeNull();
    expect(screen.getByText('Gói cơ bản')).toBeTruthy();
    expect(screen.getByText('Tối đa 3 xe')).toBeTruthy();
    expect(screen.getByText('Tối đa 1 chi nhánh')).toBeTruthy();
  });

  /*
   * Kỳ hạn chỉ mở ra SAU khi chọn bậc: vẽ cả bốn kỳ trên cả ba thẻ là mười hai con số cho một
   * quyết định hai bước, và % tiết kiệm chỉ có nghĩa khi so với giá tháng của chính bậc đó.
   */
  it('chưa chọn bậc thì chưa có bảng kỳ hạn nào', () => {
    renderModal();
    expect(screen.queryByRole('radiogroup', { name: 'Chọn thời hạn' })).toBeNull();
  });

  it('chọn bậc: kỳ hạn hiện CÙNG LÚC, đúng những kỳ bậc bán, kèm % tiết kiệm', () => {
    renderModal();
    pickTier('Chọn gói');

    const terms = termCards();
    expect(terms).toHaveLength(3);
    expect(terms[0]!.textContent).toContain('1 tháng');
    expect(terms[1]!.textContent).toContain('3 tháng');
    expect(terms[2]!.textContent).toContain('12 tháng');

    // Kỳ 6 tháng KHÔNG có trong bảng giá ⇒ không có thẻ nào cho nó.
    expect(terms.some((el) => el.textContent?.includes('6 tháng'))).toBe(false);

    // Giá là con số TUYỆT ĐỐI của kỳ, không phải một phép nhân (ADR 0041 điều 2).
    expect(terms[1]!.textContent).toMatch(/250[.,]000/);
    expect(terms[2]!.textContent).toMatch(/800[.,]000/);

    // 250.000 so với 3 × 100.000 ⇒ 17%; 800.000 so với 12 × 100.000 ⇒ 33%.
    expect(terms[1]!.textContent).toContain('Tiết kiệm 17%');
    expect(terms[2]!.textContent).toContain('Tiết kiệm 33%');
  });

  it('chưa chọn kỳ hạn thì không tạo được hoá đơn — không mặc định sẵn một cam kết', () => {
    renderModal();
    const submit = screen.getByRole('button', { name: /Tạo hoá đơn/ });
    expect(submit.getAttribute('disabled')).not.toBeNull();

    pickTier('Chọn gói');
    fireEvent.click(termCards()[1]!);

    expect(
      screen.getByRole('button', { name: /Tạo hoá đơn/ }).getAttribute('disabled'),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Tạo hoá đơn/ }));
    // Không còn `slots` trong body: bậc gói không bán chỗ (ADR 0041 điều 1).
    expect(purchase.mutate).toHaveBeenCalledWith(
      { planId: 'plan-basic', termMonths: 3 },
      expect.anything(),
    );
  });

  it('gói tuyến hoa hồng KHÔNG lọt vào bảng giá', () => {
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

describe('PurchaseModal — bậc bán qua tư vấn', () => {
  /*
   * Giấu hẳn bậc doanh nghiệp là giấu luôn lối nâng cấp của gian hàng lớn nhất, và một bảng giá
   * dừng ở "10 xe" nói rằng nền tảng không phục vụ được đội xe lớn hơn (ADR 0041 điều 5).
   */
  it('vẫn có thẻ, nhưng là "Liên hệ báo giá" chứ không phải một con số', () => {
    plans.data = [
      makePlan(),
      makePlan({
        id: 'plan-pro',
        code: 'shop-pro',
        name: 'Gói chuyên nghiệp',
        limits: {
          maxVehicles: null,
          maxBranches: null,
          maxMembers: null,
          termPrices: [],
          salesOnly: true,
          recommended: false,
          graceDays: 7,
          features: [],
        },
      } as Partial<TenantPlan>),
    ];
    renderModal();

    expect(screen.getByText('Gói chuyên nghiệp')).toBeTruthy();
    expect(screen.getByText('Không giới hạn xe')).toBeTruthy();
    expect(screen.getByText('Liên hệ báo giá')).toBeTruthy();
    // Lối đi là một LIÊN KẾT tới trung tâm hỗ trợ, không phải một nút chọn mua.
    const contact = screen.getByRole('link', { name: 'Liên hệ tư vấn' });
    expect(contact.getAttribute('href')).toBe('/support');
  });

  it('không có thẻ radio nào cho bậc tư vấn — nó không chọn mua được', () => {
    plans.data = [
      makePlan({
        id: 'plan-pro',
        code: 'shop-pro',
        name: 'Gói chuyên nghiệp',
        limits: {
          maxVehicles: null,
          maxBranches: null,
          maxMembers: null,
          termPrices: [],
          salesOnly: true,
          recommended: false,
          graceDays: 7,
          features: [],
        },
      } as Partial<TenantPlan>),
    ];
    renderModal();

    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByRole('button', { name: /Tạo hoá đơn/ }).getAttribute('disabled')).not.toBeNull();
  });
});
