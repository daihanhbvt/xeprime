import { describe, expect, it } from 'vitest';
import {
  FULL_MANAGE_FEATURES,
  OWNER_LITE_FEATURES,
  PLAN_FEATURE,
  PLAN_FEATURE_VALUES,
  featureState,
  FEATURE_STATE,
  type PlanFeature,
} from './status/billing';

/**
 * RANH GIỚI HAI BẬC — ADR 0027 điều 1.
 *
 * Vì sao spec này tồn tại: trước 07/09/2026 ranh giới chỉ sống trong một mảng cục bộ của
 * `prisma/src/seed/system.ts`, và mảng đó cấp ĐỦ CẢ BẢY cờ cho **cả** gói hoa hồng lẫn gói thuê
 * bao. Không test nào đỏ, vì không test nào nhìn vào dữ liệu gói — hai bậc năng lực của ADR 0027
 * không tồn tại suốt nhiều tuần trong khi guard, hook và menu đều đã đúng.
 *
 * Ở đây khoá đúng thứ đã trượt: **hai bậc phải KHÁC NHAU**, và khác nhau đúng chỗ ADR nói.
 */
describe('bậc năng lực — Owner Lite vs Full Manage (ADR 0027 điều 1)', () => {
  it('Owner Lite KHÔNG có cờ nâng cao nào — rỗng là quyết định, không phải thiếu sót', () => {
    expect(OWNER_LITE_FEATURES).toEqual([]);
  });

  it('Full Manage mở đủ 7 tính năng của cột phải trong ADR 0027 điều 1', () => {
    // So bằng TẬP đầy đủ chứ không đếm: đổi tên một cờ thì test chỉ ra ngay cờ nào lệch.
    expect([...FULL_MANAGE_FEATURES].sort()).toEqual(
      [
        PLAN_FEATURE.BRANCHES,
        PLAN_FEATURE.CONTRACTS,
        PLAN_FEATURE.DEBTS,
        PLAN_FEATURE.DRIVERS,
        PLAN_FEATURE.FINANCE,
        PLAN_FEATURE.MAINTENANCE,
        PLAN_FEATURE.MEMBERS,
      ].sort(),
    );
  });

  it('hai bậc thực sự KHÁC NHAU — đây chính là lỗi đã trượt qua một lần', () => {
    expect(FULL_MANAGE_FEATURES).not.toEqual(OWNER_LITE_FEATURES);
    expect(FULL_MANAGE_FEATURES.length).toBeGreaterThan(OWNER_LITE_FEATURES.length);
  });

  it('`escrow_hold` KHÔNG nằm trong bậc nào — ADR 0025 chưa thi công', () => {
    // Cấp cờ cho một tính năng chưa có endpoint nào là hứa một thứ không bấm được, và tạo sẵn
    // một trạng thái `read_only` không có gì để đọc.
    expect(FULL_MANAGE_FEATURES).not.toContain(PLAN_FEATURE.ESCROW_HOLD);
    expect(OWNER_LITE_FEATURES).not.toContain(PLAN_FEATURE.ESCROW_HOLD);
  });

  it('Owner Lite là TẬP CON thật sự của Full Manage — nâng cấp chỉ THÊM, không bao giờ bớt', () => {
    const full = new Set<PlanFeature>(FULL_MANAGE_FEATURES);
    for (const feature of OWNER_LITE_FEATURES) expect(full.has(feature)).toBe(true);
  });
});

/**
 * Ba hồ sơ người dùng của checklist Owner Lite, dựng thẳng từ hai hằng bậc gói.
 *
 * `featureState` đã có spec riêng ở tầng hàm thuần; ở đây kiểm nó cho ra ĐÚNG BA HỒ SƠ mà gate
 * đòi, để "Basic mới thấy gì" là một câu hỏi có câu trả lời chạy được, không phải một đoạn văn.
 */
describe('ba hồ sơ của gate Owner Lite', () => {
  const statesFor = (flags: readonly PlanFeature[], used: readonly PlanFeature[]) => {
    const has = new Set(flags);
    const usedSet = new Set(used);
    return Object.fromEntries(
      PLAN_FEATURE_VALUES.map((f) => [f, featureState(has.has(f), usedSet.has(f))]),
    ) as Record<PlanFeature, string>;
  };

  it('Basic MỚI (chưa dùng gì) ⇒ mọi tính năng nâng cao HIDDEN — sản phẩm gọn, không cụt', () => {
    const states = statesFor(OWNER_LITE_FEATURES, []);
    for (const feature of FULL_MANAGE_FEATURES) {
      expect(states[feature]).toBe(FEATURE_STATE.HIDDEN);
    }
  });

  it('Basic CÓ DỮ LIỆU CŨ ⇒ READ_ONLY, không phải hidden — không ai mất sổ của chính mình', () => {
    const states = statesFor(OWNER_LITE_FEATURES, [PLAN_FEATURE.FINANCE, PLAN_FEATURE.DEBTS]);
    expect(states[PLAN_FEATURE.FINANCE]).toBe(FEATURE_STATE.READ_ONLY);
    expect(states[PLAN_FEATURE.DEBTS]).toBe(FEATURE_STATE.READ_ONLY);
    // Tính năng chưa từng dùng vẫn hidden — `read_only` không lan sang cả bộ.
    expect(states[PLAN_FEATURE.DRIVERS]).toBe(FEATURE_STATE.HIDDEN);
  });

  it('Gói còn hiệu lực ⇒ ENABLED hết, bất kể đã dùng hay chưa', () => {
    const states = statesFor(FULL_MANAGE_FEATURES, []);
    for (const feature of FULL_MANAGE_FEATURES) {
      expect(states[feature]).toBe(FEATURE_STATE.ENABLED);
    }
  });

  it('gia hạn từ Basic có dữ liệu cũ lên gói ⇒ read_only mở lại thành enabled ngay', () => {
    // ADR 0027 điều 5: năng lực KHÔNG đóng băng (khác chế độ thu phí của ADR 0024).
    const before = statesFor(OWNER_LITE_FEATURES, [PLAN_FEATURE.FINANCE]);
    const after = statesFor(FULL_MANAGE_FEATURES, [PLAN_FEATURE.FINANCE]);
    expect(before[PLAN_FEATURE.FINANCE]).toBe(FEATURE_STATE.READ_ONLY);
    expect(after[PLAN_FEATURE.FINANCE]).toBe(FEATURE_STATE.ENABLED);
  });
});
