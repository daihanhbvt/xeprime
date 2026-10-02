import { tamaguiConfig } from './tamagui.config';
import { FONT_FAMILY } from './fonts';

/**
 * Font của app phải là Be Vietnam Pro — CÙNG họ chữ với web.
 *
 * Lỗi thật: cấu hình khai `defaultFont: 'body'` ở cấp NGOÀI, trong khi Tamagui v2 đọc
 * `settings.defaultFont`. Khoá đặt sai chỗ bị bỏ qua IM LẶNG — không cảnh báo, không lỗi kiểu —
 * và cả app chạy font hệ điều hành trong khi năm file `.ttf` vẫn nạp đầy đủ. Đúng loại lỗi phải
 * khoá bằng test, vì nó không làm gì đỏ lên cả.
 */
describe('tamaguiConfig', () => {
  it('`defaultFont` nằm trong `settings` — chỗ Tamagui v2 thật sự đọc', () => {
    expect(tamaguiConfig.defaultFont).toBe('body');
  });

  /**
   * `defaultFont` CHỈ quyết định thang cỡ chữ. Thứ đặt mặt chữ là `defaultProps.Text` — thiếu nó
   * thì mọi `<Text>` không có `fontFamily` và rơi về Roboto.
   */
  it('mọi `<Text>` nhận `fontFamily` mặc định', () => {
    expect(tamaguiConfig.defaultProps?.['Text']?.['fontFamily']).toBe('$body');
  });

  it('token `$body` trỏ tới đúng file font đã nạp', () => {
    expect(tamaguiConfig.fonts.body.family).toBe(FONT_FAMILY.body);
  });

  /**
   * Mỗi weight phải trỏ tới một file .ttf ĐÃ NẠP — không thì hệ điều hành tự làm giả nét đậm.
   *
   * Tamagui trải bảng `face` ra đủ chín bậc weight, nên đừng khoá SỐ LƯỢNG; thứ đáng khoá là
   * mọi giá trị đều nằm trong bộ font thật, và cả bốn mặt chữ đều được dùng tới.
   */
  it('mọi weight trỏ tới một mặt chữ CÓ THẬT, và dùng đủ bốn mặt', () => {
    const faces = Object.values(tamaguiConfig.fonts.body.face ?? {}).map((f) => f?.normal);
    expect(faces.length).toBeGreaterThan(0);

    const loaded = [
      FONT_FAMILY.body,
      FONT_FAMILY.medium,
      FONT_FAMILY.semibold,
      FONT_FAMILY.bold,
    ];
    for (const face of faces) expect(loaded).toContain(face);
    for (const font of loaded) expect(faces).toContain(font);
  });
});
