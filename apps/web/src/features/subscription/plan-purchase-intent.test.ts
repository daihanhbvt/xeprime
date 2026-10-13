import { describe, expect, it } from 'vitest';

import { PLAN_PURCHASE_INTENT_ACTION as A, planPurchaseIntentAction } from './plan-purchase-intent';

describe('planPurchaseIntentAction', () => {
  it('tuyến gói có quyền mua → mở hộp thoại', () => {
    expect(planPurchaseIntentAction({ canPurchase: true, upgrading: false, inSupport: false })).toBe(
      A.OPEN_DIALOG,
    );
  });
  it('chủ xe hoa hồng → tới khối nâng cấp', () => {
    expect(planPurchaseIntentAction({ canPurchase: true, upgrading: true, inSupport: false })).toBe(
      A.FOCUS_UPGRADE,
    );
  });
  it('thiếu quyền hoặc phiên hỗ trợ → không mở gì', () => {
    expect(planPurchaseIntentAction({ canPurchase: false, upgrading: false, inSupport: false })).toBe(
      A.NONE,
    );
    expect(planPurchaseIntentAction({ canPurchase: true, upgrading: false, inSupport: true })).toBe(
      A.NONE,
    );
  });
});
