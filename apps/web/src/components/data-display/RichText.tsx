import { cx } from '@/lib/cx';

import styles from './RichText.module.css';

/**
 * Hiển thị văn bản giới thiệu CÓ ĐỊNH DẠNG — dùng được ở Server Component (site khách) lẫn client.
 *
 * `html` là chuỗi ĐÃ LỌC Ở SERVER (`sanitizeShopBioHtml` — chỉ p/br/strong/em/u + căn lề) trước khi
 * vào DB; nơi gọi chỉ truyền đúng trường `bioHtml` của API, không bao giờ một chuỗi người dùng vừa
 * gõ. Không có HTML thì rơi về `text` thuần, giữ xuống dòng.
 */
export function RichText({
  html,
  text,
  className,
}: {
  html?: string | null;
  text?: string | null;
  className?: string;
}) {
  if (html) {
    return (
      <div
        className={cx(styles.richText, className)}
        // An toàn: `html` là bản đã lọc theo danh sách thẻ cho phép ở API (xem docblock).
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  if (!text) return null;
  return <p className={cx(styles.richText, styles.plain, className)}>{text}</p>;
}
