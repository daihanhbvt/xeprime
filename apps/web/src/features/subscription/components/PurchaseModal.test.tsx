import { App } from 'antd';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ERROR_CODE, BILLING_MODE } from '@xeprime/types';
import { ApiClientError } from '@xeprime/api-client';

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
/** Hoá đơn còn chờ — để hộp thoại cảnh báo khi tạo mã mới sẽ huỷ mã cùng loại xe. */
const pending = vi.hoisted(() => ({ data: [] as unknown[] }));

/** Mua gói xong là sang trang thanh toán của hoá đơn — điều hướng ghi lại để kiểm. */
const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({
    push: nav.push,
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('../hooks/use-subscription', () => ({
  useTenantPlans: () => plans,
  usePendingInvoices: () => pending,
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
    vehicleScope: 'motorbike',
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

function renderModal(
  onClose = vi.fn(),
  current: Parameters<typeof PurchaseModal>[0]['current'] = null,
) {
  render(
    <App>
      <PurchaseModal open scope="motorbike" current={current} onClose={onClose} />
    </App>,
  );
  return { onClose };
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
  pending.data = [];
  purchase.mutate.mockReset();
  nav.push.mockReset();
});

afterEach(cleanup);

describe('PurchaseModal — bậc nào được bán', () => {
  it('bậc gian hàng hiện thẻ kèm trần xe và giá tháng', () => {
    renderModal();
    expect(screen.queryByText(/đang bán/)).toBeNull();
    expect(screen.getByText('Gói cơ bản')).toBeTruthy();
    expect(screen.getByText('Tối đa 3 xe máy')).toBeTruthy();
    // Trần chi nhánh thôi là hạn mức (ADR 0065 điều 1) — không in nữa.
    expect(screen.queryByText(/chi nhánh/)).toBeNull();
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

    expect(screen.getByRole('button', { name: /Tạo hoá đơn/ }).getAttribute('disabled')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Tạo hoá đơn/ }));
    // Không còn `slots` trong body: bậc gói không bán chỗ (ADR 0041 điều 1).
    expect(purchase.mutate).toHaveBeenCalledWith(
      { planId: 'plan-basic', termMonths: 3 },
      expect.anything(),
    );
  });

  /**
   * Hoá đơn tạo xong ⇒ hộp thoại đóng và người dùng sang TRANG THANH TOÁN của đúng hoá đơn đó —
   * nơi có cả chuyển khoản VietQR lẫn ví điện tử, sống qua F5 và là trang cổng quay về.
   */
  it('tạo hoá đơn xong ⇒ đóng hộp thoại, sang trang thanh toán của hoá đơn vừa tạo', () => {
    const { onClose } = renderModal();
    pickTier('Chọn gói');
    fireEvent.click(termCards()[1]!);
    fireEvent.click(screen.getByRole('button', { name: /Tạo hoá đơn/ }));

    const options = purchase.mutate.mock.calls[0]![1] as { onSuccess: (invoice: unknown) => void };
    options.onSuccess({ id: 'INV-NEW', code: 'XPGNEW' });

    expect(onClose).toHaveBeenCalled();
    expect(nav.push).toHaveBeenCalledWith('/manage/payment/INV-NEW');
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
    expect(screen.getByText(/Chưa có Gói xe máy nào đang bán/)).toBeTruthy();
  });
});

describe('PurchaseModal — bậc bán qua tư vấn', () => {
  /*
   * Giấu hẳn bậc doanh nghiệp là giấu luôn lối nâng cấp của gian hàng lớn nhất, và một bảng giá
   * dừng ở "10 xe" nói rằng nền tảng không phục vụ được đội xe lớn hơn (ADR 0041 điều 5).
   */
  it('vẫn có thẻ, nhưng là lời mời LIÊN HỆ chứ không phải một con số', () => {
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
    // Chỗ của giá là một lời mời liên hệ, không phải một con số không ai kiểm được.
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
    expect(
      screen.getByRole('button', { name: /Tạo hoá đơn/ }).getAttribute('disabled'),
    ).not.toBeNull();
  });
});

describe('PurchaseModal — một loại xe mỗi lần mua (ADR 0065)', () => {
  it('chỉ bày bậc CỦA ĐÚNG loại xe đang mua — bậc ô tô không lọt vào hộp xe máy', () => {
    plans.data = [
      makePlan(),
      makePlan({ id: 'plan-car', code: 'car_5', name: 'Ô tô 5 xe', vehicleScope: 'car' }),
    ];
    renderModal();
    expect(screen.getByText('Gói cơ bản')).toBeTruthy();
    expect(screen.queryByText('Ô tô 5 xe')).toBeNull();
    expect(screen.getByText('Mua / gia hạn Gói xe máy')).toBeTruthy();
  });

  it('đang có kỳ cùng loại xe ⇒ nói trước kỳ mới nối tiếp sau ngày hết hạn', () => {
    renderModal(vi.fn(), {
      subscriptionId: 'S1',
      planId: 'plan-basic',
      planCode: 'moto_5',
      planName: 'Xe máy 5 xe',
      vehicleScope: 'motorbike',
      phase: 'current',
      endsAt: '2026-12-01T00:00:00.000Z',
    });
    expect(screen.getByText(/Bạn đang dùng Xe máy 5 xe tới/)).toBeTruthy();
  });

  it('chưa có kỳ nào ⇒ gói bắt đầu khi tiền về', () => {
    renderModal();
    expect(screen.getByText(/bắt đầu ngay khi XePrime nhận được tiền/)).toBeTruthy();
  });

  it('có hoá đơn chờ CÙNG loại xe ⇒ cảnh báo mã cũ sẽ bị huỷ; hoá đơn loại khác thì không', () => {
    pending.data = [{ id: 'I2', code: 'XPGCAR', vehicleScope: 'car' }];
    const view = renderModal();
    expect(screen.queryByText(/XPGCAR/)).toBeNull();
    cleanup();
    pending.data = [{ id: 'I1', code: 'XPGMOTO', vehicleScope: 'motorbike' }];
    renderModal(view.onClose);
    expect(screen.getByText(/XPGMOTO của loại xe này đang chờ thanh toán/)).toBeTruthy();
  });
});

describe('PurchaseModal — Phương án B (Nâng gói ngay)', () => {
  it('đang có kỳ cùng loại xe: chọn nâng gói ngay hiển thị cảnh báo huỷ ngày còn lại và gửi timing: now', () => {
    renderModal(vi.fn(), {
      subscriptionId: 'S1',
      planId: 'plan-basic',
      planCode: 'moto_5',
      planName: 'Xe máy 5 xe',
      vehicleScope: 'motorbike',
      phase: 'current',
      endsAt: '2026-12-01T00:00:00.000Z',
    });

    pickTier('Chọn gói');
    fireEvent.click(termCards()[1]!);

    // Ban đầu mặc định nối tiếp sau khi hết hạn, nút ghi "Tạo hoá đơn"
    expect(screen.queryByText(/Kỳ hiện tại kết thúc ngay hôm nay/)).toBeNull();
    expect(screen.getByRole('button', { name: /Tạo hoá đơn/ })).toBeTruthy();

    // Chọn "Nâng gói ngay hôm nay"
    const radioNow = screen.getByRole('radio', { name: /Nâng gói ngay hôm nay/ });
    fireEvent.click(radioNow);

    // Cảnh báo không hoàn tiền ngày còn lại xuất hiện
    expect(
      screen.getByText(
        /Kỳ hiện tại kết thúc ngay hôm nay. Bạn thanh toán đầy đủ giá gói mới, không hoàn tiền ngày còn lại./,
      ),
    ).toBeTruthy();

    // Nút đổi thành "Nâng gói ngay"
    const submitBtn = screen.getByRole('button', { name: /Nâng gói ngay/ });
    expect(submitBtn).toBeTruthy();

    fireEvent.click(submitBtn);

    // Gửi đúng body kèm timing: 'now'
    expect(purchase.mutate).toHaveBeenCalledWith(
      { planId: 'plan-basic', termMonths: 3, timing: 'now' },
      expect.anything(),
    );
  });
});

describe('PurchaseModal — lỗi khi tạo hoá đơn', () => {
  it('bậc vừa về "chưa mở bán" (CONFLICT · planStatus=draft) ⇒ câu riêng mời chọn bậc khác', async () => {
    purchase.mutate.mockImplementation((_b: unknown, opts: { onError?: (e: unknown) => void }) =>
      opts.onError?.(
        new ApiClientError({
          code: API_ERROR_CODE.CONFLICT,
          message: 'Gói chưa mở bán',
          status: 409,
          details: { planStatus: 'draft' },
        }),
      ),
    );
    renderModal();
    pickTier('Chọn gói');
    fireEvent.click(termCards()[1]!);
    fireEvent.click(screen.getByRole('button', { name: /Tạo hoá đơn/ }));

    expect(await screen.findByText(/vừa ngừng nhận mua mới/)).toBeTruthy();
  });
});
