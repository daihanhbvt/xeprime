import { describe, expect, it } from 'vitest';

import type { Plan } from './types';
import {
  PLAN_KIND,
  filterPlans,
  hasActivePlanFilters,
  headlineTerm,
  parsePlanCatalogFilters,
  planKindOf,
  summarizePlans,
  toPlanCode,
} from './plan-catalog';

function plan(over: Partial<Plan> = {}, limits: Partial<Plan['limits']> = {}): Plan {
  return {
    id: 'p1',
    code: 'shop-basic',
    name: 'Gói cơ bản',
    description: 'Cho cửa hàng nhỏ',
    billingMode: 'package',
    commissionPercent: null,
    limits: {
      maxVehicles: 3,
      maxBranches: 1,
      maxMembers: null,
      termPrices: [{ months: 1, price: '100000' }],
      salesOnly: false,
      recommended: false,
      graceDays: 7,
      features: [],
      ...limits,
    },
    currency: 'VND',
    subscriptionCount: 0,
    status: 'active',
    sortOrder: 1,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...over,
  } as Plan;
}

describe('planKindOf', () => {
  it('ba loại: tuyến hoa hồng, gói tự mua, gói bán qua tư vấn', () => {
    expect(planKindOf(plan({ billingMode: 'commission' }))).toBe(PLAN_KIND.COMMISSION);
    expect(planKindOf(plan())).toBe(PLAN_KIND.PACKAGE);
    expect(planKindOf(plan({}, { salesOnly: true, termPrices: [] }))).toBe(PLAN_KIND.SALES_ONLY);
  });
});

describe('toPlanCode', () => {
  it('chữ hoa → thường, bỏ dấu, khoảng trắng → gạch', () => {
    expect(toPlanCode('XX003')).toBe('xx003');
    expect(toPlanCode('Gói VIP 1')).toBe('goi-vip-1');
    expect(toPlanCode('Đại lý   Hà Nội')).toBe('dai-ly-ha-noi');
  });

  it('bỏ ký tự lạ và "-"/"_" ở ĐẦU, nhưng giữ gạch cuối để gõ tiếp', () => {
    expect(toPlanCode('  -_Shop@Gold!')).toBe('shopgold');
    expect(toPlanCode('shop ')).toBe('shop-');
  });

  it('cắt ở 50 ký tự', () => {
    expect(toPlanCode('a'.repeat(80))).toHaveLength(50);
  });
});

describe('parsePlanCatalogFilters', () => {
  it('đọc đủ ba tham số hợp lệ', () => {
    expect(
      parsePlanCatalogFilters(new URLSearchParams('q= cơ bản &kind=sales_only&status=archived')),
    ).toEqual({ q: 'cơ bản', kind: 'sales_only', status: 'archived' });
  });

  it('giá trị lạ trên URL rơi về "không lọc", không biến bảng thành rỗng', () => {
    const filters = parsePlanCatalogFilters(new URLSearchParams('q=%20%20&kind=foo&status=bar'));
    expect(filters).toEqual({ q: undefined, kind: undefined, status: undefined });
    expect(hasActivePlanFilters(filters)).toBe(false);
  });
});

describe('filterPlans', () => {
  const plans = [
    plan({ id: 'a', name: 'Gói cơ bản', code: 'shop-basic' }),
    plan({ id: 'b', name: 'Gói nâng cao', code: 'shop-plus', status: 'archived' }),
    plan({ id: 'c', name: 'Tuyến hoa hồng', code: 'free', billingMode: 'commission' }),
    plan({ id: 'd', name: 'Chuyên nghiệp', code: 'shop-pro', description: null }, { salesOnly: true }),
  ];
  const ids = (list: Plan[]) => list.map((p) => p.id);

  it('không lọc thì giữ nguyên thứ tự server trả', () => {
    expect(ids(filterPlans(plans, {}))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('tìm KHÔNG DẤU trên tên, mã và mô tả', () => {
    expect(ids(filterPlans(plans, { q: 'goi co ban' }))).toEqual(['a']);
    expect(ids(filterPlans(plans, { q: 'SHOP-PRO' }))).toEqual(['d']);
    expect(ids(filterPlans(plans, { q: 'cửa hàng nhỏ' }))).toEqual(['a', 'b', 'c']);
  });

  it('lọc theo loại và trạng thái cùng lúc', () => {
    expect(ids(filterPlans(plans, { kind: PLAN_KIND.PACKAGE }))).toEqual(['a', 'b']);
    expect(ids(filterPlans(plans, { kind: PLAN_KIND.PACKAGE, status: 'active' }))).toEqual(['a']);
    expect(ids(filterPlans(plans, { kind: PLAN_KIND.SALES_ONLY }))).toEqual(['d']);
  });
});

describe('summarizePlans', () => {
  it('đếm trên toàn danh mục; lượt đăng ký KHÔNG kể lượt gán tự động của tuyến hoa hồng', () => {
    expect(
      summarizePlans([
        plan({ subscriptionCount: 5 }),
        plan({ status: 'archived', subscriptionCount: 2 }),
        plan({ billingMode: 'commission', subscriptionCount: 40 }),
      ]),
    ).toEqual({ total: 3, active: 2, archived: 1, subscriptions: 7 });
  });

  it('danh mục rỗng ra toàn số 0', () => {
    expect(summarizePlans([])).toEqual({ total: 0, active: 0, archived: 0, subscriptions: 0 });
  });
});

describe('headlineTerm', () => {
  it('ưu tiên kỳ 1 tháng', () => {
    expect(
      headlineTerm(
        plan({}, {
          termPrices: [
            { months: 12, price: '800000' },
            { months: 1, price: '100000' },
          ],
        }),
      ),
    ).toEqual({ months: 1, price: '100000' });
  });

  it('không bán kỳ 1 tháng thì lấy kỳ NGẮN NHẤT kèm số tháng', () => {
    expect(
      headlineTerm(
        plan({}, {
          termPrices: [
            { months: 12, price: '800000' },
            { months: 6, price: '450000' },
          ],
        }),
      ),
    ).toEqual({ months: 6, price: '450000' });
  });

  it('chưa khai bảng giá thì null', () => {
    expect(headlineTerm(plan({}, { termPrices: [] }))).toBeNull();
  });
});
