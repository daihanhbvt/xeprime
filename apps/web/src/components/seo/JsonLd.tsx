import { serializeJsonLd } from '@/lib/seo';

/**
 * Dữ liệu có cấu trúc schema.org cho công cụ tìm kiếm. Server Component: nằm sẵn trong HTML đầu
 * tiên, không tốn JS phía client.
 *
 * `dangerouslySetInnerHTML` là cách duy nhất đặt JSON vào `<script>` mà React không thoát ký tự;
 * `serializeJsonLd` đã thoát `<` nên dữ liệu người dùng nhập không đóng được thẻ.
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />
  );
}
