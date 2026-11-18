import { Prisma } from '@xeprime/prisma';
import {
  INSURANCE_PREMIUM_FALLBACK_REASON,
  INSURANCE_VALUE_TIER_LIMITS,
  insurancePremiumTiersProblem,
  type InsurancePremiumTier,
  type InsurancePremiumYearBand,
} from '@xeprime/types';
import type { PartnerPremiumAnswer } from './insurance-premium-quote.service';

/**
 * Dựng biểu phí ĐẦY ĐỦ từ API tính phí của hãng (ADR 0106 điều 1) — mốc ngày của các bậc và % của
 * từng nhóm năm sản xuất — với ÍT lượt hỏi nhất có thể (~50-60 lượt thay vì hỏi mọi năm × mọi bậc).
 * Hàm thuần: nhận `ask` (một lượt hỏi hãng) để test không cần mạng.
 *
 *  1. Đời xe mới nhất hãng bán: hỏi phí 1 ngày từ năm mới nhất lùi dần.
 *  2. Mốc bậc trên đời đó: KIỂM mốc đang có — hỏi ngày đầu và ngày cuối của mỗi bậc (phí phải bằng
 *     nhau trong bậc và tăng khi sang bậc kế). Chỉ khi không khớp mới dò cả 1..30 ngày.
 *  3. Mỗi năm sản xuất chỉ hỏi MỘT bậc (bậc dài nhất - % lớn nhất nên phân biệt rõ nhất) để chia nhóm
 *     năm. Gặp năm hãng từ chối thì dừng: các đời cũ hơn cũng không bán.
 *  4. Mỗi nhóm hỏi đủ mọi bậc ở HAI năm biên. Hai biên khớp nhau ⇒ cả nhóm cùng biểu phí (phí không
 *     giảm khi xe cũ đi, nên năm ở giữa nằm giữa hai biên). Lệch ⇒ hỏi đủ từng năm của nhóm đó.
 *
 * Mọi lượt hỏi dùng thời lượng NGÀY TRÒN (`ngày × 24 giờ`): đúng cách mốc bậc được định nghĩa ở bước 2,
 * và cho phép dùng lại câu trả lời giữa các bước (bộ nhớ đệm theo năm + số giờ).
 *
 * MỘT ô hỏng vì mạng/hết giờ, hay số không hợp lệ ⇒ cả lượt hỏng: một biểu phí nửa vời không được
 * thay biểu phí đang chạy.
 */

const DAY_HOURS = 24;

export type ScheduleAsk = (input: {
  manufactureYear: number;
  hours: number;
  timeoutMs: number;
}) => Promise<PartnerPremiumAnswer>;

export type DerivedSchedule =
  | {
      ok: true;
      tiers: InsurancePremiumTier[];
      bands: InsurancePremiumYearBand[];
      askedCount: number;
    }
  | { ok: false; reason: string; askedCount: number };

/** Lỗi dừng cả lượt — mang lý do hiện cho admin. */
class ScheduleFailure extends Error {}

export async function derivePremiumSchedule(input: {
  /** Giá trị xe mẫu (đồng) — lớn để % chính xác: 1 tỷ ⇒ 1đ = 0,0000001%. */
  referenceValue: string;
  /** Năm mới nhất cần hỏi (thường năm nay + 1). */
  newestYear: number;
  /** Năm cũ nhất cần hỏi. */
  oldestYear: number;
  /** Mốc ngày của các bậc đang cấu hình — để KIỂM thay vì dò lại 30 ngày. Rỗng ⇒ dò. */
  knownBoundaries: readonly number[];
  ask: ScheduleAsk;
  concurrency: number;
  perCallTimeoutMs: number;
  deadlineMs: number;
  now?: () => number;
}): Promise<DerivedSchedule> {
  const now = input.now ?? Date.now;
  const deadline = now() + input.deadlineMs;
  let askedCount = 0;
  const cache = new Map<string, Promise<PartnerPremiumAnswer>>();

  const askRaw = (manufactureYear: number, days: number): Promise<PartnerPremiumAnswer> => {
    const key = `${manufactureYear}:${days}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const remaining = deadline - now();
    const answer: Promise<PartnerPremiumAnswer> =
      remaining <= 0
        ? Promise.resolve({
            ok: false,
            reason: INSURANCE_PREMIUM_FALLBACK_REASON.TIMEOUT,
            message: 'Hết thời gian của lượt đồng bộ',
            elapsedMs: 0,
          })
        : (() => {
            askedCount += 1;
            return input.ask({
              manufactureYear,
              hours: days * DAY_HOURS,
              timeoutMs: Math.min(input.perCallTimeoutMs, remaining),
            });
          })();
    cache.set(key, answer);
    return answer;
  };

  /** Phí (đồng) của (năm, số ngày); hãng từ chối hay lỗi ⇒ dừng cả lượt. */
  const fee = async (year: number, days: number): Promise<bigint> => {
    const answer = await askRaw(year, days);
    if (!answer.ok) throw new ScheduleFailure(`Năm ${year}, ${days} ngày: ${describe(answer)}`);
    return BigInt(answer.amount);
  };

  try {
    // ── 1. Đời xe mới nhất mà hãng bán ─────────────────────────────────────────
    const boundaryYear = await findSellableYear(input.newestYear, input.oldestYear, askRaw);
    if (boundaryYear === null) {
      throw new ScheduleFailure('Hãng không bán cho đời xe nào trong khoảng năm');
    }

    // ── 2. Mốc bậc ─────────────────────────────────────────────────────────────
    const boundaries =
      (await verifyBoundaries(input.knownBoundaries, boundaryYear, fee, input.concurrency)) ??
      (await scanBoundaries(boundaryYear, fee, input.concurrency));
    if (boundaries.length > INSURANCE_VALUE_TIER_LIMITS.maxTiers) {
      throw new ScheduleFailure(
        `Hãng có ${boundaries.length} bậc - quá ${INSURANCE_VALUE_TIER_LIMITS.maxTiers} bậc`,
      );
    }
    const probeDays = boundaries[boundaries.length - 1]!;

    // ── 3. Mỗi năm một bậc ─────────────────────────────────────────────────────
    const sold = await probeYears(
      boundaryYear,
      input.oldestYear,
      probeDays,
      askRaw,
      input.concurrency,
    );
    if (sold.years.length === 0) {
      throw new ScheduleFailure(`Năm ${boundaryYear}: hãng từ chối chuyến ${probeDays} ngày`);
    }

    // ── 4. Gom nhóm theo bậc mẫu, kiểm hai biên của mỗi nhóm ─────────────────
    const percentsOf = async (year: number): Promise<string[]> => {
      const fees = await pool(boundaries, input.concurrency, (days) => fee(year, days));
      const percents = fees.map((f) => percentOf(f, input.referenceValue));
      const problem = insurancePremiumTiersProblem(
        boundaries.map((days, i) => ({ maxDays: days, percent: percents[i]! })),
      );
      if (problem) {
        throw new ScheduleFailure(`Năm ${year}: biểu phí của hãng không hợp lệ (${problem})`);
      }
      return percents;
    };

    const bands: InsurancePremiumYearBand[] = [];
    for (const group of groupConsecutive(sold.years, (y) => sold.probe.get(y)!)) {
      const newest = group[0]!;
      const oldest = group[group.length - 1]!;
      const top = await percentsOf(newest);
      const bottom = oldest === newest ? top : await percentsOf(oldest);
      if (sameList(top, bottom)) {
        pushBand(bands, { yearFrom: oldest, yearTo: newest, percents: top });
        continue;
      }
      // Hai biên lệch: hỏi đủ từng năm của nhóm rồi gom lại theo cả bộ %.
      const rows = await pool(group, 1, async (year) => ({
        year,
        percents: await percentsOf(year),
      }));
      for (const row of rows) {
        pushBand(bands, { yearFrom: row.year, yearTo: row.year, percents: row.percents });
      }
    }

    bands[0]!.yearTo = null;
    const last = bands[bands.length - 1]!;
    if (!sold.stoppedByRejection && last.yearFrom === input.oldestYear) last.yearFrom = null;

    // Biểu phí chung = nhóm của đời xe mới nhất hãng bán (nơi kiểm mốc bậc).
    const tiers = boundaries.map((days, i) => ({ maxDays: days, percent: bands[0]!.percents[i]! }));
    return { ok: true, tiers, bands, askedCount };
  } catch (err) {
    if (err instanceof ScheduleFailure) return { ok: false, reason: err.message, askedCount };
    throw err;
  }
}

/**
 * Kiểm mốc bậc đang có: ngày đầu và ngày cuối của mỗi bậc cùng phí, sang bậc kế thì phí tăng. Mốc
 * không hợp lệ (rỗng, không kết thúc ở 30 ngày) hay hãng trả khác ⇒ `null` để dò lại.
 */
async function verifyBoundaries(
  known: readonly number[],
  year: number,
  fee: (year: number, days: number) => Promise<bigint>,
  concurrency: number,
): Promise<number[] | null> {
  const maxDays = INSURANCE_VALUE_TIER_LIMITS.maxDays;
  const ok =
    known.length > 0 &&
    known[known.length - 1] === maxDays &&
    known.every((d, i) => Number.isInteger(d) && d >= 1 && (i === 0 || d > known[i - 1]!));
  if (!ok) return null;
  const starts = known.map((_, i) => (i === 0 ? 1 : known[i - 1]! + 1));
  const days = [...new Set([...starts, ...known])].sort((a, b) => a - b);
  const fees = new Map<number, bigint>();
  const answers = await pool(days, concurrency, (d) => fee(year, d));
  days.forEach((d, i) => fees.set(d, answers[i]!));
  for (const [i, end] of known.entries()) {
    if (fees.get(starts[i]!) !== fees.get(end)) return null;
    if (i > 0 && !(fees.get(known[i - 1]!)! < fees.get(starts[i]!)!)) return null;
  }
  return [...known];
}

/** Dò mốc bậc: hỏi 1..30 ngày tròn — phí đổi ở đâu thì bậc kết thúc ở đó. */
async function scanBoundaries(
  year: number,
  fee: (year: number, days: number) => Promise<bigint>,
  concurrency: number,
): Promise<number[]> {
  const maxDays = INSURANCE_VALUE_TIER_LIMITS.maxDays;
  const amounts = await pool(
    Array.from({ length: maxDays }, (_, i) => i + 1),
    concurrency,
    (days) => fee(year, days),
  );
  for (let d = 1; d < amounts.length; d += 1) {
    if (amounts[d]! < amounts[d - 1]!) {
      throw new ScheduleFailure(
        `Phí ${d + 1} ngày thấp hơn phí ${d} ngày - biểu phí của hãng bất thường`,
      );
    }
  }
  const boundaries: number[] = [];
  for (let d = 1; d <= maxDays; d += 1) {
    if (d === maxDays || amounts[d]! !== amounts[d - 1]!) boundaries.push(d);
  }
  return boundaries;
}

/**
 * Hỏi bậc mẫu cho từng năm từ `newest` lùi về `oldest`, theo lô `concurrency` năm. Năm đầu tiên hãng
 * từ chối ⇒ dừng: hãng giới hạn tuổi xe, đời cũ hơn cũng không bán (nhóm cũ nhất đóng lại ở đó).
 */
async function probeYears(
  newest: number,
  oldest: number,
  probeDays: number,
  ask: (year: number, days: number) => Promise<PartnerPremiumAnswer>,
  concurrency: number,
): Promise<{ years: number[]; probe: Map<number, string>; stoppedByRejection: boolean }> {
  const years: number[] = [];
  const probe = new Map<number, string>();
  for (let start = newest; start >= oldest; start -= concurrency) {
    const batch: number[] = [];
    for (let y = start; y > start - concurrency && y >= oldest; y -= 1) batch.push(y);
    const answers = await Promise.all(batch.map((y) => ask(y, probeDays)));
    for (const [i, year] of batch.entries()) {
      const answer = answers[i]!;
      if (!answer.ok) {
        if (answer.reason === INSURANCE_PREMIUM_FALLBACK_REASON.REJECTED) {
          return { years, probe, stoppedByRejection: true };
        }
        throw new ScheduleFailure(`Năm ${year}, ${probeDays} ngày: ${describe(answer)}`);
      }
      years.push(year);
      probe.set(year, answer.amount);
    }
  }
  return { years, probe, stoppedByRejection: false };
}

/** Đời xe mới nhất (từ `newest` lùi về `oldest`) mà hãng chịu báo phí 1 ngày. */
async function findSellableYear(
  newest: number,
  oldest: number,
  ask: (year: number, days: number) => Promise<PartnerPremiumAnswer>,
): Promise<number | null> {
  for (let year = newest; year >= oldest; year -= 1) {
    const answer = await ask(year, 1);
    if (answer.ok) return year;
    if (answer.reason !== INSURANCE_PREMIUM_FALLBACK_REASON.REJECTED) {
      throw new ScheduleFailure(`Năm ${year}: ${describe(answer)}`);
    }
  }
  return null;
}

/** Nối nhóm năm liền nhau cùng bộ % (nhóm kiểm riêng có thể trùng % với nhóm kề). */
function pushBand(bands: InsurancePremiumYearBand[], band: InsurancePremiumYearBand): void {
  const last = bands[bands.length - 1];
  if (last && last.yearFrom === band.yearTo! + 1 && sameList(last.percents, band.percents)) {
    last.yearFrom = band.yearFrom;
    return;
  }
  bands.push({ ...band, percents: [...band.percents] });
}

/** Chia dãy năm (mới → cũ, liền nhau) thành các đoạn cùng khoá. */
function groupConsecutive(years: readonly number[], key: (year: number) => string): number[][] {
  const groups: number[][] = [];
  for (const year of years) {
    const last = groups[groups.length - 1];
    if (last && key(last[last.length - 1]!) === key(year)) last.push(year);
    else groups.push([year]);
  }
  return groups;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** % = phí × 100 ÷ giá trị xe, 4 chữ số lẻ (đúng độ chính xác của biểu phí bậc). */
function percentOf(amount: bigint, referenceValue: string): string {
  return new Prisma.Decimal(amount.toString())
    .times(100)
    .dividedBy(referenceValue)
    .toDecimalPlaces(INSURANCE_VALUE_TIER_LIMITS.percentDecimals)
    .toString();
}

function describe(answer: Extract<PartnerPremiumAnswer, { ok: false }>): string {
  return `${answer.reason} - ${answer.message}`.slice(0, 200);
}

/** Chạy `fn` cho từng phần tử, tối đa `concurrency` lượt cùng lúc; giữ đúng thứ tự kết quả. */
async function pool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, worker),
  );
  return results;
}
