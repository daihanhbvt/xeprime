import type { useTranslations } from 'next-intl';

/**
 * Khoá hợp lệ của MỘT namespace message.
 *
 * Dùng khi một cấu trúc dữ liệu (cây menu, danh sách tab, cột chân trang) mang khoá thay vì
 * mang chữ. Không có kiểu này thì trường đó là `string`, và một khoá gõ sai chỉ lộ ra dưới
 * dạng chính chuỗi khoá hiện trên giao diện production.
 *
 * **Cố ý KHÔNG viết dạng generic `MessageKey<'Foo.Bar'>`.** Ràng buộc của generic phải là hợp
 * của MỌI namespace lồng nhau trong 33 bó message; TypeScript dựng hợp đó rồi dừng bằng
 * `TS2590: union type that is too complex to represent`. Với một tên namespace CỤ THỂ thì
 * `useTranslations<'Foo.Bar'>` chỉ dựng đúng nhánh cần và biên dịch bình thường — nên mỗi nơi
 * dùng khai một alias cụ thể theo mẫu dưới đây.
 *
 *   type ServiceKey = KeysOf<'HomeSearch.service'>;   // ✗ không làm được, xem trên
 *   type ServiceKey = Parameters<ReturnType<typeof useTranslations<'HomeSearch.service'>>>[0];
 */
export type NavigationKey = Parameters<ReturnType<typeof useTranslations<'Navigation'>>>[0];
export type PublicNavKey = Parameters<
  ReturnType<typeof useTranslations<'Navigation.public'>>
>[0];
export type ServiceLabelKey = Parameters<
  ReturnType<typeof useTranslations<'HomeSearch.service'>>
>[0];
export type FooterKey = Parameters<
  ReturnType<typeof useTranslations<'Marketplace.footer'>>
>[0];
