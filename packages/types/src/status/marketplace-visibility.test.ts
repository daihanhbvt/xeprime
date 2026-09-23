import { describe, expect, it } from 'vitest';
import { STATUS_COLOR } from './meta';
import {
  canEnableMarketplace,
  MARKETPLACE_VISIBILITY_REASON,
  MARKETPLACE_VISIBILITY_REASON_META,
  MARKETPLACE_VISIBILITY_REASON_VALUES,
  resolveMarketplaceVisibility,
  type MarketplaceVisibilityInput,
} from './marketplace-visibility';
import { VEHICLE_PUBLIC_STATUS, VEHICLE_PUBLIC_STATUS_SUBMITTABLE } from './vehicle';

/** Xe "mọi thứ đều ổn" — mỗi test chỉ hỏng đúng một trục. */
const ok: MarketplaceVisibilityInput = {
  deletedAt: null,
  publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
  marketplaceEnabled: true,
  shopActive: true,
};

describe('resolveMarketplaceVisibility — ba trục độc lập (ADR 0048)', () => {
  it('đã duyệt + chủ xe bật + gian hàng hoạt động → hiện ngoài chợ', () => {
    expect(resolveMarketplaceVisibility(ok)).toEqual({
      visible: true,
      reason: MARKETPLACE_VISIBILITY_REASON.VISIBLE,
    });
  });

  it('chủ xe tắt công tắc → ẩn, lý do là "chủ xe tạm ẩn" chứ không phải "chưa duyệt"', () => {
    expect(resolveMarketplaceVisibility({ ...ok, marketplaceEnabled: false })).toEqual({
      visible: false,
      reason: MARKETPLACE_VISIBILITY_REASON.OWNER_PAUSED,
    });
  });

  it.each([
    VEHICLE_PUBLIC_STATUS.DRAFT,
    VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW,
    VEHICLE_PUBLIC_STATUS.NEEDS_REVISION,
    VEHICLE_PUBLIC_STATUS.REJECTED,
    VEHICLE_PUBLIC_STATUS.ARCHIVED,
  ])('chưa qua cổng duyệt (%s) → not_approved', (publicStatus) => {
    expect(resolveMarketplaceVisibility({ ...ok, publicStatus })).toEqual({
      visible: false,
      reason: MARKETPLACE_VISIBILITY_REASON.NOT_APPROVED,
    });
  });

  it('nền tảng ẩn có lý do RIÊNG, không lẫn vào "chưa duyệt"', () => {
    expect(
      resolveMarketplaceVisibility({ ...ok, publicStatus: VEHICLE_PUBLIC_STATUS.HIDDEN }),
    ).toEqual({ visible: false, reason: MARKETPLACE_VISIBILITY_REASON.PLATFORM_HIDDEN });
  });

  it('gian hàng ngừng hoạt động thắng cả hai trục kia — chủ xe bật lại cũng không hiện', () => {
    expect(resolveMarketplaceVisibility({ ...ok, shopActive: false })).toEqual({
      visible: false,
      reason: MARKETPLACE_VISIBILITY_REASON.SHOP_INACTIVE,
    });
    expect(
      resolveMarketplaceVisibility({ ...ok, shopActive: false, marketplaceEnabled: false }).reason,
    ).toBe(MARKETPLACE_VISIBILITY_REASON.SHOP_INACTIVE);
  });

  it('xoá mềm thắng tất cả', () => {
    expect(
      resolveMarketplaceVisibility({
        ...ok,
        deletedAt: new Date(),
        shopActive: false,
        marketplaceEnabled: false,
        publicStatus: VEHICLE_PUBLIC_STATUS.HIDDEN,
      }),
    ).toEqual({ visible: false, reason: MARKETPLACE_VISIBILITY_REASON.ARCHIVED });
  });

  it('nền tảng ẩn một xe mà chủ xe đang TẮT → bỏ ẩn xong vẫn không hiện (lý do đổi chủ)', () => {
    const paused = { ...ok, marketplaceEnabled: false };
    // Trong lúc bị ẩn, lý do kể ra là của nền tảng…
    expect(
      resolveMarketplaceVisibility({ ...paused, publicStatus: VEHICLE_PUBLIC_STATUS.HIDDEN })
        .reason,
    ).toBe(MARKETPLACE_VISIBILITY_REASON.PLATFORM_HIDDEN);
    // …và sau khi nền tảng bỏ ẩn, lựa chọn của chủ xe vẫn nguyên vẹn.
    expect(resolveMarketplaceVisibility(paused)).toEqual({
      visible: false,
      reason: MARKETPLACE_VISIBILITY_REASON.OWNER_PAUSED,
    });
  });
});

describe('canEnableMarketplace', () => {
  it('chỉ xe ĐÃ DUYỆT mới bật lên được', () => {
    expect(canEnableMarketplace(VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC)).toBe(true);
  });

  it.each([
    VEHICLE_PUBLIC_STATUS.DRAFT,
    VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW,
    VEHICLE_PUBLIC_STATUS.NEEDS_REVISION,
    VEHICLE_PUBLIC_STATUS.REJECTED,
    VEHICLE_PUBLIC_STATUS.HIDDEN,
    VEHICLE_PUBLIC_STATUS.ARCHIVED,
  ])('%s thì không', (status) => {
    expect(canEnableMarketplace(status)).toBe(false);
  });
});

describe('ADR 0048 điều 4 — `hidden` rời khỏi phễu tự phục vụ của chủ xe', () => {
  it('không còn gửi duyệt lại được từ trạng thái bị nền tảng ẩn', () => {
    expect(VEHICLE_PUBLIC_STATUS_SUBMITTABLE).not.toContain(VEHICLE_PUBLIC_STATUS.HIDDEN);
    expect(VEHICLE_PUBLIC_STATUS_SUBMITTABLE).toContain(VEHICLE_PUBLIC_STATUS.DRAFT);
  });
});

describe('metadata đầy đủ (ADR 0005)', () => {
  it('mọi lý do đều có nhãn và màu lấy từ palette chung', () => {
    const allowed = new Set<string>(Object.values(STATUS_COLOR));
    for (const reason of MARKETPLACE_VISIBILITY_REASON_VALUES) {
      const entry = MARKETPLACE_VISIBILITY_REASON_META[reason];
      expect(entry, `thiếu meta cho "${reason}"`).toBeDefined();
      expect(entry.label).toBeTruthy();
      expect(allowed.has(entry.color)).toBe(true);
    }
  });
});
