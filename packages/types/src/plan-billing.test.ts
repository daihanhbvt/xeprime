import { describe, expect, it } from 'vitest';
import {
  isSubscriptionTermMonths,
  minBasePriceMonthlyPreview,
  parsePlanAssumedGmv,
  parsePlanLimits,
  parsePlanSlots,
  subscriptionTermTotalPreview,
  termDiscountPercent,
} from './plan-billing';

describe('parsePlanLimits — parser phòng thủ cho plans.limits_json', () => {
  it('NULL/undefined/kiểu lạ → hình dạng rỗng an toàn, không ném', () => {
    for (const bad of [null, undefined, 'chuỗi', 42, ['mảng']]) {
      const limits = parsePlanLimits(bad);
      expect(limits.perVehiclePrice).toEqual({ car: null, motorbike: null });
      expect(limits.includedCars).toBe(0);
      expect(limits.maxCars).toBeNull();
      expect(limits.terms).toEqual([]);
      expect(limits.features).toEqual([]);
    }
  });

  it('đọc đúng hình dạng ADR 0015 điều 4', () => {
    const limits = parsePlanLimits({
      perVehiclePrice: { car: '100000', motorbike: '30000' },
      includedCars: 5,
      includedMotorbikes: 0,
      maxCars: 40,
      maxMotorbikes: null,
      maxMembers: 10,
      maxBranches: 4,
      terms: [
        { months: 1, discountPercent: 0 },
        { months: 12, discountPercent: 15 },
      ],
      graceDays: 7,
      features: ['finance', 'branches'],
    });
    expect(limits.perVehiclePrice.car).toBe('100000');
    expect(limits.includedCars).toBe(5);
    expect(limits.maxCars).toBe(40);
    expect(limits.maxMotorbikes).toBeNull();
    expect(limits.terms).toHaveLength(2);
    expect(limits.graceDays).toBe(7);
    expect(limits.features).toEqual(['finance', 'branches']);
  });

  it('tiền phải là CHUỖI thập phân — number/chuỗi lạ rơi về null', () => {
    const limits = parsePlanLimits({
      perVehiclePrice: { car: 100000, motorbike: 'ba mươi nghìn' },
    });
    expect(limits.perVehiclePrice).toEqual({ car: null, motorbike: null });
  });

  it('chuỗi lạ trong features bị BỎ, không lọt ra ngoài union', () => {
    const limits = parsePlanLimits({ features: ['finance', 'hack_the_planet', 42] });
    expect(limits.features).toEqual(['finance']);
  });

  it('term hỏng (months thiếu/0/âm) bị loại từng dòng, dòng lành giữ lại', () => {
    const limits = parsePlanLimits({
      terms: [{ months: 3, discountPercent: 5 }, { months: 0 }, { discountPercent: 10 }, 'rác'],
    });
    expect(limits.terms).toEqual([{ months: 3, discountPercent: 5 }]);
  });
});

describe('parsePlanSlots / parsePlanAssumedGmv', () => {
  it('slots NULL/hỏng = chưa mua chỗ nào', () => {
    expect(parsePlanSlots(null)).toEqual({ car: 0, motorbike: 0 });
    expect(parsePlanSlots({ car: '5' })).toEqual({ car: 0, motorbike: 0 });
    expect(parsePlanSlots({ car: 5, motorbike: 10 })).toEqual({ car: 5, motorbike: 10 });
  });

  it('assumed GMV thiếu một trong hai đầu vào → null (caller quyết đường đi)', () => {
    expect(parsePlanAssumedGmv(null)).toBeNull();
    expect(parsePlanAssumedGmv({ monthlyGmvPerCar: '1000000' })).toBeNull();
    expect(parsePlanAssumedGmv({ commissionPercent: 10 })).toBeNull();
    expect(parsePlanAssumedGmv({ monthlyGmvPerCar: '1000000', commissionPercent: 0 })).toBeNull();
    expect(
      parsePlanAssumedGmv({ monthlyGmvPerCar: '1000000', commissionPercent: 10 }),
    ).toEqual({ monthlyGmvPerCar: '1000000', commissionPercent: 10 });
  });
});

describe('termDiscountPercent / isSubscriptionTermMonths', () => {
  it('kỳ không khai báo trong terms = 0%', () => {
    const limits = parsePlanLimits({ terms: [{ months: 12, discountPercent: 15 }] });
    expect(termDiscountPercent(limits, 12)).toBe(15);
    expect(termDiscountPercent(limits, 3)).toBe(0);
  });

  it('chỉ 1|3|6|12 là kỳ hạn hợp lệ', () => {
    expect(isSubscriptionTermMonths(1)).toBe(true);
    expect(isSubscriptionTermMonths(12)).toBe(true);
    expect(isSubscriptionTermMonths(2)).toBe(false);
    expect(isSubscriptionTermMonths('3')).toBe(false);
  });
});

describe('phép xem trước cho form (nguồn sự thật là BillingService)', () => {
  it('minBasePriceMonthlyPreview = includedCars × c% × G; includedCars=0 → 0', () => {
    const gmv = { monthlyGmvPerCar: '1000000', commissionPercent: 10 };
    expect(minBasePriceMonthlyPreview(5, gmv)).toBe(500_000);
    expect(minBasePriceMonthlyPreview(0, gmv)).toBe(0);
  });

  it('subscriptionTermTotalPreview khớp công thức termTotal của BillingService', () => {
    const limits = parsePlanLimits({
      perVehiclePrice: { car: '100000', motorbike: null },
      includedCars: 5,
      terms: [{ months: 12, discountPercent: 10 }],
    });
    // (500k nền + 2 chỗ thêm × 100k) × 1 tháng — trùng ca test ở platform-billing.spec.
    expect(
      subscriptionTermTotalPreview('500000', limits, { car: 7, motorbike: 0 }, 1),
    ).toBe(700_000);
    // Kỳ 12 tháng ăn 10%: 700k × 12 × 0.9.
    expect(
      subscriptionTermTotalPreview('500000', limits, { car: 7, motorbike: 0 }, 12),
    ).toBe(7_560_000);
    // Mua thêm loại chỗ bậc gói không bán → null (form phải chặn trước khi gửi).
    expect(
      subscriptionTermTotalPreview('500000', limits, { car: 5, motorbike: 2 }, 1),
    ).toBeNull();
  });
});
