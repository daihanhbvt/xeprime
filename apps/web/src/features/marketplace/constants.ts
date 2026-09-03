import { SERVICE_TYPE, type ServiceType } from '@xeprime/types';
import { LEGAL_DOC, legalPath } from '@/constants/legal';
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

/**
 * Cột liên kết ở chân trang.
 *
 * **Mọi mục ở đây phải trỏ tới một trang CÓ THẬT.** Trước 03/09/2026, 9 trong 11 mục trỏ về
 * `ROUTES.HOME` — trong đó có cả "Điều khoản dịch vụ" và "Chính sách bảo mật", tức chân trang
 * đang hứa hai văn bản mà bấm vào thì quay lại trang chủ. Mục chưa có trang (Giới thiệu, Blog,
 * Tuyển dụng, Hướng dẫn thuê xe, Bảng giá) đã được GỠ chứ không trỏ tạm: một liên kết dẫn về
 * chỗ cũ khó chịu hơn hẳn một mục không tồn tại.
 *
 * Nhãn nằm ở `Marketplace.footer`.
 */
export const FOOTER_COLUMNS: ReadonlyArray<{
  key: string;
  titleKey: FooterKey;
  links: ReadonlyArray<{ key: FooterKey; href: string }>;
}> = [
  {
    key: 'support',
    titleKey: 'columns.support.title',
    links: [{ key: 'columns.support.helpCenter', href: ROUTES.SUPPORT }],
  },
  {
    key: 'legal',
    titleKey: 'columns.legal.title',
    links: [
      { key: 'columns.legal.terms', href: legalPath.doc(LEGAL_DOC.TERMS) },
      { key: 'columns.legal.privacy', href: legalPath.doc(LEGAL_DOC.PRIVACY) },
      {
        key: 'columns.legal.marketplaceRules',
        href: legalPath.doc(LEGAL_DOC.MARKETPLACE_RULES),
      },
      { key: 'columns.legal.cancellation', href: legalPath.doc(LEGAL_DOC.CANCELLATION) },
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
    ],
  },
];
