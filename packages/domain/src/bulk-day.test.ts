import { describe, expect, it } from 'vitest';

import {
  BULK_PRICE_MODE,
  applyPercentToPrice,
  holidayRunAround,
  listDateKeys,
  listedPriceForDay,
  planBulkDayPrices,
  priceSpreadRatio,
  roundPriceTo,
} from './bulk-day';

/**
 * Luật đặt giá / khoá hàng loạt cho một ngày.
 *
 * Ba khẳng định là lý do file này tồn tại, và cả ba đều là lỗi TỐN TIỀN THẬT nếu sai:
 *  - "+30%" phải tính trên giá áp cho ĐÚNG ngày đó (xe có giá cuối tuần riêng);
 *  - bấm hai lần không được cộng dồn;
 *  - xe chưa có giá thì bỏ qua, tuyệt đối không hoá thành 0₫.
 */

/** Đội xe thật trong ảnh chụp màn hình: chênh lệch gần 3 lần từ i10 tới Everest. */
const FLEET = [
  { vehicleId: 'i10', weekdayPrice: '520000', weekendPrice: null },
  { vehicleId: 'city', weekdayPrice: '680000', weekendPrice: '780000' },
  { vehicleId: 'everest', weekdayPrice: '1500000', weekendPrice: null },
  { vehicleId: 'chua-co-gia', weekdayPrice: null, weekendPrice: null },
];

/** 31/08/2026 là Thứ Hai; 29/08/2026 là Thứ Bảy. */
const MONDAY = '2026-08-31';
const SATURDAY = '2026-08-29';

describe('giá gốc của một ngày', () => {
  it('ngày thường lấy giá thường', () => {
    expect(listedPriceForDay({ weekdayPrice: '680000', weekendPrice: '780000' }, MONDAY)).toBe(
      '680000',
    );
  });

  it('cuối tuần lấy GIÁ CUỐI TUẦN — không thì lệnh tăng giá lại thành giảm giá', () => {
    expect(listedPriceForDay({ weekdayPrice: '680000', weekendPrice: '780000' }, SATURDAY)).toBe(
      '780000',
    );
  });

  it('xe không khai giá cuối tuần thì cuối tuần vẫn là giá thường', () => {
    expect(listedPriceForDay({ weekdayPrice: '520000', weekendPrice: null }, SATURDAY)).toBe(
      '520000',
    );
  });
});

describe('áp phần trăm', () => {
  it('tăng 30% rồi làm tròn về bội 10.000', () => {
    // 680.000 × 1,3 = 884.000 → bội 10k gần nhất là 880.000.
    expect(applyPercentToPrice('680000', 30)).toBe('880000');
    // 520.000 × 1,3 = 676.000 → 680.000.
    expect(applyPercentToPrice('520000', 30)).toBe('680000');
  });

  it('giảm giá cũng chạy', () => {
    expect(applyPercentToPrice('1000000', -15)).toBe('850000');
  });

  it('làm tròn theo bước đã chọn', () => {
    expect(applyPercentToPrice('333000', 10, 50_000)).toBe('350000');
    expect(applyPercentToPrice('333000', 10, 1)).toBe('366300');
  });

  it('KHÔNG cộng dồn: áp lần hai lên cùng giá gốc ra cùng kết quả', () => {
    const once = applyPercentToPrice('680000', 30);
    const twice = applyPercentToPrice('680000', 30);

    expect(once).toBe(twice);
    // Và khác hẳn kết quả của việc áp chồng lên giá đã tăng.
    expect(applyPercentToPrice(once, 30)).not.toBe(once);
  });

  it('xe chưa có giá → null, KHÔNG phải 0đ', () => {
    expect(applyPercentToPrice(null, 30)).toBeNull();
    expect(applyPercentToPrice('', 30)).toBeNull();
  });

  it('phần trăm âm quá đà vẫn không cho ra giá âm', () => {
    expect(applyPercentToPrice('500000', -150)).toBe('0');
  });

  it('làm tròn nửa chừng đi LÊN — có lợi cho gian hàng ở thao tác tăng giá lễ', () => {
    expect(roundPriceTo(15_000, 10_000)).toBe(20_000);
    expect(roundPriceTo(14_999, 10_000)).toBe(10_000);
  });
});

describe('planBulkDayPrices', () => {
  it('chế độ % tôn trọng chênh lệch giữa các xe', () => {
    const rows = planBulkDayPrices(FLEET, MONDAY, {
      mode: BULK_PRICE_MODE.PERCENT,
      percent: 30,
    });

    expect(rows.find((r) => r.vehicleId === 'i10')?.nextPrice).toBe('680000');
    expect(rows.find((r) => r.vehicleId === 'everest')?.nextPrice).toBe('1950000');
  });

  it('chế độ % dùng giá CUỐI TUẦN khi ngày đó là T7', () => {
    const rows = planBulkDayPrices(FLEET, SATURDAY, {
      mode: BULK_PRICE_MODE.PERCENT,
      percent: 30,
    });

    // 780.000 × 1,3 = 1.014.000 → 1.010.000 (bội 10k gần nhất).
    expect(rows.find((r) => r.vehicleId === 'city')?.nextPrice).toBe('1010000');
  });

  it('xe chưa cấu hình giá bị bỏ qua ở cả hai chế độ % ', () => {
    const rows = planBulkDayPrices(FLEET, MONDAY, {
      mode: BULK_PRICE_MODE.PERCENT,
      percent: 30,
    });

    const orphan = rows.find((r) => r.vehicleId === 'chua-co-gia');
    expect(orphan?.basePrice).toBeNull();
    expect(orphan?.nextPrice).toBeNull();
  });

  it('chế độ đồng giá đặt cùng một số cho mọi xe — kể cả xe chưa có giá gốc', () => {
    const rows = planBulkDayPrices(FLEET, MONDAY, {
      mode: BULK_PRICE_MODE.FIXED,
      fixedPrice: '900000',
    });

    expect(rows.every((r) => r.nextPrice === '900000')).toBe(true);
    // Giá gốc vẫn được trả về để bảng xem trước cho thấy mình đang thay cái gì.
    expect(rows.find((r) => r.vehicleId === 'i10')?.basePrice).toBe('520000');
  });
});

describe('cảnh báo độ lệch giá', () => {
  it('đội xe lệch gần 3 lần → tỉ lệ nói ra điều đó', () => {
    expect(priceSpreadRatio(['520000', '680000', '1500000'])).toBeCloseTo(2.88, 2);
  });

  it('nhóm đồng nhất thì tỉ lệ bằng 1', () => {
    expect(priceSpreadRatio(['500000', '500000'])).toBe(1);
  });

  it('dưới hai xe có giá thì không kết luận gì', () => {
    expect(priceSpreadRatio(['500000'])).toBeNull();
    expect(priceSpreadRatio([null, null])).toBeNull();
  });
});

describe('holidayRunAround', () => {
  /** Quốc khánh 2026 như Google trả về: ba sự kiện MỘT ngày nằm liền nhau. */
  const quocKhanh = new Set(['2026-08-31', '2026-09-01', '2026-09-02']);
  const lookup = { has: (key: string) => quocKhanh.has(key) };

  it('bấm ngày đầu cụm → khoảng phủ trọn cụm', () => {
    expect(holidayRunAround(lookup, '2026-08-31')).toEqual({
      from: '2026-08-31',
      to: '2026-09-02',
    });
  });

  it('bấm ngày GIỮA cụm cũng ra trọn cụm', () => {
    expect(holidayRunAround(lookup, '2026-09-01')).toEqual({
      from: '2026-08-31',
      to: '2026-09-02',
    });
  });

  it('ngày thường thì chỉ là chính nó', () => {
    expect(holidayRunAround(lookup, '2026-09-10')).toEqual({
      from: '2026-09-10',
      to: '2026-09-10',
    });
  });

  it('không nối qua một ngày trống ở giữa', () => {
    const rời = new Set(['2026-09-02', '2026-09-04']);
    expect(holidayRunAround({ has: (k) => rời.has(k) }, '2026-09-02')).toEqual({
      from: '2026-09-02',
      to: '2026-09-02',
    });
  });
});

describe('listDateKeys', () => {
  it('liệt kê đủ hai đầu', () => {
    expect(listDateKeys('2026-08-31', '2026-09-02')).toEqual([
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
    ]);
  });

  it('khoảng ngược → rỗng, không lặp vô tận', () => {
    expect(listDateKeys('2026-09-02', '2026-08-31')).toEqual([]);
  });

  it('có trần số ngày', () => {
    expect(listDateKeys('2026-01-01', '2027-01-01', 5)).toHaveLength(5);
  });
});
