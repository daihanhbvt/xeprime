import { SERVICE_TYPE, type ServiceType } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import type { FooterKey, ServiceLabelKey } from '@/i18n/keys';

/**
 * Cấu trúc TĨNH của marketplace: thứ tự tab, thứ tự bước, cột chân trang.
 *
 * Chữ KHÔNG nằm ở đây nữa — mỗi mục mang khoá message và nơi render dịch. Nhờ vậy thứ tự và
 * đường dẫn (thứ phải giống nhau ở mọi ngôn ngữ) vẫn có đúng một nguồn, còn câu chữ thì đi
 * theo ngôn ngữ người xem.
 *
 * Nhãn dịch vụ (`Tự lái` / `Self-drive`) là TỪ VỰNG NGHIỆP VỤ dùng chung cả marketplace lẫn
 * cổng quản lý, nên nó nằm ở namespace `Domain.serviceType` — không chép lại ở đây.
 */

/** Loại dịch vụ dùng làm chip lọc nhanh; nhãn lấy từ `Domain.serviceType`. */
export const SERVICE_CHIPS: readonly ServiceType[] = [
  SERVICE_TYPE.SELF_DRIVE,
  SERVICE_TYPE.WITH_DRIVER,
  SERVICE_TYPE.LONG_TERM,
];

/**
 * Tab dịch vụ của thẻ tìm kiếm trang chủ (yêu cầu 17/08 — mô hình 3 dịch vụ).
 *
 * `labelKey`/`shortLabelKey` trỏ vào `HomeSearch.service.*`: tab desktop nói đủ ("Xe tự lái"),
 * Segmented mobile nói gọn ("Tự lái"). Key đi thẳng vào URL `serviceType` — cùng giá trị mà
 * chip lọc nhanh trên `/search` dùng, nên hai màn không bao giờ lệch nhau.
 */
export const SERVICE_TABS: ReadonlyArray<{
  key: ServiceType;
  labelKey: ServiceLabelKey;
  shortLabelKey: ServiceLabelKey;
}> = [
  { key: SERVICE_TYPE.SELF_DRIVE, labelKey: 'selfDrive', shortLabelKey: 'selfDriveShort' },
  { key: SERVICE_TYPE.WITH_DRIVER, labelKey: 'withDriver', shortLabelKey: 'withDriverShort' },
  { key: SERVICE_TYPE.LONG_TERM, labelKey: 'longTerm', shortLabelKey: 'longTermShort' },
];

/** "Thuê xe chỉ với 4 bước" — nội dung TĨNH (không phải dữ liệu nghiệp vụ), bố cục theo Figma 18:4. */
export const RENTAL_STEPS: ReadonlyArray<{ no: string; key: 'search' | 'request' | 'pickup' | 'return' }> = [
  { no: '1', key: 'search' },
  { no: '2', key: 'request' },
  { no: '3', key: 'pickup' },
  { no: '4', key: 'return' },
];

/** Cột liên kết ở chân trang — `href` trỏ route thật khi đã có, nhãn nằm ở `Marketplace.footer`. */
export const FOOTER_COLUMNS: ReadonlyArray<{
  key: string;
  titleKey: FooterKey;
  links: ReadonlyArray<{ key: FooterKey; href: string }>;
}> = [
  {
    key: 'about',
    titleKey: 'columns.about.title',
    links: [
      { key: 'columns.about.intro', href: ROUTES.HOME },
      { key: 'columns.about.blog', href: ROUTES.HOME },
      { key: 'columns.about.careers', href: ROUTES.HOME },
      { key: 'columns.about.contact', href: ROUTES.HOME },
    ],
  },
  {
    key: 'support',
    titleKey: 'columns.support.title',
    links: [
      { key: 'columns.support.helpCenter', href: ROUTES.HOME },
      { key: 'columns.support.rentalGuide', href: ROUTES.HOME },
      { key: 'columns.support.terms', href: ROUTES.HOME },
      { key: 'columns.support.privacy', href: ROUTES.HOME },
    ],
  },
  {
    key: 'hosts',
    titleKey: 'columns.hosts.title',
    links: [
      // Ý định làm chủ xe → onboarding (proxy sẽ chèn bước đăng nhập nếu cần), KHÔNG phải
      // `/manage` — vào đó khi chưa có gian hàng chỉ gặp màn "Bạn chưa có gian hàng".
      { key: 'columns.hosts.listVehicle', href: ROUTES.MANAGE.ONBOARDING },
      { key: 'columns.hosts.manageVehicles', href: ROUTES.MANAGE.VEHICLES },
      { key: 'columns.hosts.pricing', href: ROUTES.HOME },
    ],
  },
];
