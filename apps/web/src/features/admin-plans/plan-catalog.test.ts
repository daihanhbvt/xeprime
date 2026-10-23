import { describe, expect, it } from 'vitest';

import type { Plan } from './types';
import {
  PLAN_CATALOG_VIEW,
  PLAN_GROUP,
  PLAN_KIND,
  filterPlans,
  groupPlans,
  planGroupOf,
  planReadyToPublish,
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
    vehicleScope: 'motorbike',
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
  it('đọc đủ tham số hợp lệ; view "đã ngừng" không phải bộ lọc', () => {
    const filters = parsePlanCatalogFilters(
      new URLSearchParams('q= cơ bản &kind=sales_only&view=retired'),
    );
    expect(filters).toEqual({ q: 'cơ bản', kind: 'sales_only', view: PLAN_CATALOG_VIEW.RETIRED });
    expect(hasActivePlanFilters({ view: PLAN_CATALOG_VIEW.RETIRED })).toBe(false);
  });

  it('link cũ ?status=archived vẫn mở đúng sổ đã ngừng', () => {
    expect(parsePlanCatalogFilters(new URLSearchParams('status=archived')).view).toBe(
      PLAN_CATALOG_VIEW.RETIRED,
    );
  });

  it('giá trị lạ trên URL rơi về "không lọc", không biến bảng thành rỗng', () => {
    const filters = parsePlanCatalogFilters(new URLSearchParams('q=%20%20&kind=foo&status=bar'));
    expect(filters).toEqual({ q: undefined, kind: undefined, view: undefined });
    expect(hasActivePlanFilters(filters)).toBe(false);
  });
});

describe('filterPlans', () => {
  const plans = [
    plan({ id: 'a', name: 'Gói cơ bản', code: 'shop-basic' }),
    plan({ id: 'b', name: 'Gói nâng cao', code: 'shop-plus', status: 'archived' }),
    plan({ id: 'c', name: 'Tuyến hoa hồng', code: 'free', billingMode: 'commission' }),
    plan(
      { id: 'd', name: 'Chuyên nghiệp', code: 'shop-pro', description: null },
      { salesOnly: true },
    ),
  ];
  const ids = (list: Plan[]) => list.map((p) => p.id);

  it('mặc định là sổ ĐANG BÁN, giữ nguyên thứ tự server trả', () => {
    expect(ids(filterPlans(plans, {}))).toEqual(['a', 'c', 'd']);
  });

  it('sổ ĐÃ NGỪNG chỉ có bậc archived (vd ba bậc ADR 0041 đã nghỉ hưu)', () => {
    expect(ids(filterPlans(plans, { view: PLAN_CATALOG_VIEW.RETIRED }))).toEqual(['b']);
  });

  it('tìm KHÔNG DẤU trên tên, mã và mô tả', () => {
    expect(ids(filterPlans(plans, { q: 'goi co ban' }))).toEqual(['a']);
    expect(ids(filterPlans(plans, { q: 'SHOP-PRO' }))).toEqual(['d']);
    expect(ids(filterPlans(plans, { q: 'cửa hàng nhỏ' }))).toEqual(['a', 'c']);
  });

  it('lọc theo loại trong từng sổ', () => {
    expect(ids(filterPlans(plans, { kind: PLAN_KIND.PACKAGE }))).toEqual(['a']);
    expect(
      ids(filterPlans(plans, { kind: PLAN_KIND.PACKAGE, view: PLAN_CATALOG_VIEW.RETIRED })),
    ).toEqual(['b']);
    expect(ids(filterPlans(plans, { kind: PLAN_KIND.SALES_ONLY }))).toEqual(['d']);
  });
});

describe('sổ CHƯA MỞ BÁN (draft)', () => {
  const plans = [plan({ id: 'a' }), plan({ id: 'd', status: 'draft' })];
  it('bậc nháp chỉ ở sổ "Chưa mở bán", không lẫn vào sổ đang bán', () => {
    expect(filterPlans(plans, {}).map((p) => p.id)).toEqual(['a']);
    expect(filterPlans(plans, { view: PLAN_CATALOG_VIEW.DRAFT }).map((p) => p.id)).toEqual(['d']);
    expect(parsePlanCatalogFilters(new URLSearchParams('status=draft')).view).toBe(
      PLAN_CATALOG_VIEW.DRAFT,
    );
  });

  it('mở bán được khi có ít nhất một kỳ giá, hoặc khi là bậc tư vấn', () => {
    expect(planReadyToPublish(plan({ status: 'draft' }))).toBe(true);
    expect(planReadyToPublish(plan({ status: 'draft' }, { termPrices: [] }))).toBe(false);
    expect(planReadyToPublish(plan({}, { termPrices: [], salesOnly: true }))).toBe(true);
  });
});

describe('groupPlans — nhóm theo phạm vi loại xe (ADR 0065)', () => {
  it('bốn nhóm: xe máy → ô tô → doanh nghiệp → hoa hồng; bỏ nhóm rỗng; giữ thứ tự trong nhóm', () => {
    const rows = groupPlans([
      plan({ id: 'commission', billingMode: 'commission', vehicleScope: 'all' }),
      plan({ id: 'car-5', vehicleScope: 'car' }),
      plan({ id: 'enterprise', vehicleScope: 'all' }, { salesOnly: true }),
      plan({ id: 'moto-1' }),
      plan({ id: 'car-1', vehicleScope: 'car' }),
    ]);
    expect(rows.map((row) => [row.group, row.plans.map((p) => p.id)])).toEqual([
      [PLAN_GROUP.MOTORBIKE, ['moto-1']],
      [PLAN_GROUP.CAR, ['car-5', 'car-1']],
      [PLAN_GROUP.ENTERPRISE, ['enterprise']],
      [PLAN_GROUP.COMMISSION, ['commission']],
    ]);
    expect(groupPlans([plan({ vehicleScope: 'car' })]).map((row) => row.group)).toEqual([
      PLAN_GROUP.CAR,
    ]);
  });

  it('bậc gói phạm vi all (kể cả bậc cũ) là "doanh nghiệp"; tuyến hoa hồng luôn là nhóm riêng', () => {
    expect(planGroupOf(plan({ vehicleScope: 'all' }))).toBe(PLAN_GROUP.ENTERPRISE);
    expect(planGroupOf(plan({ billingMode: 'commission', vehicleScope: 'all' }))).toBe(
      PLAN_GROUP.COMMISSION,
    );
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
        plan(
          {},
          {
            termPrices: [
              { months: 12, price: '800000' },
              { months: 1, price: '100000' },
            ],
          },
        ),
      ),
    ).toEqual({ months: 1, price: '100000' });
  });

  it('không bán kỳ 1 tháng thì lấy kỳ NGẮN NHẤT kèm số tháng', () => {
    expect(
      headlineTerm(
        plan(
          {},
          {
            termPrices: [
              { months: 12, price: '800000' },
              { months: 6, price: '450000' },
            ],
          },
        ),
      ),
    ).toEqual({ months: 6, price: '450000' });
  });

  it('chưa khai bảng giá thì null', () => {
    expect(headlineTerm(plan({}, { termPrices: [] }))).toBeNull();
  });
});
