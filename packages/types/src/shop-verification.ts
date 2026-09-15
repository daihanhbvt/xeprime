/**
 * XÁC MINH GIAN HÀNG — trục riêng, tách hẳn khỏi `tenants.status` và khỏi cổng duyệt XE.
 *
 * ## Vì sao cần một trục riêng
 *
 * Đến 14/09/2026, `tenants.status` gánh HAI câu hỏi khác nhau cùng lúc:
 *
 *  1. *Gian hàng này còn được hoạt động không?* — `active` là điều kiện để xe hiện trên chợ
 *     (`TENANT_STATUS_PUBLISHABLE`), nhận yêu cầu thuê, mở hội thoại, tính phí giao xe.
 *  2. *Nền tảng đã xem xét hồ sơ gian hàng chưa?* — `draft → pending_review → active`.
 *
 * Gộp hai câu đó vào một cột sinh ra đúng một bế tắc: chủ xe CÁ NHÂN tuyến hoa hồng (ADR 0028
 * điều 1) mở hồ sơ ở `draft`, và `submitForPublicReview` đòi tenant `active`, nên họ phải đi qua
 * MỘT phiếu duyệt gian hàng trước khi chiếc xe đầu tiên kịp vào hàng đợi. Hai cổng cho một người
 * chỉ có một chiếc xe — và cổng thứ nhất không hỏi thêm được gì mà cổng duyệt xe không hỏi.
 *
 * ## Luật hiện hành
 *
 * - `tenants.status` chỉ còn là trạng thái VẬN HÀNH: `active` khi mở hồ sơ, `suspended` khi nền
 *   tảng khoá. Cổng kiểm duyệt duy nhất của tuyến hoa hồng là phiếu duyệt **XE**.
 * - Xác minh gian hàng là trục THỨ HAI, đọc từ phiếu `approval_tasks` loại `tenant` mới nhất.
 *   Nó **không** chặn đăng xe; nó là điều kiện để mua GÓI thuê bao (ADR 0024/0027: gói quyết
 *   định năng lực, và bộ quản lý đầy đủ cần một pháp nhân đã được xem xét).
 *
 * Vì sao đọc từ phiếu duyệt mà không thêm một cột trạng thái thứ ba: phiếu duyệt đã là nguồn sự
 * thật có sẵn của quyết định đó (ai duyệt, lúc nào, lý do gì — CLAUDE.md mục 6 lằn ranh 2), và
 * một cột song song chỉ là một bản sao sẽ lệch vào ngày ai đó ghi một chỗ mà quên chỗ kia.
 */

import { APPROVAL_STATUS } from './status/misc';
import { STATUS_COLOR, type StatusMeta } from './status/meta';

export const SHOP_VERIFICATION = {
  /** Chưa từng gửi hồ sơ — mặc định của mọi gian hàng mới, kể cả gian hàng đang bán xe. */
  UNVERIFIED: 'unverified',
  /** Đã gửi, đang nằm trong hàng đợi duyệt. */
  PENDING: 'pending',
  /** Nền tảng đã xác minh — điều kiện để mua gói thuê bao. */
  VERIFIED: 'verified',
  /** Người duyệt yêu cầu bổ sung; sửa rồi gửi lại được. */
  NEEDS_REVISION: 'needs_revision',
  /** Bị từ chối; vẫn gửi lại được sau khi khắc phục. */
  REJECTED: 'rejected',
} as const;

export type ShopVerification = (typeof SHOP_VERIFICATION)[keyof typeof SHOP_VERIFICATION];

export const SHOP_VERIFICATION_VALUES = Object.values(SHOP_VERIFICATION) as ShopVerification[];

export const SHOP_VERIFICATION_META: Readonly<Record<ShopVerification, StatusMeta>> = {
  [SHOP_VERIFICATION.UNVERIFIED]: { label: 'Chưa xác minh', color: STATUS_COLOR.NEUTRAL },
  [SHOP_VERIFICATION.PENDING]: { label: 'Đang xác minh', color: STATUS_COLOR.WAITING },
  [SHOP_VERIFICATION.VERIFIED]: { label: 'Đã xác minh', color: STATUS_COLOR.SUCCESS },
  [SHOP_VERIFICATION.NEEDS_REVISION]: { label: 'Cần bổ sung', color: STATUS_COLOR.WARNING },
  [SHOP_VERIFICATION.REJECTED]: { label: 'Bị từ chối', color: STATUS_COLOR.DANGER },
};

/**
 * Trạng thái xác minh suy từ phiếu `approval_tasks` loại `tenant` MỚI NHẤT.
 *
 * `cancelled` và mọi giá trị lạ đều rơi về `unverified`: một phiếu đã huỷ không nói được gì về
 * pháp nhân, và một giá trị không hiểu được phải cho ra kết quả KHÔNG cấp quyền — không bao giờ
 * cho ra `verified`.
 */
export function resolveShopVerification(
  latestTenantApprovalStatus: string | null | undefined,
): ShopVerification {
  switch (latestTenantApprovalStatus) {
    case APPROVAL_STATUS.PENDING:
      return SHOP_VERIFICATION.PENDING;
    case APPROVAL_STATUS.APPROVED:
      return SHOP_VERIFICATION.VERIFIED;
    case APPROVAL_STATUS.NEEDS_REVISION:
      return SHOP_VERIFICATION.NEEDS_REVISION;
    case APPROVAL_STATUS.REJECTED:
      return SHOP_VERIFICATION.REJECTED;
    default:
      return SHOP_VERIFICATION.UNVERIFIED;
  }
}

/** Gửi (lại) hồ sơ xác minh được — mọi trạng thái trừ "đang nằm trong hàng đợi". */
export const SHOP_VERIFICATION_SUBMITTABLE: readonly ShopVerification[] = [
  SHOP_VERIFICATION.UNVERIFIED,
  SHOP_VERIFICATION.NEEDS_REVISION,
  SHOP_VERIFICATION.REJECTED,
];

export function canSubmitShopVerification(state: ShopVerification): boolean {
  return SHOP_VERIFICATION_SUBMITTABLE.includes(state);
}
