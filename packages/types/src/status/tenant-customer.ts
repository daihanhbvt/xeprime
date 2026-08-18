import { STATUS_COLOR, type StatusMeta } from './meta';

/**
 * Sổ khách hàng của GIAN HÀNG (bảng `tenant_customers` — database_design §10.2, gap S-01).
 *
 * Đây KHÔNG phải khách thuê toàn hệ thống (`users` + màn giám sát `/manage/admin/customers`):
 * cùng một người có thể là khách của shop A và shop B, và hai hồ sơ đó độc lập nhau — tên gọi,
 * ghi chú nội bộ, mức rủi ro của shop A không được rò sang shop B.
 *
 * Định danh trong một gian hàng là **SĐT đã chuẩn hoá** (`normalizeVnPhone`): `09…`, `849…` và
 * `+849…` là cùng một khách. KHÔNG bao giờ gộp theo tên — hai người trùng tên là chuyện thường,
 * còn một người viết tên mình ba kiểu cũng là chuyện thường.
 */

/** Hồ sơ khách sinh ra từ đâu. Chỉ `manual` là do người của shop tự nhập. */
export const TENANT_CUSTOMER_SOURCE = {
  /** Nhân viên tự thêm vào sổ khách. */
  MANUAL: 'manual',
  /** Sinh ra khi shop lập đơn thuê tại quầy (hoặc backfill từ đơn cũ). */
  BOOKING: 'booking',
  /** Sinh ra từ yêu cầu thuê gửi qua Marketplace. */
  MARKETPLACE: 'marketplace',
} as const;

export type TenantCustomerSource =
  (typeof TENANT_CUSTOMER_SOURCE)[keyof typeof TENANT_CUSTOMER_SOURCE];
export const TENANT_CUSTOMER_SOURCE_VALUES = Object.values(
  TENANT_CUSTOMER_SOURCE,
) as TenantCustomerSource[];

export const TENANT_CUSTOMER_SOURCE_LABEL: Readonly<Record<TenantCustomerSource, string>> = {
  [TENANT_CUSTOMER_SOURCE.MANUAL]: 'Nhân viên thêm',
  [TENANT_CUSTOMER_SOURCE.BOOKING]: 'Từ đơn thuê tại quầy',
  [TENANT_CUSTOMER_SOURCE.MARKETPLACE]: 'Từ yêu cầu trên Marketplace',
};

/**
 * Mức rủi ro do CHÍNH gian hàng đánh giá — quyết định nội bộ, không phải lệnh cấm toàn nền tảng.
 *
 *  - `normal`    : bình thường.
 *  - `watchlist` : cần lưu ý. **Chỉ để nhắc người trực**, không tự chặn bất cứ thao tác nào.
 *  - `blocked`   : gian hàng từ chối phục vụ. Yêu cầu mới từ Marketplace bị từ chối bằng thông
 *                  điệp TRUNG TÍNH (khách không bao giờ được biết mình nằm trong danh sách nội
 *                  bộ nào); nhân viên không lập được đơn mới cho tới khi chủ/quản lý đổi mức.
 */
export const TENANT_CUSTOMER_RISK_LEVEL = {
  NORMAL: 'normal',
  WATCHLIST: 'watchlist',
  BLOCKED: 'blocked',
} as const;

export type TenantCustomerRiskLevel =
  (typeof TENANT_CUSTOMER_RISK_LEVEL)[keyof typeof TENANT_CUSTOMER_RISK_LEVEL];
export const TENANT_CUSTOMER_RISK_LEVEL_VALUES = Object.values(
  TENANT_CUSTOMER_RISK_LEVEL,
) as TenantCustomerRiskLevel[];

export const TENANT_CUSTOMER_RISK_LEVEL_META: Readonly<
  Record<TenantCustomerRiskLevel, StatusMeta>
> = {
  [TENANT_CUSTOMER_RISK_LEVEL.NORMAL]: { label: 'Bình thường', color: STATUS_COLOR.SUCCESS },
  [TENANT_CUSTOMER_RISK_LEVEL.WATCHLIST]: { label: 'Cần lưu ý', color: STATUS_COLOR.WARNING },
  [TENANT_CUSTOMER_RISK_LEVEL.BLOCKED]: { label: 'Từ chối phục vụ', color: STATUS_COLOR.DANGER },
};

/** Mức rủi ro BẮT BUỘC kèm lý do — không có lý do thì lần sau không ai hiểu vì sao. */
export function requiresRiskReason(level: TenantCustomerRiskLevel): boolean {
  return level !== TENANT_CUSTOMER_RISK_LEVEL.NORMAL;
}

/** Mức rủi ro CHẶN thao tác tạo đơn/nhận yêu cầu mới (chỉ `blocked`; `watchlist` là lời nhắc). */
export function blocksNewRentals(level: string): boolean {
  return level === TENANT_CUSTOMER_RISK_LEVEL.BLOCKED;
}

/**
 * Loại ghi chú nội bộ. Ghi chú là bản ghi BẤT BIẾN có tác giả + thời điểm (không phải một ô
 * `note` bị ghi đè): "khách này từng trả xe muộn 2 lần" phải giữ được ai ghi và ghi khi nào.
 */
export const TENANT_CUSTOMER_NOTE_TYPE = {
  GENERAL: 'general',
  PREFERENCE: 'preference',
  RISK: 'risk',
} as const;

export type TenantCustomerNoteType =
  (typeof TENANT_CUSTOMER_NOTE_TYPE)[keyof typeof TENANT_CUSTOMER_NOTE_TYPE];
export const TENANT_CUSTOMER_NOTE_TYPE_VALUES = Object.values(
  TENANT_CUSTOMER_NOTE_TYPE,
) as TenantCustomerNoteType[];

export const TENANT_CUSTOMER_NOTE_TYPE_META: Readonly<Record<TenantCustomerNoteType, StatusMeta>> =
  {
    [TENANT_CUSTOMER_NOTE_TYPE.GENERAL]: { label: 'Ghi chú chung', color: STATUS_COLOR.NEUTRAL },
    [TENANT_CUSTOMER_NOTE_TYPE.PREFERENCE]: {
      label: 'Sở thích / thói quen',
      color: STATUS_COLOR.INFO,
    },
    [TENANT_CUSTOMER_NOTE_TYPE.RISK]: { label: 'Cảnh báo rủi ro', color: STATUS_COLOR.WARNING },
  };

/** Giấy tờ khách lưu ở kho RIÊNG TƯ (R2 private) — không bao giờ có URL công khai. */
export const CUSTOMER_DOCUMENT_TYPE = {
  CITIZEN_ID: 'citizen_id',
  DRIVER_LICENCE: 'driver_licence',
  OTHER: 'other',
} as const;

export type CustomerDocumentType =
  (typeof CUSTOMER_DOCUMENT_TYPE)[keyof typeof CUSTOMER_DOCUMENT_TYPE];
export const CUSTOMER_DOCUMENT_TYPE_VALUES = Object.values(
  CUSTOMER_DOCUMENT_TYPE,
) as CustomerDocumentType[];

export const CUSTOMER_DOCUMENT_TYPE_LABEL: Readonly<Record<CustomerDocumentType, string>> = {
  [CUSTOMER_DOCUMENT_TYPE.CITIZEN_ID]: 'CCCD / CMND',
  [CUSTOMER_DOCUMENT_TYPE.DRIVER_LICENCE]: 'Giấy phép lái xe',
  [CUSTOMER_DOCUMENT_TYPE.OTHER]: 'Giấy tờ khác',
};

/**
 * Vòng đời file riêng tư — giống `PRIVATE_FILE_STATUS` của xe: `pending` là đã presign nhưng
 * CHƯA xác minh nội dung (không tải về được), `ready` mới là file thật.
 */
export const CUSTOMER_DOCUMENT_STATUS = {
  PENDING: 'pending',
  READY: 'ready',
  DELETED: 'deleted',
} as const;

export type CustomerDocumentStatus =
  (typeof CUSTOMER_DOCUMENT_STATUS)[keyof typeof CUSTOMER_DOCUMENT_STATUS];
export const CUSTOMER_DOCUMENT_STATUS_VALUES = Object.values(
  CUSTOMER_DOCUMENT_STATUS,
) as CustomerDocumentStatus[];

/**
 * Trạng thái HẠN của một giấy tờ — luôn SUY RA từ `expiresAt` lúc đọc, không có cột nào lưu.
 * Cùng kỷ luật với giấy tờ xe (Wave 5): trạng thái phụ thuộc ngày hôm nay thì không được lưu.
 */
export const CUSTOMER_DOCUMENT_EXPIRY = {
  NO_EXPIRY: 'no_expiry',
  VALID: 'valid',
  EXPIRING_SOON: 'expiring_soon',
  EXPIRED: 'expired',
} as const;

export type CustomerDocumentExpiry =
  (typeof CUSTOMER_DOCUMENT_EXPIRY)[keyof typeof CUSTOMER_DOCUMENT_EXPIRY];

export const CUSTOMER_DOCUMENT_EXPIRY_META: Readonly<Record<CustomerDocumentExpiry, StatusMeta>> = {
  [CUSTOMER_DOCUMENT_EXPIRY.NO_EXPIRY]: { label: 'Không có hạn', color: STATUS_COLOR.NEUTRAL },
  [CUSTOMER_DOCUMENT_EXPIRY.VALID]: { label: 'Còn hiệu lực', color: STATUS_COLOR.SUCCESS },
  [CUSTOMER_DOCUMENT_EXPIRY.EXPIRING_SOON]: { label: 'Sắp hết hạn', color: STATUS_COLOR.WARNING },
  [CUSTOMER_DOCUMENT_EXPIRY.EXPIRED]: { label: 'Đã hết hạn', color: STATUS_COLOR.DANGER },
};

/** Ngưỡng "sắp hết hạn" của giấy tờ khách (ngày) — đủ để nhắc khách mang bản mới khi tới lấy xe. */
export const CUSTOMER_DOCUMENT_EXPIRING_SOON_DAYS = 30;

/**
 * Nhóm quan hệ dùng cho bộ lọc danh sách khách. Giá trị đi trong query string nên web và api
 * phải chung một nguồn — lệch một chữ là bộ lọc im lặng không có tác dụng.
 *
 * `has_debt` là bộ lọc TÀI CHÍNH: chỉ người có `finance.view` được dùng (backend từ chối,
 * không âm thầm trả về danh sách đầy đủ).
 */
export const TENANT_CUSTOMER_RELATIONSHIP = {
  ALL: 'all',
  /** Đã hoàn tất từ 2 chuyến trở lên — khách quen, tài sản thật của gian hàng. */
  RETURNING: 'returning',
  HAS_DEBT: 'has_debt',
  WATCHLIST: 'watchlist',
  BLOCKED: 'blocked',
  ARCHIVED: 'archived',
} as const;

export type TenantCustomerRelationship =
  (typeof TENANT_CUSTOMER_RELATIONSHIP)[keyof typeof TENANT_CUSTOMER_RELATIONSHIP];
export const TENANT_CUSTOMER_RELATIONSHIP_VALUES = Object.values(
  TENANT_CUSTOMER_RELATIONSHIP,
) as TenantCustomerRelationship[];

export const TENANT_CUSTOMER_RELATIONSHIP_LABEL: Readonly<
  Record<TenantCustomerRelationship, string>
> = {
  [TENANT_CUSTOMER_RELATIONSHIP.ALL]: 'Tất cả khách',
  [TENANT_CUSTOMER_RELATIONSHIP.RETURNING]: 'Khách quen',
  [TENANT_CUSTOMER_RELATIONSHIP.HAS_DEBT]: 'Còn nợ',
  [TENANT_CUSTOMER_RELATIONSHIP.WATCHLIST]: 'Cần lưu ý',
  [TENANT_CUSTOMER_RELATIONSHIP.BLOCKED]: 'Từ chối phục vụ',
  [TENANT_CUSTOMER_RELATIONSHIP.ARCHIVED]: 'Đã lưu trữ',
};

/** Bộ lọc chỉ dùng được khi có `finance.view` — backend từ chối tường minh, không lọc ngầm. */
export const TENANT_CUSTOMER_FINANCE_RELATIONSHIPS: readonly TenantCustomerRelationship[] = [
  TENANT_CUSTOMER_RELATIONSHIP.HAS_DEBT,
];

/** Số chuyến hoàn tất tối thiểu để coi là khách quen — một định nghĩa cho cả KPI lẫn bộ lọc. */
export const TENANT_CUSTOMER_RETURNING_MIN_RENTALS = 2;

/** Sắp xếp danh sách khách. `debt`/`total_value` là sắp xếp TÀI CHÍNH — gate như bộ lọc trên. */
export const TENANT_CUSTOMER_SORT = {
  LAST_RENTAL: 'last_rental',
  RENTAL_COUNT: 'rental_count',
  TOTAL_VALUE: 'total_value',
  DEBT: 'debt',
  NAME: 'name',
} as const;

export type TenantCustomerSort = (typeof TENANT_CUSTOMER_SORT)[keyof typeof TENANT_CUSTOMER_SORT];
export const TENANT_CUSTOMER_SORT_VALUES = Object.values(
  TENANT_CUSTOMER_SORT,
) as TenantCustomerSort[];

export const DEFAULT_TENANT_CUSTOMER_SORT: TenantCustomerSort = TENANT_CUSTOMER_SORT.LAST_RENTAL;

export const TENANT_CUSTOMER_SORT_LABEL: Readonly<Record<TenantCustomerSort, string>> = {
  [TENANT_CUSTOMER_SORT.LAST_RENTAL]: 'Thuê gần đây nhất',
  [TENANT_CUSTOMER_SORT.RENTAL_COUNT]: 'Số lần thuê nhiều nhất',
  [TENANT_CUSTOMER_SORT.TOTAL_VALUE]: 'Tổng giá trị thuê cao nhất',
  [TENANT_CUSTOMER_SORT.DEBT]: 'Còn nợ nhiều nhất',
  [TENANT_CUSTOMER_SORT.NAME]: 'Tên A → Z',
};

export const TENANT_CUSTOMER_FINANCE_SORTS: readonly TenantCustomerSort[] = [
  TENANT_CUSTOMER_SORT.TOTAL_VALUE,
  TENANT_CUSTOMER_SORT.DEBT,
];
