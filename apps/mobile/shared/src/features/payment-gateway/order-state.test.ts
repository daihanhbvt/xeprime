import { PAYMENT_GATEWAY_MIN_HOLD_WINDOW_MINUTES, PAYMENT_ORDER_VIEW_STATE } from '@xeprime/types';
import type { PaymentGatewayMethod, PaymentOrder } from '@/api/payment-gateway/api';
import {
  canStartAnotherCheckout,
  isHoldWindowTooShort,
  isOutOfRange,
  POLL_GRACE_AFTER_EXPIRY_MS,
  shouldPollGatewayOrder,
} from './order-state';

const NOW = Date.parse('2026-10-09T03:00:00.000Z');

function order(patch: Partial<PaymentOrder>): PaymentOrder {
  return {
    viewState: PAYMENT_ORDER_VIEW_STATE.AWAITING,
    checkoutUrl: 'https://pay.example/x',
    expiresAt: new Date(NOW + 60_000).toISOString(),
    ...patch,
  } as PaymentOrder;
}

describe('shouldPollGatewayOrder', () => {
  it('không có lượt thì không hỏi', () => {
    expect(shouldPollGatewayOrder(undefined, NOW)).toBe(false);
  });

  it('còn chờ cổng và chưa quá hạn + ân hạn thì hỏi; quá thì thôi', () => {
    expect(shouldPollGatewayOrder(order({}), NOW)).toBe(true);
    const expired = new Date(NOW - POLL_GRACE_AFTER_EXPIRY_MS - 1).toISOString();
    expect(shouldPollGatewayOrder(order({ expiresAt: expired }), NOW)).toBe(false);
  });

  it('đang ghi nhận thì luôn hỏi; chặng kết thúc thì dừng', () => {
    expect(
      shouldPollGatewayOrder(order({ viewState: PAYMENT_ORDER_VIEW_STATE.CONFIRMING }), NOW),
    ).toBe(true);
    expect(
      shouldPollGatewayOrder(order({ viewState: PAYMENT_ORDER_VIEW_STATE.COMPLETED }), NOW),
    ).toBe(false);
  });
});

describe('canStartAnotherCheckout', () => {
  it('lượt còn liên kết dùng được thì KHÔNG mời mở phiên mới (tránh trả hai lần)', () => {
    expect(canStartAnotherCheckout(order({}), { failedToLoad: false })).toBe(false);
  });

  it('liên kết đã hết hạn dùng lại, hoặc lượt thất bại thì mời', () => {
    expect(canStartAnotherCheckout(order({ checkoutUrl: null }), { failedToLoad: false })).toBe(
      true,
    );
    expect(
      canStartAnotherCheckout(order({ viewState: PAYMENT_ORDER_VIEW_STATE.FAILED }), {
        failedToLoad: false,
      }),
    ).toBe(true);
  });

  it('đang ghi nhận / đã xong / chờ hỗ trợ thì không', () => {
    for (const viewState of [
      PAYMENT_ORDER_VIEW_STATE.CONFIRMING,
      PAYMENT_ORDER_VIEW_STATE.COMPLETED,
      PAYMENT_ORDER_VIEW_STATE.NEEDS_SUPPORT,
      PAYMENT_ORDER_VIEW_STATE.DUPLICATE_REFUNDED,
    ]) {
      expect(canStartAnotherCheckout(order({ viewState } as Partial<PaymentOrder>), { failedToLoad: false })).toBe(false);
    }
  });

  it('chưa tải xong thì chưa mời; tải lỗi thì mời (server vẫn là chốt chặn)', () => {
    expect(canStartAnotherCheckout(undefined, { failedToLoad: false })).toBe(false);
    expect(canStartAnotherCheckout(undefined, { failedToLoad: true })).toBe(true);
  });
});

describe('isOutOfRange / isHoldWindowTooShort', () => {
  const method = { provider: 'momo', minAmount: '10000', maxAmount: '50000000' } as PaymentGatewayMethod;

  it('so tiền bằng chuỗi, không qua number', () => {
    expect(isOutOfRange(method, '9999')).toBe(true);
    expect(isOutOfRange(method, '10000')).toBe(false);
    expect(isOutOfRange(method, '50000001')).toBe(true);
    expect(isOutOfRange({ ...method, minAmount: null, maxAmount: null }, '1')).toBe(false);
  });

  it('hạn còn ít hơn ngưỡng tối thiểu thì không mời mở phiên', () => {
    const minMs = PAYMENT_GATEWAY_MIN_HOLD_WINDOW_MINUTES * 60_000;
    expect(isHoldWindowTooShort(new Date(NOW + minMs - 1).toISOString(), NOW)).toBe(true);
    expect(isHoldWindowTooShort(new Date(NOW + minMs + 1).toISOString(), NOW)).toBe(false);
    expect(isHoldWindowTooShort(null, NOW)).toBe(false);
  });
});

describe('noTransaction — cổng xác nhận chưa có giao dịch (khách huỷ ở cổng)', () => {
  it('không còn hỏi lại lượt đó', () => {
    expect(shouldPollGatewayOrder(order({ noTransaction: true }), NOW)).toBe(false);
  });

  it('mời mở phiên mới dù liên kết cũ còn hạn', () => {
    expect(canStartAnotherCheckout(order({ noTransaction: true }), { failedToLoad: false })).toBe(
      true,
    );
  });
});
