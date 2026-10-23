import { describe, expect, it } from 'vitest';
import { API_ERROR_CODE } from '@xeprime/types';

import {
  PLAN_QUOTA_GATE_KIND,
  PLAN_QUOTA_GATE_POINT,
  PLAN_QUOTA_GATE_SOURCE,
  planQuotaGateFrom,
  planQuotaGateHref,
} from './plan-quota-gate';
import {
  PLAN_LANE_PARAM,
  enterprisePlanOf,
  parsePlanLane,
  pendingInvoiceForScope,
  planLaneHref,
  quotaIsFull,
  quotasShareOneCap,
} from './plan-lanes';
import type { CurrentPlan, MySubscription, SubscriptionInvoice } from './types';

/**
 * Cổng hạn mức xe đọc từ LỖI API (ADR 0065) — màn xe nói đúng loại xe + con số và dẫn tới đúng làn
 * gói. Một `details` hỏng phải rơi về câu chung, không bao giờ in một câu thiếu số.
 */
describe('planQuotaGateFrom', () => {
  it('PLAN_SCOPE_REQUIRED ⇒ chưa có gói cho đúng loại xe trong `details`', () => {
    expect(
      planQuotaGateFrom({
        code: API_ERROR_CODE.PLAN_SCOPE_REQUIRED,
        details: { vehicleType: 'motorbike' },
      }),
    ).toEqual({ kind: PLAN_QUOTA_GATE_KIND.SCOPE_REQUIRED, vehicleType: 'motorbike' });
  });

  it('PLAN_LIMIT_REACHED của bậc theo loại ⇒ nguồn LANE_PLAN, điểm chặn đúng như server gửi', () => {
    expect(
      planQuotaGateFrom({
        code: API_ERROR_CODE.PLAN_LIMIT_REACHED,
        details: {
          scope: 'marketplace',
          reason: 'plan',
          vehicleType: 'car',
          countedScope: 'car',
          used: 5,
          limit: 5,
        },
      }),
    ).toEqual({
      kind: PLAN_QUOTA_GATE_KIND.LIMIT_REACHED,
      vehicleType: 'car',
      point: PLAN_QUOTA_GATE_POINT.MARKETPLACE,
      source: PLAN_QUOTA_GATE_SOURCE.LANE_PLAN,
      used: 5,
      limit: 5,
    });
  });

  it('trần chung (`countedScope = all`) và Owner Lite là hai nguồn khác nhau', () => {
    const base = { scope: 'fleet', vehicleType: 'car', used: 3, limit: 3 };
    expect(
      planQuotaGateFrom({
        code: API_ERROR_CODE.PLAN_LIMIT_REACHED,
        details: { ...base, reason: 'plan', countedScope: 'all' },
      }),
    ).toMatchObject({ source: PLAN_QUOTA_GATE_SOURCE.SHARED_PLAN, point: 'fleet' });
    expect(
      planQuotaGateFrom({
        code: API_ERROR_CODE.PLAN_LIMIT_REACHED,
        details: { ...base, reason: 'owner_lite', countedScope: 'all' },
      }),
    ).toMatchObject({ source: PLAN_QUOTA_GATE_SOURCE.OWNER_LITE });
  });

  it('details hỏng / mã khác ⇒ null (nơi gọi rơi về câu chung)', () => {
    expect(planQuotaGateFrom({ code: API_ERROR_CODE.PLAN_SCOPE_REQUIRED, details: {} })).toBeNull();
    expect(
      planQuotaGateFrom({
        code: API_ERROR_CODE.PLAN_LIMIT_REACHED,
        details: { vehicleType: 'car', used: '3' },
      }),
    ).toBeNull();
    expect(planQuotaGateFrom({ code: API_ERROR_CODE.NOT_FOUND })).toBeNull();
    expect(planQuotaGateFrom(null)).toBeNull();
  });
});

describe('planQuotaGateHref', () => {
  it('chưa có gói / hết suất làn ⇒ đúng làn gói, mở sẵn hộp thoại mua', () => {
    const href = planQuotaGateHref({
      kind: PLAN_QUOTA_GATE_KIND.SCOPE_REQUIRED,
      vehicleType: 'car',
    });
    expect(href).toContain('section=plan');
    expect(href).toContain(`${PLAN_LANE_PARAM}=car`);
    expect(href).toContain('purchase=1');
  });

  it('Owner Lite ⇒ luồng nâng cấp của tuyến hoa hồng, không phải trang Cửa hàng', () => {
    const href = planQuotaGateHref({
      kind: PLAN_QUOTA_GATE_KIND.LIMIT_REACHED,
      vehicleType: 'car',
      point: PLAN_QUOTA_GATE_POINT.FLEET,
      source: PLAN_QUOTA_GATE_SOURCE.OWNER_LITE,
      used: 3,
      limit: 3,
    });
    expect(href).not.toContain('/shop');
    expect(href).toContain('section=plan');
  });
});

describe('plan-lanes', () => {
  it('?lane= chỉ nhận hai làn tự mua — `all` và rác rơi về null', () => {
    expect(parsePlanLane('motorbike')).toBe('motorbike');
    expect(parsePlanLane('car')).toBe('car');
    expect(parsePlanLane('all')).toBeNull();
    expect(parsePlanLane('truck')).toBeNull();
    expect(parsePlanLane(null)).toBeNull();
    expect(planLaneHref('motorbike')).toContain(`${PLAN_LANE_PARAM}=motorbike`);
  });

  it('kỳ doanh nghiệp là kỳ phạm vi `all`', () => {
    const term = { vehicleScope: 'all' } as CurrentPlan;
    expect(enterprisePlanOf([{ vehicleScope: 'car' } as CurrentPlan, term])).toBe(term);
    expect(enterprisePlanOf([{ vehicleScope: 'car' } as CurrentPlan])).toBeNull();
  });

  it('hoá đơn chờ chọn theo phạm vi', () => {
    const car = { id: 'C', vehicleScope: 'car' } as SubscriptionInvoice;
    expect(pendingInvoiceForScope([car], 'car')).toBe(car);
    expect(pendingInvoiceForScope([car], 'motorbike')).toBeNull();
  });

  it('trần chung chỉ khi CẢ HAI loại đếm gộp; đầy chỉ với trần có số', () => {
    const q = (over: object) =>
      ({ kind: 'total', limit: 3, used: 3, countedScope: 'all', ...over }) as never;
    const quotas = (car: object, motorbike: object) =>
      ({ car: q(car), motorbike: q(motorbike) }) as MySubscription['vehicleQuotas'];
    expect(quotasShareOneCap(quotas({}, {}))).toBe(true);
    expect(quotasShareOneCap(quotas({ countedScope: 'car' }, {}))).toBe(false);
    expect(quotaIsFull(q({}))).toBe(true);
    expect(quotaIsFull(q({ kind: 'scope_required', limit: null }))).toBe(false);
    expect(quotaIsFull(q({ kind: 'unlimited', limit: null }))).toBe(false);
  });
});
