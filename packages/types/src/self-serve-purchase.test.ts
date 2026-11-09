import { describe, expect, it } from 'vitest';

import { BILLING_MODE } from './status/billing';
import { SUBSCRIPTION_STATUS } from './status/misc';
import {
  PLAN_PURCHASE_KIND,
  SUBSCRIPTION_CHANGE_TIMING,
  planSubscriptionChain,
  selfServePurchaseTiming,
  type SubscriptionCapTerm,
} from './subscription-term';

const NOW = new Date('2026-12-25T00:00:00.000Z');

function term(
  id: string,
  planId: string,
  maxVehicles: number | null,
  startsAt: string,
  endsAt: string,
  extra: Partial<SubscriptionCapTerm> = {},
): SubscriptionCapTerm {
  return {
    id,
    planId,
    maxVehicles,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    billingMode: BILLING_MODE.PACKAGE,
    vehicleScope: 'car',
    startsAt,
    endsAt,
    ...extra,
  };
}

const running = term('t1', 'car_1', 1, '2026-12-14T00:00:00.000Z', '2027-01-14T00:00:00.000Z');

describe('selfServePurchaseTiming (ADR 0084)', () => {
  it('chưa có kỳ trả phí cùng loại xe ⇒ mua mới', () => {
    const moto = term('m', 'moto_1', 1, running.startsAt as string, running.endsAt as string, {
      vehicleScope: 'motorbike',
    });
    expect(
      selfServePurchaseTiming(
        [moto],
        { planId: 'car_1', vehicleScope: 'car', maxVehicles: 1 },
        NOW,
      ),
    ).toEqual({ kind: PLAN_PURCHASE_KIND.NEW, timing: SUBSCRIPTION_CHANGE_TIMING.NEXT_TERM });
  });

  it('dòng hoa hồng không tính là kỳ trả phí', () => {
    const commission = term(
      'c',
      'commission',
      3,
      '2026-01-01T00:00:00.000Z',
      '2027-06-01T00:00:00.000Z',
      {
        billingMode: BILLING_MODE.COMMISSION,
        vehicleScope: 'all',
      },
    );
    expect(
      selfServePurchaseTiming(
        [commission],
        { planId: 'car_1', vehicleScope: 'car', maxVehicles: 1 },
        NOW,
      ).kind,
    ).toBe(PLAN_PURCHASE_KIND.NEW);
  });

  it('cùng bậc ⇒ gia hạn nối tiếp, không huỷ kỳ nào', () => {
    const decision = selfServePurchaseTiming(
      [running],
      { planId: 'car_1', vehicleScope: 'car', maxVehicles: 1 },
      NOW,
    );
    expect(decision).toEqual({
      kind: PLAN_PURCHASE_KIND.RENEW,
      timing: SUBSCRIPTION_CHANGE_TIMING.NEXT_TERM,
    });
    const chain = planSubscriptionChain(
      [running],
      { planId: 'car_1', vehicleScope: 'car', timing: decision.timing },
      NOW,
    );
    expect(chain.cancel).toEqual([]);
    expect(chain.startsAt.toISOString()).toBe(running.endsAt);
  });

  it('trần cao hơn mọi kỳ ⇒ nâng bậc ngay, các kỳ cũ cùng loại xe kết thúc', () => {
    const scheduled = term(
      't2',
      'car_1',
      1,
      '2027-01-14T00:00:00.000Z',
      '2027-02-14T00:00:00.000Z',
    );
    const decision = selfServePurchaseTiming(
      [running, scheduled],
      { planId: 'car_5', vehicleScope: 'car', maxVehicles: 5 },
      NOW,
    );
    expect(decision).toEqual({
      kind: PLAN_PURCHASE_KIND.UPGRADE,
      timing: SUBSCRIPTION_CHANGE_TIMING.NOW,
    });
    const chain = planSubscriptionChain(
      [running, scheduled],
      { planId: 'car_5', vehicleScope: 'car', timing: decision.timing },
      NOW,
    );
    expect(chain.startsAt).toEqual(NOW);
    expect(chain.cancel.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('không giới hạn cao hơn mọi con số; hai kỳ không giới hạn thì không phải nâng bậc', () => {
    expect(
      selfServePurchaseTiming(
        [running],
        { planId: 'car_x', vehicleScope: 'car', maxVehicles: null },
        NOW,
      ).kind,
    ).toBe(PLAN_PURCHASE_KIND.UPGRADE);
    const unlimited = { ...running, planId: 'car_x', maxVehicles: null };
    expect(
      selfServePurchaseTiming(
        [unlimited],
        { planId: 'car_y', vehicleScope: 'car', maxVehicles: null },
        NOW,
      ).kind,
    ).toBe(PLAN_PURCHASE_KIND.CHANGE_NEXT);
  });

  it('hạ bậc ⇒ nối tiếp sau kỳ cao, không huỷ', () => {
    const high = { ...running, planId: 'car_5', maxVehicles: 5 };
    expect(
      selfServePurchaseTiming(
        [high],
        { planId: 'car_1', vehicleScope: 'car', maxVehicles: 1 },
        NOW,
      ),
    ).toEqual({
      kind: PLAN_PURCHASE_KIND.CHANGE_NEXT,
      timing: SUBSCRIPTION_CHANGE_TIMING.NEXT_TERM,
    });
  });

  it('không cao hơn một kỳ ĐÃ XẾP LỊCH ⇒ nối tiếp, không huỷ kỳ đã trả trước', () => {
    const prepaid = term(
      't2',
      'car_10',
      10,
      '2027-01-14T00:00:00.000Z',
      '2027-02-14T00:00:00.000Z',
    );
    expect(
      selfServePurchaseTiming(
        [running, prepaid],
        { planId: 'car_5', vehicleScope: 'car', maxVehicles: 5 },
        NOW,
      ).kind,
    ).toBe(PLAN_PURCHASE_KIND.CHANGE_NEXT);
  });

  it('kỳ đã hết hoặc đã huỷ không tính', () => {
    const ended = term('old', 'car_10', 10, '2026-10-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z');
    const cancelled = {
      ...running,
      id: 'x',
      planId: 'car_10',
      maxVehicles: 10,
      status: SUBSCRIPTION_STATUS.CANCELLED,
    };
    expect(
      selfServePurchaseTiming(
        [ended, cancelled, running],
        { planId: 'car_5', vehicleScope: 'car', maxVehicles: 5 },
        NOW,
      ).kind,
    ).toBe(PLAN_PURCHASE_KIND.UPGRADE);
  });
});
