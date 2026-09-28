import { roundedCount } from './rounded-count';

/**
 * Con số này đi kèm chữ "+" trên thẻ gian hàng, tức là một LỜI HỨA về quy mô: "1200+" nói gian
 * hàng có ít nhất 1200 chuyến. Làm tròn LÊN ở bất kỳ bậc nào là hứa một con số chưa chắc đạt.
 */
describe('roundedCount', () => {
  it('dưới ngưỡng thì giữ nguyên, KHÔNG gắn dấu cộng', () => {
    expect(roundedCount(0)).toEqual({ display: 0, approximate: false });
    expect(roundedCount(7)).toEqual({ display: 7, approximate: false });
    expect(roundedCount(99)).toEqual({ display: 99, approximate: false });
  });

  it('đúng ngưỡng 100 thì bắt đầu làm tròn, nhưng 100 tròn sẵn nên không có dấu cộng', () => {
    expect(roundedCount(100)).toEqual({ display: 100, approximate: false });
  });

  /** Bậc theo ĐỘ LỚN (chữ số có nghĩa thứ hai): số càng lớn càng làm tròn thô. */
  it('làm tròn XUỐNG theo bậc độ lớn', () => {
    expect(roundedCount(234)).toEqual({ display: 230, approximate: true });
    expect(roundedCount(1234)).toEqual({ display: 1200, approximate: true });
    expect(roundedCount(12345)).toEqual({ display: 12000, approximate: true });
  });

  it('không bao giờ nói nhiều hơn sự thật', () => {
    for (const value of [101, 199, 555, 1001, 9999, 10001]) {
      expect(roundedCount(value).display).toBeLessThanOrEqual(value);
    }
  });

  /** Số âm là dữ liệu hỏng nhưng ĐƯỢC xử lý — kẹp về 0 chứ không in "-3 chuyến". */
  it('số âm kẹp về 0', () => {
    expect(roundedCount(-5)).toEqual({ display: 0, approximate: false });
  });

  /**
   * `NaN`/`Infinity` NGOÀI hợp đồng và hàm KHÔNG chặn chúng: `Math.max(0, NaN)` trả `NaN`, nên
   * một giá trị hỏng đi thẳng ra màn hình.
   *
   * Không sửa ở bản native, và test này khoá lại đúng hành vi đó — bản web
   * (`apps/web/src/lib/rounded-count.ts`) có y nguyên khe hở này, và để hai bản lệch nhau ở một
   * nhánh KHÔNG THỂ XẢY RA là đổi một rủi ro trôi-khỏi-nhau có thật lấy một lợi ích không có.
   *
   * Vì sao không thể xảy ra: nguồn duy nhất là `shopCompletedTripCount`, một `COUNT(*)` của
   * Postgres đi qua DTO kiểu `number`. Nó không bao giờ là `NaN`.
   *
   * ⇒ Đã ghi vào sổ đồng bộ như một khe hở của WEB cần một issue riêng, không phải việc của đợt
   * đồng bộ này.
   */
  it('KHÔNG chặn NaN/Infinity — cố ý giống hệt bản web', () => {
    expect(roundedCount(Number.NaN).display).toBeNaN();
    expect(roundedCount(Number.POSITIVE_INFINITY).display).toBe(Number.POSITIVE_INFINITY);
  });
});
