import { Prisma } from '@xeprime/prisma';
import { maskEmail, maskPhone } from '../src/common/mask';
import { bookingDebt } from '../src/common/money';
import { normalizePhone, phoneLookupVariants, toLocalPhone } from '../src/common/phone';

/**
 * Unit thuần (không đụng DB) cho hai helper dùng chung. Masking là ranh giới bảo mật nên các
 * biên (chuỗi ngắn, thiếu `@`, null) phải có hành vi xác định, không phải "tình cờ đúng".
 */
describe('maskPhone', () => {
  it('giữ 3 số đầu + 3 số cuối', () => {
    expect(maskPhone('0912345678')).toBe('091****678');
  });

  it('quy về dạng nội địa trước khi che — `84…` và `0…` của cùng một người hiện giống nhau', () => {
    // `users.phone` lưu `84…`, `bookings.customer_phone` lưu `0…`: không quy về một dạng thì
    // màn Khách thuê và màn Đơn thuê hiện hai chuỗi khác nhau cho cùng một số.
    expect(maskPhone('84912345678')).toBe('091****678');
    expect(maskPhone('+84912345678')).toBe('091****678');
    expect(maskPhone('84912345678')).toBe(maskPhone('0912345678'));
    // Và 3 ký tự lộ ra không được là mã quốc gia (giống hệt nhau ở mọi số → vô dụng).
    expect(maskPhone('84912345678')).not.toMatch(/^84/);
  });

  it('số ngắn chỉ lộ 2 ký tự cuối', () => {
    expect(maskPhone('123456')).toBe('****56');
    expect(maskPhone('12')).toBe('12');
  });

  it('rỗng/null → null', () => {
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone(undefined)).toBeNull();
    expect(maskPhone('   ')).toBeNull();
  });

  it('không bao giờ trả về nguyên chuỗi gốc với số thật', () => {
    const phone = '0987654321';
    expect(maskPhone(phone)).not.toBe(phone);
  });
});

describe('maskEmail', () => {
  it('giữ 2 ký tự đầu phần tên + nguyên tên miền', () => {
    expect(maskEmail('nguyenvana@gmail.com')).toBe('ng********@gmail.com');
    expect(maskEmail('ab@xeprime.vn')).toBe('ab*@xeprime.vn');
  });

  it('phần tên 1 ký tự vẫn bị che ít nhất 1 dấu sao', () => {
    expect(maskEmail('a@x.vn')).toBe('a*@x.vn');
  });

  it('chuỗi không có @ được che như chuỗi thường', () => {
    expect(maskEmail('khongphaiemail')).toBe('************il');
  });

  it('rỗng/null → null', () => {
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail('')).toBeNull();
  });
});

describe('phone', () => {
  it('normalizePhone → dạng lưu của users.phone (`84…`)', () => {
    expect(normalizePhone('0912345678')).toBe('84912345678');
    expect(normalizePhone('+84912345678')).toBe('84912345678');
    expect(normalizePhone('84912345678')).toBe('84912345678');
  });

  it('toLocalPhone → dạng hiển thị (`0…`)', () => {
    expect(toLocalPhone('84912345678')).toBe('0912345678');
    expect(toLocalPhone('+84912345678')).toBe('0912345678');
    expect(toLocalPhone('0912345678')).toBe('0912345678');
  });

  it('phoneLookupVariants phủ cả hai dạng lưu, không trùng lặp', () => {
    // Đây là điều làm ô tra cứu hoạt động: `users.phone` lưu `84…` còn
    // `bookings.customer_phone` lưu thô như shop gõ.
    const variants = phoneLookupVariants('0912345678');
    expect(variants).toContain('0912345678');
    expect(variants).toContain('84912345678');
    expect(new Set(variants).size).toBe(variants.length);

    expect(phoneLookupVariants('84912345678').sort()).toEqual(
      phoneLookupVariants('0912345678').sort(),
    );
    expect(phoneLookupVariants('  ')).toEqual([]);
  });
});

describe('bookingDebt', () => {
  it('công nợ = total − paid', () => {
    expect(bookingDebt('3000000', '1000000').toString()).toBe('2000000');
  });

  it('trả dư thì công nợ là 0, không phải số âm', () => {
    expect(bookingDebt('1000000', '1500000').toString()).toBe('0');
  });

  it('giữ chính xác phần thập phân của Decimal(14,2)', () => {
    expect(bookingDebt(new Prisma.Decimal('12345678901234.56'), '0.56').toString()).toBe(
      '12345678901234',
    );
  });
});
