import { describe, expect, it } from 'vitest';
import {
  isPlanSelfServe,
  isSubscriptionTermMonths,
  parsePlanInvoiceSnapshot,
  parsePlanLimits,
  parsePlanQuota,
  planSellableTerms,
  planTermPrice,
  planTermSavingPercent,
} from './plan-billing';

describe('parsePlanLimits — parser phòng thủ cho plans.limits_json', () => {
  it('NULL/undefined/kiểu lạ → hình dạng rỗng an toàn, không ném', () => {
    for (const bad of [null, undefined, 'chuỗi', 42, ['mảng']]) {
      const limits = parsePlanLimits(bad);
      expect(limits.maxVehicles).toBeNull();
      expect(limits.maxBranches).toBeNull();
      expect(limits.termPrices).toEqual([]);
      expect(limits.salesOnly).toBe(false);
      expect(limits.recommended).toBe(false);
      expect(limits.features).toEqual([]);
    }
  });

  it('đọc đủ hình dạng ADR 0041', () => {
    const limits = parsePlanLimits({
      maxVehicles: 10,
      maxBranches: 3,
      maxMembers: 5,
      termPrices: [
        { months: 12, price: '2000000' },
        { months: 1, price: '250000' },
      ],
      salesOnly: false,
      recommended: true,
      graceDays: 7,
      features: ['finance', 'members'],
    });
    expect(limits.maxVehicles).toBe(10);
    expect(limits.maxBranches).toBe(3);
    expect(limits.maxMembers).toBe(5);
    expect(limits.recommended).toBe(true);
    expect(limits.graceDays).toBe(7);
    expect(limits.features).toEqual(['finance', 'members']);
    // Bảng giá được SẮP XẾP theo kỳ hạn — màn mua vẽ thẻ theo thứ tự này.
    expect(limits.termPrices).toEqual([
      { months: 1, price: '250000' },
      { months: 12, price: '2000000' },
    ]);
  });

  /*
   * Tiền trong jsonb là CHUỖI (ADR 0007). Một `number` lọt vào là dữ liệu tay, và đọc nó ra như
   * một mức giá hợp lệ là để một con số mất chính xác đi thẳng vào hoá đơn.
   */
  it('giá dạng number bị BỎ, không ép kiểu', () => {
    const limits = parsePlanLimits({
      termPrices: [{ months: 1, price: 250000 }, { months: 3, price: '650000' }],
    });
    expect(limits.termPrices).toEqual([{ months: 3, price: '650000' }]);
  });

  /*
   * Hai giá cho cùng một kỳ hạn là dữ liệu hỏng. Để cả hai lọt ra thì bảng giá hiện hai thẻ
   * "3 tháng" cạnh nhau với hai con số khác nhau — tệ hơn là chọn sai một trong hai.
   */
  it('kỳ hạn TRÙNG chỉ giữ lần đầu; kỳ hạn/giá rác bị bỏ', () => {
    const limits = parsePlanLimits({
      termPrices: [
        { months: 3, price: '250000' },
        { months: 3, price: '999999' },
        { months: 0, price: '1' },
        { months: 6 },
        'rác',
      ],
    });
    expect(limits.termPrices).toEqual([{ months: 3, price: '250000' }]);
  });

  it('chuỗi lạ trong features bị bỏ, không lọt ra ngoài union', () => {
    const limits = parsePlanLimits({ features: ['finance', 'hack_the_planet', 42] });
    expect(limits.features).toEqual(['finance']);
  });

  it('salesOnly/recommended chỉ nhận đúng `true` — chuỗi "true" không phải cờ', () => {
    expect(parsePlanLimits({ salesOnly: 'true' }).salesOnly).toBe(false);
    expect(parsePlanLimits({ salesOnly: 1 }).salesOnly).toBe(false);
    expect(parsePlanLimits({ salesOnly: true }).salesOnly).toBe(true);
  });
});

describe('parsePlanQuota — snapshot hạn mức trên dòng thuê bao', () => {
  /*
   * Đây là phép phân biệt đắt nhất của file này: một jsonb hỏng đọc thành `{maxVehicles: null}`
   * sẽ là "KHÔNG GIỚI HẠN" — mức rộng nhất — ở đúng chỗ tốn tiền nhất. Không có snapshot thì
   * phải nói KHÔNG CÓ, để caller đi hỏi bậc gói.
   */
  it('NULL / object rác / thiếu maxVehicles → null (không có snapshot)', () => {
    for (const bad of [null, undefined, 'chuỗi', {}, { maxBranches: 3 }, { maxVehicles: 'ba' }]) {
      expect(parsePlanQuota(bad)).toBeNull();
    }
  });

  it('maxVehicles null TƯỜNG MINH = không giới hạn, và nó là một snapshot THẬT', () => {
    expect(parsePlanQuota({ maxVehicles: null, maxBranches: null, maxMembers: null })).toEqual({
      maxVehicles: null,
      maxBranches: null,
      maxMembers: null,
    });
  });

  it('đọc đủ ba trần', () => {
    expect(parsePlanQuota({ maxVehicles: 3, maxBranches: 1, maxMembers: 2 })).toEqual({
      maxVehicles: 3,
      maxBranches: 1,
      maxMembers: 2,
    });
  });
});

describe('parsePlanInvoiceSnapshot', () => {
  it('thiếu trường bắt buộc → null, KHÔNG mặc định hoá một gói 0 tháng', () => {
    expect(parsePlanInvoiceSnapshot(null)).toBeNull();
    expect(parsePlanInvoiceSnapshot({ planCode: 'x', termMonths: 3 })).toBeNull();
    expect(parsePlanInvoiceSnapshot({ planId: 'p', planCode: 'x', termMonths: 0 })).toBeNull();
  });

  it('hoá đơn mới: đọc quota và dòng `package`', () => {
    const snap = parsePlanInvoiceSnapshot({
      planId: 'P1',
      planCode: 'shop-basic',
      termMonths: 3,
      quota: { maxVehicles: 3, maxBranches: 1, maxMembers: null },
      lines: [
        { kind: 'package', quantity: 1, months: 3, unitPrice: '250000', amount: '250000' },
      ],
    });
    expect(snap?.quota).toEqual({ maxVehicles: 3, maxBranches: 1, maxMembers: null });
    expect(snap?.lines).toHaveLength(1);
  });

  /*
   * Một hoá đơn `issued` phát hành TRƯỚC ADR 0041 có thể đang chờ tiền ngay lúc deploy. Nếu
   * parser không đọc nổi `slots` cũ thì `activateFromInvoiceWithinTx` ném, và khoản tiền đó rơi
   * vào hàng khớp tay của admin — đúng ca mà migration không vá được vì tiền về SAU.
   */
  it('hoá đơn TRƯỚC ADR 0041: `slots` cũ quy về maxVehicles = car + motorbike', () => {
    const snap = parsePlanInvoiceSnapshot({
      planId: 'P1',
      planCode: 'per-vehicle',
      termMonths: 3,
      slots: { car: 5, motorbike: 2 },
      lines: [
        { kind: 'slot', vehicleType: 'car', quantity: 5, months: 3, unitPrice: '100000', amount: '1500000' },
      ],
    });
    expect(snap?.quota).toEqual({ maxVehicles: 7, maxBranches: null, maxMembers: null });
    // Dòng của mô hình cũ vẫn đọc được — chứng từ đã phát hành phải hiển thị đúng.
    expect(snap?.lines[0]?.kind).toBe('slot');
  });
});

describe('phép đọc bảng giá', () => {
  const limits = parsePlanLimits({
    maxVehicles: 3,
    termPrices: [
      { months: 1, price: '100000' },
      { months: 3, price: '250000' },
      { months: 6, price: '450000' },
      { months: 12, price: '800000' },
    ],
  });

  it('planTermPrice trả đúng giá NIÊM YẾT, kỳ không bán → null', () => {
    expect(planTermPrice(limits, 3)).toBe('250000');
    expect(planTermPrice(limits, 24)).toBeNull();
  });

  it('planSellableTerms là danh sách kỳ hạn ĐƯỢC BÁN', () => {
    expect(planSellableTerms(limits)).toEqual([1, 3, 6, 12]);
    expect(planSellableTerms(parsePlanLimits({ termPrices: [] }))).toEqual([]);
  });

  /*
   * Đúng ba con số của bảng giá pilot (ADR 0041 điều 7). Chúng phải ra 17/25/33 — nếu công thức
   * trôi thì thẻ kỳ hạn quảng cáo một mức tiết kiệm mà biểu giá không có.
   */
  it('planTermSavingPercent so với mua từng tháng', () => {
    expect(planTermSavingPercent(limits, 1)).toBe(0);
    expect(planTermSavingPercent(limits, 3)).toBe(17);
    expect(planTermSavingPercent(limits, 6)).toBe(25);
    expect(planTermSavingPercent(limits, 12)).toBe(33);
  });

  it('không bán kỳ 1 tháng ⇒ KHÔNG có mốc để so ⇒ 0%, không bịa từ kỳ ngắn nhất', () => {
    const noMonthly = parsePlanLimits({
      termPrices: [
        { months: 3, price: '250000' },
        { months: 12, price: '800000' },
      ],
    });
    expect(planTermSavingPercent(noMonthly, 12)).toBe(0);
  });

  it('kỳ dài ĐẮT hơn mua từng tháng ⇒ 0%, không hiện số âm', () => {
    const upsideDown = parsePlanLimits({
      termPrices: [
        { months: 1, price: '100000' },
        { months: 3, price: '400000' },
      ],
    });
    expect(planTermSavingPercent(upsideDown, 3)).toBe(0);
  });

  it('isPlanSelfServe: bậc tư vấn và bậc chưa khai giá đều KHÔNG tự mua được', () => {
    expect(isPlanSelfServe(limits)).toBe(true);
    expect(isPlanSelfServe(parsePlanLimits({ ...limits, salesOnly: true }))).toBe(false);
    expect(isPlanSelfServe(parsePlanLimits({ termPrices: [] }))).toBe(false);
  });

  it('chỉ 1|3|6|12 là kỳ hạn hợp lệ', () => {
    expect(isSubscriptionTermMonths(1)).toBe(true);
    expect(isSubscriptionTermMonths(12)).toBe(true);
    expect(isSubscriptionTermMonths(2)).toBe(false);
    expect(isSubscriptionTermMonths('3')).toBe(false);
  });
});
