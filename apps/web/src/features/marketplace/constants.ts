import { SERVICE_TYPE, type ServiceType } from '@xeprime/types';
import { LEGAL_DOC, legalPath } from '@/constants/legal';
import { ROUTES } from '@/constants/routes';
import type { FooterKey, ServiceLabelKey } from '@/i18n/keys';
import { applyFilterPatch } from './filter-params';
import type { MarketplaceFilters } from './types';

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
export const RENTAL_STEPS: ReadonlyArray<{
  no: string;
  key: 'search' | 'request' | 'pickup' | 'return';
}> = [
  { no: '1', key: 'search' },
  { no: '2', key: 'request' },
  { no: '3', key: 'pickup' },
  { no: '4', key: 'return' },
];

/**
 * Cột liên kết ở chân trang — HAI cột khai ở đây, cột thứ ba (dịch vụ) dựng từ
 * `FOOTER_SERVICE_LINKS` vì nhãn của nó đến từ một namespace khác.
 *
 * **Mọi mục ở đây phải trỏ tới một trang CÓ THẬT.** Trước 03/09/2026, 9 trong 11 mục trỏ về
 * `ROUTES.HOME` — trong đó có cả "Điều khoản dịch vụ" và "Chính sách bảo mật", tức chân trang
 * đang hứa hai văn bản mà bấm vào thì quay lại trang chủ. Mục chưa có trang (Giới thiệu, Blog,
 * Tuyển dụng, Hướng dẫn thuê xe, Bảng giá) đã được GỠ chứ không trỏ tạm: một liên kết dẫn về
 * chỗ cũ khó chịu hơn hẳn một mục không tồn tại.
 *
 * **Vì sao không còn cột "Dành cho chủ xe" (23/09/2026).** Nó chỉ có hai mục, và mục đầu
 * ("Đăng xe cho thuê") lặp đúng cái nút CTA to đùng nằm ngay phía trên trong cùng chân trang —
 * hai lời mời giống hệt nhau cách nhau 200px. Mục thứ hai ("Quản lý xe") là đường vào khu làm
 * việc, thứ mà người đã có gian hàng luôn có sẵn ở thanh điều hướng trên cùng và trong menu
 * tài khoản. Chỗ trống đó dành cho những trang thật sự cần một lối vào: giới thiệu sàn, giới
 * thiệu ứng dụng, và trung tâm trợ giúp.
 *
 * Ba cột giờ là 3 · 3 · 4 — mép dưới không còn răng cưa như bản 3/2/4.
 *
 * Nhãn nằm ở `Marketplace.footer`.
 */
export const FOOTER_COLUMNS: ReadonlyArray<{
  key: string;
  titleKey: FooterKey;
  links: ReadonlyArray<{ key: FooterKey; href: string }>;
}> = [
  {
    key: 'company',
    titleKey: 'columns.company.title',
    links: [
      { key: 'columns.company.about', href: ROUTES.ABOUT },
      { key: 'columns.company.app', href: ROUTES.APP },
      /*
       * Trung tâm hỗ trợ là trang CÔNG KHAI, không cần đăng nhập — người mắc kẹt giữa chuyến
       * thường không đăng nhập nổi. Nó ở đây chứ không phải trong thanh tiện ích dưới cùng vì
       * đây là cột trả lời "XePrime là ai và liên hệ thế nào", đúng câu hỏi dẫn người ta tới nó.
       */
      { key: 'columns.company.support', href: ROUTES.SUPPORT },
    ],
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
];

/**
 * Cột "Khám phá" ở chân trang — ba dịch vụ, mỗi mục là một BỘ LỌC CÓ THẬT trên `/search`.
 *
 * Ba mục này tồn tại vì hai lý do, và không lý do nào là "cho chân trang đầy hơn":
 *
 *  1. Chân trang là nơi duy nhất trên mọi trang công khai nói ra rằng sàn có BA dịch vụ chứ
 *     không phải một. Ai vào thẳng một trang chi tiết xe từ Google chưa bao giờ thấy tab dịch
 *     vụ của trang chủ.
 *  2. Đây là ba liên kết nội bộ ổn định trỏ vào `/search` với bộ lọc đặt sẵn — thứ mà một
 *     trang kết quả sinh từ client không tự có.
 *
 * NHÃN không khai ở đây: nó dùng lại `HomeSearch.service.*`, đúng bộ chữ mà tab tìm kiếm trang
 * chủ đang dùng. Chân trang và hero không bao giờ được gọi một dịch vụ bằng hai cái tên.
 *
 * Query string dựng bằng `applyFilterPatch` — cùng bộ serialize mà `/search` dùng để đọc ngược
 * lại. Tự nối chuỗi `?serviceType=...` ở đây là đặt một bản sao thứ hai của contract URL.
 */
export const FOOTER_SERVICE_LINKS: ReadonlyArray<{
  key: ServiceType;
  labelKey: ServiceLabelKey;
  href: string;
}> = SERVICE_TABS.map((tab) => ({
  key: tab.key,
  labelKey: tab.labelKey,
  href: searchHref({ serviceType: tab.key }),
}));

function searchHref(filters: Partial<MarketplaceFilters>): string {
  const params = new URLSearchParams();
  applyFilterPatch(params, filters);
  return `${ROUTES.SEARCH}?${params.toString()}`;
}
