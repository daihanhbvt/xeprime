import sanitizeHtml from 'sanitize-html';

/** Trần độ dài HTML gửi lên — chặn ở DTO trước khi tới bộ lọc. */
export const SHOP_BIO_HTML_MAX_LENGTH = 20_000;
/** Trần chữ THUẦN (cùng con số của ô `bio` cũ — app native và thẻ chủ xe đọc cột này). */
export const SHOP_BIO_TEXT_MAX_LENGTH = 2000;

/**
 * Danh sách thẻ CHO PHÉP của giới thiệu gian hàng — đúng thanh công cụ của editor ở site partner
 * (đậm · nghiêng · gạch chân · căn lề), không hơn. Không ảnh, không link, không class/id: nội dung
 * này hiện trên trang công khai của sàn, nên mọi thứ ngoài danh sách bị gỡ ở SERVER — client chỉ
 * là một trong nhiều đường ghi (app native, gọi API thẳng).
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'em', 'u'],
  allowedAttributes: { p: ['style'] },
  allowedStyles: { p: { 'text-align': [/^(left|center|right|justify)$/] } },
  transformTags: {
    b: 'strong',
    i: 'em',
    div: 'p',
    h1: 'p',
    h2: 'p',
    h3: 'p',
  },
  disallowedTagsMode: 'discard',
};

/**
 * Lọc HTML giới thiệu gian hàng. Trả `null` khi sau lọc không còn chữ nào (editor rỗng sinh
 * `<p></p>`) — rỗng thì không lưu một vỏ HTML.
 */
export function sanitizeShopBioHtml(html: string): string | null {
  const clean = sanitizeHtml(html, OPTIONS).trim();
  return shopBioPlainText(clean) ? clean : null;
}

/**
 * Chữ THUẦN rút từ HTML ĐÃ LỌC — xuống dòng ở ranh giới đoạn, bỏ thẻ, giải các thực thể mà bộ lọc
 * sinh ra. Đây là thứ ghi vào `tenant_profiles.bio` để app native, thẻ chủ xe và mô tả SEO không
 * bao giờ thấy thẻ HTML.
 */
export function shopBioPlainText(html: string): string {
  const withBreaks = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n');
  const text = sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} });
  return decodeEntities(text)
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}
