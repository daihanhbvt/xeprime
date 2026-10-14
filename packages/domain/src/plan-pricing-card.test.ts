import { describe, expect, it } from 'vitest';
import { BILLING_MODE, PLAN_FEATURE } from '@xeprime/types';

import { PLAN_TIER_ICON, buildPlanPricingCards } from './plan-pricing-card';

const plan = (id: string, limits: Record<string, unknown>, billingMode: string = BILLING_MODE.PACKAGE) => ({
  id,
  billingMode,
  limits,
});

describe('buildPlanPricingCards', () => {
  const cards = buildPlanPricingCards([
    plan('basic', {
      maxVehicles: 3,
      maxBranches: 1,
      termPrices: [
        { months: 12, price: '2000000' },
        { months: 1, price: '199000' },
      ],
      features: [PLAN_FEATURE.FINANCE, PLAN_FEATURE.DEBTS, PLAN_FEATURE.MEMBERS],
    }),
    plan('commission', { termPrices: [] }, BILLING_MODE.COMMISSION),
    plan('plus', { maxVehicles: 10, recommended: true, termPrices: [{ months: 3, price: '900000' }] }),
    plan('pro', { maxVehicles: null, salesOnly: true, termPrices: [{ months: 1, price: '1' }] }),
    plan('ent', { salesOnly: true }),
  ]);

  it('giữ mọi bậc tuyến gói theo thứ tự đầu vào, kể cả bậc tư vấn', () => {
    expect(cards.map((c) => c.plan.id)).toEqual(['basic', 'plus', 'pro', 'ent']);
    expect(cards.map((c) => c.icon)).toEqual([
      PLAN_TIER_ICON.TREND,
      PLAN_TIER_ICON.STAR,
      PLAN_TIER_ICON.CROWN,
      PLAN_TIER_ICON.CROWN,
    ]);
  });

  it('giá tiêu đề: kỳ 1 tháng nếu bán, không thì kỳ đầu; bậc tư vấn không có giá', () => {
    expect(cards[0]!.headline).toEqual({ months: 1, price: '199000' });
    expect(cards[1]!.headline).toEqual({ months: 3, price: '900000' });
    expect(cards[2]!.headline).toBeNull();
    expect(cards[2]!.selfServe).toBe(false);
  });

  it('quyền lợi: hai dòng hạn mức + tối đa hai năng lực', () => {
    expect(cards[0]!.benefits).toEqual([
      { kind: 'vehicles', count: 3 },
      { kind: 'branches', count: 1 },
      { kind: 'feature', feature: PLAN_FEATURE.FINANCE },
      { kind: 'feature', feature: PLAN_FEATURE.DEBTS },
    ]);
    expect(cards[1]!.recommended).toBe(true);
  });
});
