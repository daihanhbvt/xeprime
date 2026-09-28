import { normalizeProvinceAlias } from '@xeprime/types';

/**
 * Canh luật tra tỉnh/thành KHÔNG DẤU.
 *
 * `LocationPicker` của app từng so chuỗi thô (`toLocaleLowerCase().includes()`), nên gõ "ho"
 * không ra "Hải Phòng" trong khi web thì có — người không gõ dấu gần như không tìm được gì.
 * Cả hai client và backend giờ dùng chung `normalizeProvinceAlias` của `@xeprime/types`.
 */
const match = (name: string, query: string) =>
  normalizeProvinceAlias(name).includes(normalizeProvinceAlias(query));

describe('tra tỉnh/thành không dấu', () => {
  it('gõ không dấu vẫn ra tỉnh có dấu', () => {
    expect(match('Hải Phòng', 'ho')).toBe(true);
    expect(match('Hồ Chí Minh', 'ho')).toBe(true);
    expect(match('Đà Nẵng', 'da nang')).toBe(true);
    expect(match('Đà Nẵng', 'Đà Nẵng')).toBe(true);
  });

  it('bỏ tiền tố hành chính ở đầu tên', () => {
    expect(match('Thành phố Hồ Chí Minh', 'ho chi minh')).toBe(true);
    expect(match('Đà Nẵng', 'TP Đà Nẵng')).toBe(true);
  });

  it('không khớp bừa', () => {
    expect(match('Hà Nội', 'da nang')).toBe(false);
    expect(match('Cần Thơ', 'hai phong')).toBe(false);
  });

  it('"Toàn quốc" cũng tìm được như một lựa chọn', () => {
    expect(match('Toàn quốc', 'toan')).toBe(true);
    expect(match('Toàn quốc', 'ha noi')).toBe(false);
  });
});
