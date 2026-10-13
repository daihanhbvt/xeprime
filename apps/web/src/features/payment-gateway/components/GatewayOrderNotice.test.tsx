import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PAYMENT_ORDER_STATUS,
  PAYMENT_ORDER_TARGET,
  PAYMENT_ORDER_VIEW_STATE,
} from '@xeprime/types';
import { canStartAnotherCheckout, shouldPollGatewayOrder } from '../hooks';
import type { PaymentOrder } from '../types';
import { GatewayOrderNotice } from './GatewayOrderNotice';

/**
 * Khối trạng thái của MỘT lượt thanh toán qua cổng — thứ người trả nhìn thấy khi quay về (ADR 0058).
 *
 * Điều được khoá: mỗi chặng do SERVER tính nói đúng một câu, không chặng nào nói "đã nhận" khi tiền
 * chưa vào đích, và lượt cần người xử lý không bao giờ mời trả lại lần nữa.
 */
const query = vi.hoisted(() => ({
  data: undefined as unknown,
  isError: false,
  refetch: vi.fn(),
}));

vi.mock('../hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useGatewayOrder: () => query,
}));

function makeOrder(over: Partial<PaymentOrder> = {}): PaymentOrder {
  return {
    id: '01JTESTORDER0000000000000A',
    provider: 'momo',
    targetType: PAYMENT_ORDER_TARGET.SUBSCRIPTION_INVOICE,
    targetCode: 'XPG2K9ADFG',
    tripId: null,
    invoiceId: '01HINVOICE00000000000000',
    amount: '300000',
    status: PAYMENT_ORDER_STATUS.PENDING,
    viewState: PAYMENT_ORDER_VIEW_STATE.AWAITING,
    applyOutcome: null,
    checkoutUrl: 'https://momo.example.test/pay/1',
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    paidAt: null,
    sandbox: false,
    createdAt: new Date().toISOString(),
    noTransaction: false,
    ...over,
  } as PaymentOrder;
}

beforeEach(() => {
  query.data = undefined;
  query.isError = false;
});

describe('GatewayOrderNotice', () => {
  it('đang chờ cổng, còn liên kết: mời TIẾP TỤC trả trên chính phiên đó', () => {
    query.data = makeOrder();
    render(<GatewayOrderNotice surface="partner" orderId="X" />);
    expect(screen.getByText(/Đang chờ Ví MoMo xác nhận thanh toán/)).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Tiếp tục thanh toán' });
    expect(link.getAttribute('href')).toBe('https://momo.example.test/pay/1');
  });

  it('đang chờ, liên kết đã hết hạn dùng: nói rõ tiền trả muộn vẫn được ghi nhận', () => {
    query.data = makeOrder({ checkoutUrl: null });
    render(<GatewayOrderNotice surface="partner" orderId="X" />);
    expect(screen.getByText('Phiên thanh toán qua Ví MoMo đã hết hạn')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Tiếp tục thanh toán' })).toBeNull();
  });

  it('đã ghi nhận: nói số tiền, cổng và mã hoá đơn; báo nơi gọi MỘT lần', () => {
    const onSettled = vi.fn();
    query.data = makeOrder({
      status: PAYMENT_ORDER_STATUS.SUCCEEDED,
      viewState: PAYMENT_ORDER_VIEW_STATE.COMPLETED,
      applyOutcome: 'activated',
      checkoutUrl: null,
    });
    const { rerender } = render(
      <GatewayOrderNotice surface="partner" orderId="X" onSettled={onSettled} />,
    );
    expect(screen.getByText(/Đã nhận 300\.000/)).toBeTruthy();
    expect(screen.getByText(/hoá đơn XPG2K9ADFG/)).toBeTruthy();
    rerender(<GatewayOrderNotice surface="partner" orderId="X" onSettled={onSettled} />);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('cần người xử lý: không mời trả lại, đưa mã tham chiếu', () => {
    query.data = makeOrder({
      status: PAYMENT_ORDER_STATUS.SUCCEEDED,
      viewState: PAYMENT_ORDER_VIEW_STATE.NEEDS_SUPPORT,
      applyOutcome: 'target_closed',
      checkoutUrl: null,
    });
    render(<GatewayOrderNotice surface="customer" orderId="X" />);
    expect(screen.getByText(/chưa thể ghi nhận tự động/)).toBeTruthy();
    expect(screen.getByText(/không cần thanh toán lại/)).toBeTruthy();
    expect(screen.getByText(/01JTESTORDER0000000000000A/)).toBeTruthy();
  });

  it('trả trùng vào tiền giữ chỗ đã có yêu cầu hoàn: nói đã hoàn, không hứa liên hệ', () => {
    query.data = makeOrder({
      targetType: PAYMENT_ORDER_TARGET.BOOKING_HOLD,
      targetCode: 'XPH7Q2M4K9',
      status: PAYMENT_ORDER_STATUS.SUCCEEDED,
      viewState: PAYMENT_ORDER_VIEW_STATE.DUPLICATE_REFUNDED,
      applyOutcome: 'already_paid',
      checkoutUrl: null,
    });
    render(<GatewayOrderNotice surface="customer" orderId="X" />);
    expect(screen.getByText(/khoản này bị trả trùng/)).toBeTruthy();
    expect(screen.getByText(/XPH7Q2M4K9/)).toBeTruthy();
    expect(screen.queryByText(/liên hệ với bạn/)).toBeNull();
  });

  it('khách huỷ trên cổng: nói đúng là đã huỷ, chưa ghi nhận gì', () => {
    query.data = makeOrder({
      status: PAYMENT_ORDER_STATUS.CANCELLED,
      viewState: PAYMENT_ORDER_VIEW_STATE.FAILED,
      checkoutUrl: null,
    });
    render(<GatewayOrderNotice surface="customer" orderId="X" />);
    expect(screen.getByText('Bạn đã huỷ thanh toán qua Ví MoMo')).toBeTruthy();
    expect(screen.getByText(/Chưa có khoản nào được ghi nhận/)).toBeTruthy();
  });

  /**
   * Khách bấm Huỷ ở trang VNPAY và quay về (13/10/2026): cổng ký xác nhận "không có giao dịch", lượt
   * vẫn `pending` theo ADR 0058. Trang KHÔNG được quay "đang chờ" — không có gì để chờ — và không mời
   * mở lại liên kết vừa bị huỷ.
   */
  it('cổng xác nhận chưa có giao dịch (khách huỷ ở cổng): thôi chờ, mời chọn lại phương thức', () => {
    query.data = makeOrder({ provider: 'vnpay', noTransaction: true, checkoutUrl: null });
    render(<GatewayOrderNotice surface="customer" orderId="X" />);
    expect(screen.getByText('Chưa có giao dịch nào qua VNPAY')).toBeTruthy();
    expect(screen.getByText(/chọn lại phương thức thanh toán bên dưới/)).toBeTruthy();
    expect(screen.queryByText(/Đang chờ VNPAY xác nhận/)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Tiếp tục thanh toán' })).toBeNull();
  });

  it('mở từ app: có nút quay lại ứng dụng', () => {
    query.data = makeOrder();
    render(
      <GatewayOrderNotice surface="customer" orderId="X" nativeReturnHref="xeprime://trips/RQ1" />,
    );
    expect(
      screen.getByRole('link', { name: 'Mở lại ứng dụng XePrime' }).getAttribute('href'),
    ).toBe('xeprime://trips/RQ1');
  });
});

describe('shouldPollGatewayOrder', () => {
  it('hỏi lại khi còn chờ hoặc đang ghi nhận; dừng ở mọi chặng kết thúc', () => {
    expect(shouldPollGatewayOrder(makeOrder())).toBe(true);
    expect(
      shouldPollGatewayOrder(makeOrder({ viewState: PAYMENT_ORDER_VIEW_STATE.CONFIRMING })),
    ).toBe(true);
    expect(
      shouldPollGatewayOrder(makeOrder({ viewState: PAYMENT_ORDER_VIEW_STATE.COMPLETED })),
    ).toBe(false);
    expect(shouldPollGatewayOrder(undefined)).toBe(false);
  });

  it('cổng xác nhận chưa có giao dịch: không còn gì để chờ trên lượt đó — thôi hỏi', () => {
    expect(shouldPollGatewayOrder(makeOrder({ noTransaction: true, checkoutUrl: null }))).toBe(false);
  });

  it('thôi hỏi một lượt bỏ dở khi liên kết đã hết hạn quá lâu', () => {
    const stale = makeOrder({ expiresAt: new Date(Date.now() - 60 * 60_000).toISOString() });
    expect(shouldPollGatewayOrder(stale)).toBe(false);
  });
});

describe('canStartAnotherCheckout', () => {
  const loaded = { failedToLoad: false };

  it('lượt còn liên kết, đang ghi nhận, đã xong hay chờ người xử lý: KHÔNG mời trả lần nữa', () => {
    expect(canStartAnotherCheckout(makeOrder(), loaded)).toBe(false);
    for (const viewState of [
      PAYMENT_ORDER_VIEW_STATE.CONFIRMING,
      PAYMENT_ORDER_VIEW_STATE.COMPLETED,
      PAYMENT_ORDER_VIEW_STATE.DUPLICATE_REFUNDED,
      PAYMENT_ORDER_VIEW_STATE.NEEDS_SUPPORT,
    ]) {
      expect(canStartAnotherCheckout(makeOrder({ viewState, checkoutUrl: null }), loaded)).toBe(
        false,
      );
    }
  });

  it('lượt thất bại, hay liên kết đã quá hạn dùng lại: mời mở phiên mới', () => {
    expect(
      canStartAnotherCheckout(
        makeOrder({ viewState: PAYMENT_ORDER_VIEW_STATE.FAILED, checkoutUrl: null }),
        loaded,
      ),
    ).toBe(true);
    expect(canStartAnotherCheckout(makeOrder({ checkoutUrl: null }), loaded)).toBe(true);
    // Khách huỷ ở cổng — server sẽ mở phiên MỚI, không đưa lại liên kết vừa bị huỷ.
    expect(canStartAnotherCheckout(makeOrder({ noTransaction: true }), loaded)).toBe(true);
  });

  it('đang tải thì chưa vẽ; không đọc được lượt thì để server làm chốt chặn', () => {
    expect(canStartAnotherCheckout(undefined, loaded)).toBe(false);
    expect(canStartAnotherCheckout(undefined, { failedToLoad: true })).toBe(true);
  });
});
