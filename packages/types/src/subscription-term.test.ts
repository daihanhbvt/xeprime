import { describe, expect, it } from 'vitest';
import { SUBSCRIPTION_STATUS } from './status/misc';
import {
  SUBSCRIPTION_ASSIGN_KIND,
  SUBSCRIPTION_CANCEL_BLOCK,
  SUBSCRIPTION_CHANGE_TIMING,
  SUBSCRIPTION_ORIGIN,
  SUBSCRIPTION_TERM_STATE,
  daysLeftUntil,
  planSubscriptionChain,
  subscriptionAssignKindOfAction,
  subscriptionCancelBlockOf,
  subscriptionOriginOf,
  subscriptionTermStateOf,
} from './subscription-term';

const NOW = new Date('2026-10-08T04:43:00.000Z');

describe('subscriptionTermStateOf', () => {
  it('kỳ đang chạy: starts <= now < ends', () => {
    expect(
      subscriptionTermStateOf(
        {
          status: SUBSCRIPTION_STATUS.ACTIVE,
          startsAt: '2026-10-08T04:43:00.000Z',
          endsAt: '2027-01-08T04:43:00.000Z',
        },
        NOW,
      ),
    ).toBe(SUBSCRIPTION_TERM_STATE.CURRENT);
  });

  it('kỳ nối đuôi chưa tới ngày là CHỜ ĐẾN KỲ — không phải một gói thứ hai đang hiệu lực', () => {
    expect(
      subscriptionTermStateOf(
        {
          status: SUBSCRIPTION_STATUS.ACTIVE,
          startsAt: '2027-01-08T04:43:00.000Z',
          endsAt: '2027-02-08T04:43:00.000Z',
        },
        NOW,
      ),
    ).toBe(SUBSCRIPTION_TERM_STATE.SCHEDULED);
  });

  it('kỳ đã qua ends_at là ĐÃ HẾT HẠN dù DB vẫn lưu active (ADR 0010 điều 2)', () => {
    expect(
      subscriptionTermStateOf(
        {
          status: SUBSCRIPTION_STATUS.ACTIVE,
          startsAt: new Date('2026-07-08T04:43:00.000Z'),
          endsAt: new Date('2026-10-08T04:43:00.000Z'),
        },
        NOW,
      ),
    ).toBe(SUBSCRIPTION_TERM_STATE.ENDED);
  });

  it('đã huỷ thắng mọi mốc thời gian', () => {
    expect(
      subscriptionTermStateOf(
        {
          status: SUBSCRIPTION_STATUS.CANCELLED,
          startsAt: '2026-10-08T04:43:00.000Z',
          endsAt: '2027-10-08T04:43:00.000Z',
        },
        NOW,
      ),
    ).toBe(SUBSCRIPTION_TERM_STATE.CANCELLED);
  });
});

describe('daysLeftUntil', () => {
  it('làm tròn lên và không âm', () => {
    expect(daysLeftUntil('2026-10-10T05:00:00.000Z', NOW)).toBe(3);
    expect(daysLeftUntil('2026-10-08T04:43:00.000Z', NOW)).toBe(0);
    expect(daysLeftUntil('2026-09-01T00:00:00.000Z', NOW)).toBe(0);
  });
});

describe('planSubscriptionChain — một bảng quyết định cho server và web', () => {
  const term = (over: Partial<Parameters<typeof planSubscriptionChain>[0][number]>) => ({
    id: 't',
    planId: 'basic',
    status: SUBSCRIPTION_STATUS.ACTIVE,
    billingMode: 'package',
    startsAt: '2026-10-01T00:00:00.000Z',
    endsAt: '2027-01-01T00:00:00.000Z',
    ...over,
  });

  it('không có kỳ trả phí ⇒ gán từ bây giờ, dòng hoa hồng còn hạn bị thay', () => {
    const commission = term({
      id: 'c',
      billingMode: 'commission',
      endsAt: '2027-10-01T00:00:00.000Z',
    });
    const plan = planSubscriptionChain([commission], { planId: 'basic' }, NOW);
    expect(plan.kind).toBe(SUBSCRIPTION_ASSIGN_KIND.ASSIGN);
    expect(plan.startsAt).toEqual(NOW);
    expect(plan.cancel.map((t) => t.id)).toEqual(['c']);
  });

  it('cùng bậc ⇒ gia hạn nối sau kỳ trả phí MUỘN NHẤT (kể cả kỳ đã xếp lịch)', () => {
    const current = term({ id: 'cur' });
    const scheduled = term({
      id: 'next',
      startsAt: '2027-01-01T00:00:00.000Z',
      endsAt: '2027-02-01T00:00:00.000Z',
    });
    const plan = planSubscriptionChain([current, scheduled], { planId: 'basic' }, NOW);
    expect(plan.kind).toBe(SUBSCRIPTION_ASSIGN_KIND.RENEW);
    expect(plan.previous?.id).toBe('next');
    expect(plan.startsAt.toISOString()).toBe('2027-02-01T00:00:00.000Z');
    expect(plan.cancel).toEqual([]);
  });

  it('khác bậc ⇒ đổi gói từ kỳ sau', () => {
    const plan = planSubscriptionChain([term({ id: 'cur' })], { planId: 'advanced' }, NOW);
    expect(plan.kind).toBe(SUBSCRIPTION_ASSIGN_KIND.SCHEDULE_CHANGE);
  });

  it('dòng hoa hồng xếp SAU kỳ gói không bao giờ làm đuôi — nó bị thay, kỳ mới nối sau kỳ gói', () => {
    const pkg = term({ id: 'pkg' });
    const downgrade = term({
      id: 'down',
      billingMode: 'commission',
      startsAt: '2027-01-01T00:00:00.000Z',
      endsAt: '2027-02-01T00:00:00.000Z',
    });
    const plan = planSubscriptionChain([pkg, downgrade], { planId: 'basic' }, NOW);
    expect(plan.previous?.id).toBe('pkg');
    expect(plan.startsAt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(plan.cancel.map((t) => t.id)).toEqual(['down']);
  });

  it('đổi ngay ⇒ bắt đầu bây giờ, huỷ MỌI kỳ còn hạn', () => {
    const plan = planSubscriptionChain(
      [
        term({ id: 'a' }),
        term({ id: 'b', startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-02-01T00:00:00.000Z' }),
      ],
      { planId: 'advanced', timing: SUBSCRIPTION_CHANGE_TIMING.NOW },
      NOW,
    );
    expect(plan.kind).toBe(SUBSCRIPTION_ASSIGN_KIND.CHANGE_NOW);
    expect(plan.startsAt).toEqual(NOW);
    expect(plan.cancel.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('kỳ đã hết hạn hoặc đã huỷ không tham gia chuỗi', () => {
    const ended = term({
      id: 'old',
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-02-01T00:00:00.000Z',
    });
    const cancelled = term({ id: 'x', status: SUBSCRIPTION_STATUS.CANCELLED });
    const plan = planSubscriptionChain([ended, cancelled], { planId: 'basic' }, NOW);
    expect(plan.kind).toBe(SUBSCRIPTION_ASSIGN_KIND.ASSIGN);
    expect(plan.cancel).toEqual([]);
  });
});

describe('subscriptionCancelBlockOf', () => {
  const live = (over: Record<string, unknown>) => ({
    id: 'cur',
    planId: 'basic',
    status: SUBSCRIPTION_STATUS.ACTIVE,
    billingMode: 'package',
    startsAt: '2026-10-01T00:00:00.000Z',
    endsAt: '2027-01-01T00:00:00.000Z',
    ...over,
  });

  it('kỳ đuôi trả phí huỷ được', () => {
    const cur = live({});
    expect(subscriptionCancelBlockOf(cur, [cur], NOW)).toBeNull();
  });

  it('có kỳ xếp sau ⇒ LATER_TERM', () => {
    const cur = live({});
    const next = live({
      id: 'next',
      startsAt: '2027-01-01T00:00:00.000Z',
      endsAt: '2027-02-01T00:00:00.000Z',
    });
    expect(subscriptionCancelBlockOf(cur, [cur, next], NOW)).toBe(
      SUBSCRIPTION_CANCEL_BLOCK.LATER_TERM,
    );
    expect(subscriptionCancelBlockOf(next, [cur, next], NOW)).toBeNull();
  });

  it('dòng hoa hồng ĐANG CHẠY không huỷ được; đã XẾP LỊCH thì huỷ được', () => {
    const running = live({ billingMode: 'commission' });
    expect(subscriptionCancelBlockOf(running, [running], NOW)).toBe(
      SUBSCRIPTION_CANCEL_BLOCK.DEFAULT_TERM,
    );
    const scheduled = live({
      id: 'down',
      billingMode: 'commission',
      startsAt: '2027-01-01T00:00:00.000Z',
      endsAt: '2027-02-01T00:00:00.000Z',
    });
    expect(subscriptionCancelBlockOf(scheduled, [scheduled], NOW)).toBeNull();
  });

  it('kỳ đã hết hạn / đã huỷ ⇒ NOT_LIVE', () => {
    const ended = live({
      endsAt: '2026-10-01T00:00:00.000Z',
      startsAt: '2026-09-01T00:00:00.000Z',
    });
    expect(subscriptionCancelBlockOf(ended, [ended], NOW)).toBe(SUBSCRIPTION_CANCEL_BLOCK.NOT_LIVE);
  });
});

describe('subscriptionAssignKindOfAction · subscriptionOriginOf', () => {
  it('mã audit ↔ đường gán', () => {
    expect(subscriptionAssignKindOfAction('subscription.schedule_change')).toBe(
      SUBSCRIPTION_ASSIGN_KIND.SCHEDULE_CHANGE,
    );
    expect(subscriptionAssignKindOfAction('subscription.cancel')).toBeNull();
  });

  it('nguồn gốc kỳ', () => {
    expect(subscriptionOriginOf({ createdBy: 'u', billingMode: 'package' })).toBe(
      SUBSCRIPTION_ORIGIN.ADMIN,
    );
    expect(subscriptionOriginOf({ createdBy: null, billingMode: 'package' })).toBe(
      SUBSCRIPTION_ORIGIN.PAYMENT,
    );
    expect(subscriptionOriginOf({ createdBy: null, billingMode: 'commission' })).toBe(
      SUBSCRIPTION_ORIGIN.SYSTEM,
    );
  });
});
