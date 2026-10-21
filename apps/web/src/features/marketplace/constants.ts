import {
  SERVICE_TYPE,
  TRANSMISSION_TYPE_EXT,
  VEHICLE_TYPE,
  type ServiceType,
  type TransmissionTypeExt,
  type VehicleType,
} from '@xeprime/types';
import { LEGAL_DOC, legalPath } from '@/constants/legal';
import { ROUTES } from '@/constants/routes';
import type { FooterKey, ServiceLabelKey } from '@/i18n/keys';
import { marketplaceSearchHref } from './filter-params';

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
    titleKey: 'columns.company.heading',
    links: [
      { key: 'columns.company.aboutShort', href: ROUTES.ABOUT },
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
      // Nhãn ngắn của design v2 ("Chính sách huỷ & hoàn tiền") — cột hẹp, không xuống dòng.
      { key: 'columns.legal.cancellationShort', href: legalPath.doc(LEGAL_DOC.CANCELLATION) },
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
 * Query string dựng bằng `marketplaceSearchHref` — cùng bộ serialize (`applyFilterPatch`) mà `/search` dùng để đọc ngược
 * lại. Tự nối chuỗi `?serviceType=...` ở đây là đặt một bản sao thứ hai của contract URL.
 */
export const FOOTER_SERVICE_LINKS: ReadonlyArray<{
  key: ServiceType;
  labelKey: ServiceLabelKey;
  href: string;
}> = SERVICE_TABS.map((tab) => ({
  key: tab.key,
  labelKey: tab.labelKey,
  href: marketplaceSearchHref({ serviceType: tab.key }),
}));

/**
 * Mốc giá / ngày cho lối tắt "Mức giá" — một bảng cho CẢ viên lọc nhanh lẫn panel Bộ lọc, nên
 * hai chỗ trên cùng một trang không bao giờ đưa ra hai bộ mốc khác nhau.
 *
 * Theo LOẠI XE vì hai mặt bằng giá cách nhau một bậc: "dưới 800k" là lựa chọn rẻ của ô tô nhưng
 * gồm gần như mọi xe máy. Mốc là số NGUYÊN VND đi thẳng vào `priceMin`/`priceMax` của URL; chữ
 * hiển thị dựng lúc render bằng `moneyCompact` theo ngôn ngữ — không gõ "150k" ở đâu cả.
 *
 * `min` thiếu = không chặn dưới, `max` thiếu = không chặn trên. Mốc là cấu hình sản phẩm ước
 * lượng theo giá thuê phổ biến; đổi ở đây, không ở component.
 */
export interface PriceBand {
  readonly min?: number;
  readonly max?: number;
}

export const PRICE_BANDS: Readonly<Record<VehicleType, readonly PriceBand[]>> = {
  [VEHICLE_TYPE.CAR]: [
    { max: 800_000 },
    { min: 800_000, max: 1_500_000 },
    { min: 1_500_000, max: 2_500_000 },
    { min: 2_500_000 },
  ],
  [VEHICLE_TYPE.MOTORBIKE]: [
    { max: 150_000 },
    { min: 150_000, max: 250_000 },
    { min: 250_000, max: 400_000 },
    { min: 400_000 },
  ],
};

/** Chưa chọn loại xe (URL không nói) ⇒ mốc của ô tô — cùng mặc định với thẻ tìm kiếm. */
export function priceBandsFor(vehicleType: string | null | undefined): readonly PriceBand[] {
  return vehicleType === VEHICLE_TYPE.MOTORBIKE
    ? PRICE_BANDS[VEHICLE_TYPE.MOTORBIKE]
    : PRICE_BANDS[VEHICLE_TYPE.CAR];
}

/** Mốc đang được chọn khi khoảng giá hiện tại TRÙNG KHÍT nó (cả hai đầu). */
export function isPriceBandSelected(
  band: PriceBand,
  priceMin: number | null | undefined,
  priceMax: number | null | undefined,
): boolean {
  return (band.min ?? null) === (priceMin ?? null) && (band.max ?? null) === (priceMax ?? null);
}

/**
 * Hộp số trong lối tắt "Hộp số" — tập con của `TRANSMISSION_TYPE_EXT` mà khách hay lọc nhất,
 * theo loại xe. Nhãn lấy từ `Domain.transmissionType`, không viết ở component.
 */
export const QUICK_TRANSMISSIONS: Readonly<Record<VehicleType, readonly TransmissionTypeExt[]>> = {
  [VEHICLE_TYPE.CAR]: [TRANSMISSION_TYPE_EXT.AUTOMATIC, TRANSMISSION_TYPE_EXT.MANUAL],
  [VEHICLE_TYPE.MOTORBIKE]: [
    TRANSMISSION_TYPE_EXT.AUTOMATIC_CVT,
    TRANSMISSION_TYPE_EXT.SEMI_AUTOMATIC,
    TRANSMISSION_TYPE_EXT.MANUAL_CLUTCH,
  ],
};

export function quickTransmissionsFor(
  vehicleType: string | null | undefined,
): readonly TransmissionTypeExt[] {
  return vehicleType === VEHICLE_TYPE.MOTORBIKE
    ? QUICK_TRANSMISSIONS[VEHICLE_TYPE.MOTORBIKE]
    : QUICK_TRANSMISSIONS[VEHICLE_TYPE.CAR];
}
