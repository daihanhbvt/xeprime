import { describe, expect, it } from 'vitest';
import {
  absoluteMoney,
  compactMoneyParts,
  formatMoneyVnd,
  isNegativeMoney,
  isZeroMoney,
  subtractMoney,
  wholeUnits,
  type MoneySeparators,
} from './money';

/**
 * Số học tiền tệ — bất biến của ADR 0007: **không đi qua `number`**.
 *
 * Trước khi module này thành package dùng chung, chỉ `moneyToVietnameseWords` có test. Phần còn
 * lại không được kiểm ở đâu, mà nó mới là phần dễ sai âm thầm: `Number('12345678901234.56')` mất
 * chính xác, và một phép cộng float sai 0,01 đồng chỉ lộ ra ở bảng đối soát cuối tháng.
 *
 * Giờ hai app (web + native) cùng gọi những hàm này, nên một lỗi ở đây sai ở CẢ HAI client và
 * lệch với con số backend tính. Các case dưới đây khoá đúng chỗ float sẽ hỏng.
 */
const VI: MoneySeparators = { group: '.', decimal: ',' };
const EN: MoneySeparators = { group: ',', decimal: '.' };

describe('subtractMoney — số nguyên xu, không float', () => {
  it('trừ số thường', () => {
    expect(subtractMoney('12750000', '3200000')).toBe('9550000');
  });

  it('kết quả âm giữ dấu', () => {
    expect(subtractMoney('1000000', '1500000')).toBe('-500000');
  });

  it('phần lẻ hai chữ số không bị làm tròn sai', () => {
    // 0.1 + 0.2 !== 0.3 trong float; ở đây là phép trừ trên bigint nên chính xác tuyệt đối.
    expect(subtractMoney('0.30', '0.10')).toBe('0.20');
    expect(subtractMoney('10.01', '0.02')).toBe('9.99');
  });

  it('số vượt Number.MAX_SAFE_INTEGER vẫn đúng từng chữ số', () => {
    // 9.007.199.254.740.993 > 2^53 — `Number` sẽ nuốt mất chữ số cuối.
    expect(subtractMoney('9007199254740993', '1')).toBe('9007199254740992');
  });

  it('null/rỗng coi như 0, không nuốt cả kết quả', () => {
    expect(subtractMoney('500000', null)).toBe('500000');
    expect(subtractMoney(null, '500000')).toBe('-500000');
    expect(subtractMoney('', '')).toBe('0');
  });
});

describe('isNegativeMoney · absoluteMoney · isZeroMoney · wholeUnits', () => {
  it('nhận đúng số âm', () => {
    expect(isNegativeMoney('-1')).toBe(true);
    expect(isNegativeMoney('-0.01')).toBe(true);
    expect(isNegativeMoney('0')).toBe(false);
    expect(isNegativeMoney(null)).toBe(false);
  });

  it('trị tuyệt đối bỏ dấu, giữ null cho giá trị vắng', () => {
    expect(absoluteMoney('-500000')).toBe('500000');
    expect(absoluteMoney('500000')).toBe('500000');
    expect(absoluteMoney(null)).toBeNull();
    expect(absoluteMoney('')).toBeNull();
  });

  it('số 0 nhận diện trên CHUỖI, kể cả các dạng viết khác nhau', () => {
    for (const zero of ['0', '0.00', '-0', '-0.0', '00', '', null, undefined]) {
      expect(isZeroMoney(zero)).toBe(true);
    }
    expect(isZeroMoney('0.01')).toBe(false);
    expect(isZeroMoney('-0.01')).toBe(false);
  });

  it('wholeUnits cắt phần lẻ, không làm tròn lên', () => {
    expect(wholeUnits('1999.99')).toBe('1999');
    expect(wholeUnits('-1999.99')).toBe('-1999');
  });
});

describe('formatMoneyVnd — chèn dấu, KHÔNG đổi giá trị', () => {
  it('nhóm ba chữ số theo ngôn ngữ', () => {
    expect(formatMoneyVnd('12750000', VI, '—')).toBe('12.750.000 ₫');
    expect(formatMoneyVnd('12750000', EN, '—')).toBe('12,750,000 ₫');
  });

  it('phần lẻ bằng 0 thì không hiện', () => {
    expect(formatMoneyVnd('500000.00', VI, '—')).toBe('500.000 ₫');
  });

  it('phần lẻ khác 0 thì giữ, theo dấu thập phân của ngôn ngữ', () => {
    expect(formatMoneyVnd('1234.50', VI, '—')).toBe('1.234,50 ₫');
    expect(formatMoneyVnd('1234.50', EN, '—')).toBe('1,234.50 ₫');
  });

  it('giá trị vắng dùng placeholder do nơi gọi truyền vào', () => {
    expect(formatMoneyVnd(null, VI, 'Chưa có')).toBe('Chưa có');
    expect(formatMoneyVnd('', VI, '—')).toBe('—');
  });

  it('số dài hơn 2^53 in ra nguyên vẹn từng chữ số', () => {
    expect(formatMoneyVnd('9007199254740993', VI, '—')).toBe('9.007.199.254.740.993 ₫');
  });
});

describe('compactMoneyParts — rút gọn cho chỗ hẹp', () => {
  it('chọn đúng bậc theo ngưỡng nghìn/triệu/tỷ', () => {
    expect(compactMoneyParts('12750000', VI)).toEqual({ value: '12,7', unit: 'million' });
    expect(compactMoneyParts('2500000000', VI)).toEqual({ value: '2,5', unit: 'billion' });
    expect(compactMoneyParts('12500', VI)).toEqual({ value: '12,5', unit: 'thousand' });
  });

  it('bỏ phần thập phân khi số đã ≥ 100 (chỗ hẹp, thêm chữ số là tràn)', () => {
    expect(compactMoneyParts('123400000', VI)).toEqual({ value: '123', unit: 'million' });
  });

  it('phần mười bằng 0 thì không hiện dấu thập phân', () => {
    expect(compactMoneyParts('12000000', VI)).toEqual({ value: '12', unit: 'million' });
  });

  it('dấu thập phân theo ngôn ngữ', () => {
    expect(compactMoneyParts('12750000', EN)).toEqual({ value: '12.7', unit: 'million' });
  });

  it('giữ dấu âm', () => {
    expect(compactMoneyParts('-12750000', VI)).toEqual({ value: '-12,7', unit: 'million' });
  });

  it('quá nhỏ để rút gọn ⇒ null, nơi gọi hiện dạng đầy đủ', () => {
    expect(compactMoneyParts('999', VI)).toBeNull();
    expect(compactMoneyParts('0', VI)).toBeNull();
  });
});
