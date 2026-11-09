import { sanitizeShopBioHtml, shopBioPlainText } from '../src/common/shop-bio-html';

/**
 * Giới thiệu gian hàng hiện trên trang CÔNG KHAI của sàn, nên HTML từ editor đi qua bộ lọc ở
 * server - client chỉ là một trong nhiều đường ghi (app native, gọi API thẳng).
 */
describe('sanitizeShopBioHtml', () => {
  it('giữ đúng thanh công cụ của editor: đậm, nghiêng, gạch chân, căn lề', () => {
    const html =
      '<p style="text-align: center"><strong>Đậm</strong> <em>nghiêng</em> <u>gạch</u></p>';
    expect(sanitizeShopBioHtml(html)).toBe(html.replace('text-align: center', 'text-align:center'));
  });

  it('gỡ script, link, ảnh, sự kiện và style ngoài căn lề', () => {
    const dirty =
      '<p style="color:red;text-align:right" onclick="x()">A<script>alert(1)</script>' +
      '<a href="javascript:x">B</a><img src="x" onerror="y()"></p>';
    expect(sanitizeShopBioHtml(dirty)).toBe('<p style="text-align:right">AB</p>');
  });

  it('đổi b/i sang strong/em để một ý nghĩa chỉ có một thẻ', () => {
    expect(sanitizeShopBioHtml('<p><b>x</b><i>y</i></p>')).toBe(
      '<p><strong>x</strong><em>y</em></p>',
    );
  });

  it('editor rỗng không lưu một vỏ HTML', () => {
    expect(sanitizeShopBioHtml('<p></p><p><br></p>')).toBeNull();
  });
});

describe('shopBioPlainText', () => {
  it('xuống dòng ở ranh giới đoạn và giải thực thể', () => {
    expect(shopBioPlainText('<p>Xe &amp; tài xế</p><p>Dòng<br>hai</p>')).toBe(
      'Xe & tài xế\nDòng\nhai',
    );
  });
});
