import {
  EARLY_HANDOVER_GRACE_MS,
  coverageWindow,
  earliestHandoverKeepingTier,
  type IssuePolicyRequest,
} from '@xeprime/prisma';
import {
  INSURANCE_PREMIUM_BASIS,
  INSURANCE_PREMIUM_FALLBACK_REASON,
  MIC_VCX_TRIP_DEFAULT_TIERS,
  insurancePremiumTiersForYear,
  type InsuranceProductSnapshot,
} from '@xeprime/types';
import {
  derivePremiumSchedule,
  type ScheduleAsk,
} from '../src/modules/insurance/insurance-premium-schedule';

/**
 * ADR 0106 — biểu phí đồng bộ từ hãng theo năm sản xuất, và hợp đồng không bao giờ dài hơn bậc khách
 * đã trả. Hãng giả lập trả đúng biểu phí đo trên sandbox MIC ngày 18/11/2026.
 */
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const REF = '1000000000';
const BOUNDS = [2, 5, 10, 15, 30];

function micPercents(year: number): number[] {
  if (year >= 2024) return [0.011, 0.028, 0.056, 0.085, 0.17];
  if (year >= 2021) return [0.012, 0.03, 0.061, 0.092, 0.18];
  if (year >= 2018) return [0.013, 0.033, 0.066, 0.098, 0.2];
  return [0.014, 0.035, 0.071, 0.105, 0.213];
}

function micFee(year: number, hours: number, percents = micPercents): string {
  const tier = BOUNDS.findIndex((d) => hours <= d * 24);
  const percent = percents(year)[tier]!;
  return String(Math.round((Number(REF) * percent) / 100));
}

function fakeMic(
  opts: {
    rejectYearsBefore?: number;
    rejectFrom?: number;
    percents?: (year: number) => number[];
  } = {},
): ScheduleAsk {
  return ({ manufactureYear, hours }) => {
    if (
      (opts.rejectYearsBefore !== undefined && manufactureYear < opts.rejectYearsBefore) ||
      (opts.rejectFrom !== undefined && manufactureYear >= opts.rejectFrom)
    ) {
      return Promise.resolve({
        ok: false,
        reason: INSURANCE_PREMIUM_FALLBACK_REASON.REJECTED,
        message: '01 Chưa khai biểu phí',
        elapsedMs: 1,
      });
    }
    return Promise.resolve({
      ok: true,
      amount: micFee(manufactureYear, hours, opts.percents),
      elapsedMs: 1,
    });
  };
}

const base = {
  referenceValue: REF,
  knownBoundaries: BOUNDS,
  concurrency: 4,
  perCallTimeoutMs: 8_000,
  deadlineMs: 60_000,
};

describe('Dựng biểu phí từ hãng (ADR 0106 điều 1)', () => {
  it('kiểm mốc bậc, gom nhóm năm, nhóm đầu và cuối mở về hai phía - ít lượt hỏi', async () => {
    const r = await derivePremiumSchedule({
      ...base,
      newestYear: 2027,
      oldestYear: 2001,
      ask: fakeMic(),
    });
    if (!r.ok) throw new Error(r.reason);
    expect(r.tiers).toEqual([
      { maxDays: 2, percent: '0.011' },
      { maxDays: 5, percent: '0.028' },
      { maxDays: 10, percent: '0.056' },
      { maxDays: 15, percent: '0.085' },
      { maxDays: 30, percent: '0.17' },
    ]);
    expect(r.bands.map((b) => [b.yearFrom, b.yearTo])).toEqual([
      [2024, null],
      [2021, 2023],
      [2018, 2020],
      [null, 2017],
    ]);
    expect(r.bands[3]!.percents).toEqual(['0.014', '0.035', '0.071', '0.105', '0.213']);
    // Xe 455 triệu đời 2024: đúng số MIC báo cho đơn DHHFGW73 (50.050).
    const tiers = insurancePremiumTiersForYear(r.tiers, r.bands, 2024)!;
    expect(Math.round((455_000_000 * Number(tiers[0]!.percent)) / 100)).toBe(50_050);
    // 27 đời xe × 5 bậc + 30 ngày dò mốc = 166 lượt nếu hỏi hết; cách mới: 1 + 9 + 26 + 28.
    expect(r.askedCount).toBe(64);
  });

  it('gặp đời đầu tiên hãng từ chối thì dừng; nhóm cũ nhất đóng lại ở đó', async () => {
    const asked: number[] = [];
    const mic = fakeMic({ rejectYearsBefore: 2006 });
    const r = await derivePremiumSchedule({
      ...base,
      newestYear: 2027,
      oldestYear: 2001,
      ask: (input) => {
        asked.push(input.manufactureYear);
        return mic(input);
      },
    });
    if (!r.ok) throw new Error(r.reason);
    const oldest = r.bands[r.bands.length - 1]!;
    expect([oldest.yearFrom, oldest.yearTo]).toEqual([2006, 2017]);
    expect(insurancePremiumTiersForYear(r.tiers, r.bands, 2004)).toBeNull();
    // Hỏi theo lô 4 năm: lô chứa 2005 là lô cuối, không hỏi 2001.
    expect(asked).not.toContain(2001);
  });

  it('đời mới nhất chưa bán ⇒ kiểm mốc bậc trên đời bán được kế tiếp', async () => {
    const r = await derivePremiumSchedule({
      ...base,
      newestYear: 2027,
      oldestYear: 2015,
      ask: fakeMic({ rejectFrom: 2027 }),
    });
    if (!r.ok) throw new Error(r.reason);
    expect(r.tiers.map((t) => t.maxDays)).toEqual(BOUNDS);
    expect(r.bands[0]).toMatchObject({ yearFrom: 2024, yearTo: null });
  });

  it('mốc bậc đang lưu sai ⇒ dò lại 1..30 ngày và ra đúng mốc của hãng', async () => {
    const r = await derivePremiumSchedule({
      ...base,
      knownBoundaries: [3, 5, 10, 15, 30],
      newestYear: 2026,
      oldestYear: 2020,
      ask: fakeMic(),
    });
    if (!r.ok) throw new Error(r.reason);
    expect(r.tiers.map((t) => t.maxDays)).toEqual(BOUNDS);
  });

  it('hai năm biên của nhóm lệch ở bậc khác ⇒ hỏi đủ từng năm, tách đúng nhóm', async () => {
    // Bậc 30 ngày giống nhau 2021-2023, nhưng bậc 2 ngày của 2021 khác.
    const percents = (year: number) =>
      year === 2021 ? [0.0125, 0.03, 0.061, 0.092, 0.18] : micPercents(year);
    const r = await derivePremiumSchedule({
      ...base,
      newestYear: 2026,
      oldestYear: 2018,
      ask: fakeMic({ percents }),
    });
    if (!r.ok) throw new Error(r.reason);
    expect(r.bands.map((b) => [b.yearFrom, b.yearTo])).toEqual([
      [2024, null],
      [2022, 2023],
      [2021, 2021],
      [null, 2020],
    ]);
    expect(r.bands[2]!.percents[0]).toBe('0.0125');
  });

  it('một ô hỏng vì mạng ⇒ cả lượt hỏng, không trả biểu phí nửa vời', async () => {
    const ask: ScheduleAsk = (input) =>
      input.manufactureYear === 2019 && input.hours > 24 * 9
        ? Promise.resolve({
            ok: false,
            reason: INSURANCE_PREMIUM_FALLBACK_REASON.UNAVAILABLE,
            message: 'MIC tính phí lỗi HTTP 502',
            elapsedMs: 1,
          })
        : fakeMic()(input);
    const r = await derivePremiumSchedule({ ...base, newestYear: 2027, oldestYear: 2015, ask });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('2019');
  });

  it('dò mốc: phí giảm khi chuyến dài hơn ⇒ biểu phí bất thường, hỏng', async () => {
    const ask: ScheduleAsk = (input) =>
      Promise.resolve({
        ok: true,
        amount: input.hours === 4 * 24 ? '1' : micFee(input.manufactureYear, input.hours),
        elapsedMs: 1,
      });
    const r = await derivePremiumSchedule({
      ...base,
      knownBoundaries: [],
      newestYear: 2026,
      oldestYear: 2020,
      ask,
    });
    expect(r.ok).toBe(false);
  });
});

describe('Hợp đồng không dài hơn bậc khách đã trả (ADR 0106 điều 4)', () => {
  const product = {
    premiumBasis: INSURANCE_PREMIUM_BASIS.VALUE_TIER,
    premiumTiers: [...MIC_VCX_TRIP_DEFAULT_TIERS],
  } as unknown as InsuranceProductSnapshot;
  const pickupAt = new Date('2026-11-23T02:00:00.000Z'); // 09:00 VN
  const returnAt = new Date(pickupAt.getTime() + 2 * DAY); // tròn 48h ⇒ bậc ≤2 ngày

  function request(handedOverAt: Date): IssuePolicyRequest {
    return {
      idempotencyKey: 'k',
      productKind: 'vehicle_trip',
      premiumAmount: '50050',
      coverageFrom: pickupAt,
      coverageTo: returnAt,
      vehicle: { plateNumber: null, name: 'x', vehicleType: 'car' },
      customer: { name: 'A', phone: null },
      trip: { pickupAt, returnAt, handedOverAt },
      consent: null,
      product,
    } as IssuePolicyRequest;
  }

  it('giao đúng giờ: hiệu lực từ lúc giao + 5 phút', () => {
    const w = coverageWindow(request(pickupAt), pickupAt);
    expect(w.from.toISOString()).toBe('2026-11-23T02:05:00.000Z');
    expect(w.to).toEqual(returnAt);
  });

  it('giao sớm 20 phút: hiệu lực dời tới mốc vừa bậc 2 ngày, không nhảy bậc 5 ngày', () => {
    const early = new Date(pickupAt.getTime() - 20 * 60_000);
    const w = coverageWindow(request(early), early);
    expect(w.to.getTime() - w.from.getTime()).toBe(2 * DAY);
  });

  it('mốc giao sớm nhất = giờ trả − bậc − khoảng cho phép − 5 phút', () => {
    const earliest = earliestHandoverKeepingTier(product, { pickupAt, returnAt })!;
    expect(earliest.getTime()).toBe(
      returnAt.getTime() - 2 * DAY - EARLY_HANDOVER_GRACE_MS - 5 * 60_000,
    );
    // Sản phẩm theo ngày ⇒ không ràng buộc.
    expect(
      earliestHandoverKeepingTier(
        { ...product, premiumBasis: INSURANCE_PREMIUM_BASIS.DAILY },
        {
          pickupAt,
          returnAt,
        },
      ),
    ).toBeNull();
  });
});
