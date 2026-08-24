import { describe, expect, it } from 'vitest';
import { moneyToVietnameseWords } from './money';

/**
 * Đọc tiền bằng chữ — cái ô này tồn tại để người dùng bắt lỗi thừa/thiếu số 0, nên chính tả sai
 * làm nó vô dụng. Ba quy tắc dễ sai nhất được khoá tường minh: "mốt", "lăm", "lẻ".
 */
describe('moneyToVietnameseWords', () => {
  it('số trong ảnh chụp màn hình cũ đọc đúng từng chữ', () => {
    expect(moneyToVietnameseWords('15950000')).toBe('Mười lăm triệu chín trăm năm mươi nghìn đồng');
  });

  it('hàng đơn vị 1 sau chục ≥ 2 là "mốt", không phải "một"', () => {
    expect(moneyToVietnameseWords('21')).toBe('Hai mươi mốt đồng');
    expect(moneyToVietnameseWords('11')).toBe('Mười một đồng');
  });

  it('hàng đơn vị 5 sau một chục là "lăm", không phải "năm"', () => {
    expect(moneyToVietnameseWords('15')).toBe('Mười lăm đồng');
    expect(moneyToVietnameseWords('25')).toBe('Hai mươi lăm đồng');
    expect(moneyToVietnameseWords('5')).toBe('Năm đồng');
  });

  it('chục bằng 0 mà có hàng trăm thì đọc "lẻ"', () => {
    expect(moneyToVietnameseWords('105')).toBe('Một trăm lẻ năm đồng');
    expect(moneyToVietnameseWords('1000005')).toBe('Một triệu không trăm lẻ năm đồng');
  });

  it('nhóm rỗng ở giữa không sinh ra chữ thừa', () => {
    expect(moneyToVietnameseWords('1000000')).toBe('Một triệu đồng');
    expect(moneyToVietnameseWords('1000000000')).toBe('Một tỷ đồng');
    expect(moneyToVietnameseWords('1000500')).toBe('Một triệu năm trăm đồng');
  });

  it('bỏ phần lẻ (tiền Việt không dùng hào) và xử lý số âm', () => {
    expect(moneyToVietnameseWords('100000.50')).toBe('Một trăm nghìn đồng');
    expect(moneyToVietnameseWords('-50000')).toBe('Âm năm mươi nghìn đồng');
  });

  it('rỗng / 0 / rác trả về thứ dùng được, không nổ', () => {
    expect(moneyToVietnameseWords('0')).toBe('Không đồng');
    expect(moneyToVietnameseWords('')).toBe('');
    expect(moneyToVietnameseWords(null)).toBe('');
    expect(moneyToVietnameseWords('abc')).toBe('');
  });
});
