import { describe, expect, it } from 'vitest';

import {
  BILLING_PHASE,
  billingModeForMoney,
  isSubscriptionTrack,
  resolveEffectiveBilling,
  type EffectiveSubscriptionRow,
} from './effective-billing';
import { BILLING_MODE } from './status/billing';
import { COMMISSION_TRACK_TERM_MONTHS } from './plan-billing';

const DAY = 86_400_000;
const NOW = new Date('2026-09-15T10:00:00.000Z');

/** Dòng thuê bao như Prisma trả về, với `graceDays` seed thật (7). */
function row(overrides: {
  billingMode?: string | null;
  endsAt: Date;
  graceDays?: number;
  code?: string;
}): EffectiveSubscriptionRow {
  return {
    billingMode: overrides.billingMode === undefined ? BILLING_MODE.COMMISSION : overrides.billingMode,
    endsAt: overrides.endsAt,
    plan: {
      code: overrides.code ?? 'free',
      limitsJson: { graceDays: overrides.graceDays ?? 7 },
    },
  };
}

describe('resolveEffectiveBilling — bốn pha', () => {
  it('TRƯỚC hết hạn ⇒ current, giữ nguyên tuyến của dòng', () => {
    const billing = resolveEffectiveBilling(
      row({ billingMode: BILLING_MODE.PACKAGE, endsAt: new Date(NOW.getTime() + DAY) }),
      NOW,
    );
    expect(billing.phase).toBe(BILLING_PHASE.CURRENT);
    expect(billing.billingMode).toBe(BILLING_MODE.PACKAGE);
    expect(billing.featuresActive).toBe(true);
    expect(billing.graceEndsAt).toBeNull();
  });

  /*
   * MỐC ĐẮT NHẤT của cả đợt sửa: một giây sau `ends_at`.
   *
   * Bản cũ (`currentSubscriptionWhere` với `ends_at > now`) trả về RỖNG ở đúng giây này, và mọi
   * phép `?? PACKAGE` ở tầng dưới biến tenant thành tuyến gói 0đ — không phí dịch vụ, không cọc.
   */
  it('ĐÚNG lúc hết hạn (1 giây sau ends_at) ⇒ grace, KHÔNG rơi về package', () => {
    const endsAt = new Date(NOW.getTime() - 1_000);
    const billing = resolveEffectiveBilling(
      row({ billingMode: BILLING_MODE.COMMISSION, endsAt }),
      NOW,
    );
    expect(billing.phase).toBe(BILLING_PHASE.GRACE);
    expect(billing.billingMode).toBe(BILLING_MODE.COMMISSION);
    expect(billing.featuresActive).toBe(true);
    expect(billing.graceEndsAt).toEqual(new Date(endsAt.getTime() + 7 * DAY));
  });

  it('TRONG ân hạn của gói ⇒ vẫn là tuyến gói và vẫn còn năng lực nâng cao', () => {
    const billing = resolveEffectiveBilling(
      row({ billingMode: BILLING_MODE.PACKAGE, endsAt: new Date(NOW.getTime() - 3 * DAY) }),
      NOW,
    );
    expect(billing.phase).toBe(BILLING_PHASE.GRACE);
    expect(billing.billingMode).toBe(BILLING_MODE.PACKAGE);
    expect(isSubscriptionTrack(billing)).toBe(true);
    expect(billing.featuresActive).toBe(true);
  });

  it('SAU ân hạn của gói ⇒ hoa hồng NGAY, không chờ job vòng đời', () => {
    const billing = resolveEffectiveBilling(
      row({ billingMode: BILLING_MODE.PACKAGE, endsAt: new Date(NOW.getTime() - 8 * DAY) }),
      NOW,
    );
    expect(billing.phase).toBe(BILLING_PHASE.LAPSED);
    expect(billing.billingMode).toBe(BILLING_MODE.COMMISSION);
    expect(isSubscriptionTrack(billing)).toBe(false);
    expect(billing.featuresActive).toBe(false);
  });

  it('SAU ân hạn của dòng hoa hồng ⇒ vẫn hoa hồng (không có đường nào thành package)', () => {
    const billing = resolveEffectiveBilling(
      row({ billingMode: BILLING_MODE.COMMISSION, endsAt: new Date(NOW.getTime() - 30 * DAY) }),
      NOW,
    );
    expect(billing.phase).toBe(BILLING_PHASE.LAPSED);
    expect(billing.billingMode).toBe(BILLING_MODE.COMMISSION);
  });

  it('graceDays = 0 ⇒ hết hạn là lapsed ngay, không có cửa sổ nào', () => {
    const billing = resolveEffectiveBilling(
      row({
        billingMode: BILLING_MODE.PACKAGE,
        endsAt: new Date(NOW.getTime() - 1_000),
        graceDays: 0,
      }),
      NOW,
    );
    expect(billing.phase).toBe(BILLING_PHASE.LAPSED);
    expect(billing.billingMode).toBe(BILLING_MODE.COMMISSION);
  });
});

describe('resolveEffectiveBilling — lỗi cấu hình KHÔNG được đoán thành một tuyến', () => {
  it('không có dòng nào ⇒ unconfigured, billingMode null', () => {
    for (const input of [null, undefined]) {
      const billing = resolveEffectiveBilling(input, NOW);
      expect(billing.phase).toBe(BILLING_PHASE.UNCONFIGURED);
      expect(billing.billingMode).toBeNull();
      expect(billingModeForMoney(billing)).toBeNull();
      expect(billing.featuresActive).toBe(false);
    }
  });

  it('dòng thiếu/hỏng billing_mode ⇒ unconfigured, KHÔNG phải package', () => {
    for (const mode of [null, '', 'gói_vip', 'COMMISSION']) {
      const billing = resolveEffectiveBilling(
        row({ billingMode: mode, endsAt: new Date(NOW.getTime() + DAY) }),
        NOW,
      );
      expect(billing.phase).toBe(BILLING_PHASE.UNCONFIGURED);
      expect(billing.billingMode).toBeNull();
    }
  });

  it('unconfigured KHÔNG phải tuyến gói — nếu ngược lại thì lỗi cấu hình thành booking 0đ phí', () => {
    const billing = resolveEffectiveBilling(null, NOW);
    expect(isSubscriptionTrack(billing)).toBe(false);
    expect(billing.billingMode).not.toBe(BILLING_MODE.PACKAGE);
  });

  it('limits_json hỏng ⇒ graceDays = 0, không ném', () => {
    for (const limits of [null, 'rác', 42, { graceDays: 'bảy' }]) {
      const billing = resolveEffectiveBilling(
        {
          billingMode: BILLING_MODE.PACKAGE,
          endsAt: new Date(NOW.getTime() - 1_000),
          plan: { code: 'x', limitsJson: limits },
        },
        NOW,
      );
      expect(billing.phase).toBe(BILLING_PHASE.LAPSED);
    }
  });
});

describe('kỳ hoa hồng 12 tháng — cửa sổ F1 không còn tồn tại ở tầng đọc', () => {
  /*
   * Dựng lại đúng kịch bản của migration backfill 30/08/2026: mọi tenant nhận một dòng hoa hồng
   * 0đ kỳ `COMMISSION_TRACK_TERM_MONTHS`. Mười hai tháng sau, tất cả cùng hết hạn trong một ngày.
   */
  it('mỗi ngày trong 10 ngày sau khi kỳ 12 tháng hết ⇒ KHÔNG ngày nào ra tuyến gói', () => {
    expect(COMMISSION_TRACK_TERM_MONTHS).toBe(12);
    const endsAt = new Date('2027-08-30T00:00:00.000Z');
    const sub = row({ billingMode: BILLING_MODE.COMMISSION, endsAt, graceDays: 7 });

    for (let day = 0; day <= 10; day += 1) {
      const at = new Date(endsAt.getTime() + day * DAY + 60_000);
      const billing = resolveEffectiveBilling(sub, at);
      expect(billing.billingMode).toBe(BILLING_MODE.COMMISSION);
      expect(isSubscriptionTrack(billing)).toBe(false);
    }
  });
});
