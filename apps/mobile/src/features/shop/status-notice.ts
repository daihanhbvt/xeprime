import type { Href } from 'expo-router';
import {
  isTenantStatus,
  SHOP_VERIFICATION,
  TENANT_STATUS,
  type ShopVerification,
  type TenantStatus,
} from '@xeprime/types';
import { ROUTES } from '@/navigation/routes';

/**
 * Trạng thái gian hàng → thông báo hiển thị, ở MỘT nơi — gương của
 * `apps/web/src/features/shop/status-notice.ts`.
 *
 * Hai bề mặt đọc bảng này: dải trên màn Tổng quan (`ManageHomeScreen`) và dải trong hồ sơ gian
 * hàng (`ShopStatusBanner`). Trước khi web gom lại, hai chỗ tự dựng câu chữ riêng và đã nói
 * ngược nhau ngay trên cùng một màn hình — `draft` bị gộp vào "đang chờ duyệt" trong khi hồ sơ
 * chưa gửi đi đâu cả.
 *
 * CHÉP sang app chứ không đưa vào `packages/domain`: bảng này neo vào `Href` của expo-router,
 * thứ không thể sống trong một package framework-free. Phần thật sự dùng chung — mã trạng thái
 * và toàn bộ chữ (`Shop.status.*`) — thì vẫn dùng chung, nên hai client không lệch nhau được.
 */

export type ShopNoticeTone = 'info' | 'success' | 'warning' | 'danger';

/** Khoá message dưới `Shop.status.<key>` — cũng là khoá nhánh nội dung ở cả hai chỗ hiển thị. */
export type ShopNoticeKey =
  | 'draft'
  | 'pending'
  | 'needsRevision'
  | 'rejected'
  | 'active'
  | 'suspended'
  | 'expired';

/** Khoá nhãn nút dưới `Shop.status.action.<key>`. */
export type ShopNoticeAction = 'complete' | 'view' | 'revise' | 'reason' | 'support';

export interface ShopStatusNotice {
  key: ShopNoticeKey;
  tone: ShopNoticeTone;
  /**
   * Có hiện dải ở MÀN TỔNG QUAN hay không.
   *
   * `active` thì không — một dải xanh "mọi thứ đều ổn" đứng thường trực trên đầu màn chỉ dạy
   * người dùng bỏ qua vùng đó, và đúng lúc có tin xấu thì họ cũng không đọc nữa.
   */
  showInShell: boolean;
  /**
   * Nơi sửa được tình trạng này. `null` = không có việc gì để làm.
   *
   * `href` VẮNG nghĩa là web CÓ lối đi này nhưng app chưa dựng màn — nút vẫn hiện và chạm vào
   * thì báo "đang phát triển", đúng quy ước của `ManageDrawer`. Ẩn nút đi thì hai client đọc ra
   * hai sản phẩm khác nhau, và người dùng không biết chức năng có tồn tại.
   */
  action: { key: ShopNoticeAction; href?: Href } | null;
}

const NOTICE: Readonly<Record<TenantStatus, ShopStatusNotice>> = {
  [TENANT_STATUS.DRAFT]: {
    key: 'draft',
    tone: 'warning',
    showInShell: true,
    action: { key: 'complete', href: ROUTES.manage.shop() },
  },
  [TENANT_STATUS.PENDING_REVIEW]: {
    key: 'pending',
    tone: 'info',
    showInShell: true,
    action: { key: 'view', href: ROUTES.manage.shop() },
  },
  [TENANT_STATUS.NEEDS_REVISION]: {
    key: 'needsRevision',
    tone: 'warning',
    showInShell: true,
    action: { key: 'revise', href: ROUTES.manage.shop() },
  },
  [TENANT_STATUS.REJECTED]: {
    key: 'rejected',
    tone: 'danger',
    showInShell: true,
    action: { key: 'reason', href: ROUTES.manage.shop() },
  },
  [TENANT_STATUS.ACTIVE]: {
    key: 'active',
    tone: 'success',
    showInShell: false,
    action: null,
  },
  /*
   * Khoá và hết hạn không sửa được từ trong cổng — lối đi tiếp duy nhất là hỏi nền tảng, y như
   * web. Màn Hỗ trợ (SYS-05) chưa dựng ở app nên hai mục này KHÔNG có `href`: nút vẫn hiện và
   * báo "đang phát triển" thay vì biến mất.
   */
  [TENANT_STATUS.SUSPENDED]: {
    key: 'suspended',
    tone: 'danger',
    showInShell: true,
    action: { key: 'support' },
  },
  [TENANT_STATUS.EXPIRED]: {
    key: 'expired',
    tone: 'warning',
    showInShell: true,
    action: { key: 'support' },
  },
};

/**
 * Trạng thái đi trên dây là `string` (sinh từ OpenAPI), nên chỗ này là biên phải kiểm.
 *
 * Mã lạ (backend mới hơn app) rơi về `draft`: nói "hồ sơ chưa xong, vào xem" luôn an toàn hơn là
 * im lặng hoặc in một trạng thái không ai hiểu.
 */
export function shopStatusNotice(status: string): ShopStatusNotice {
  return NOTICE[isTenantStatus(status) ? status : TENANT_STATUS.DRAFT];
}

/**
 * Trạng thái XÁC MINH gian hàng → thông báo hiển thị (ADR 0036) — gương của bảng cùng tên bên web.
 *
 * Bảng THỨ HAI, cạnh `NOTICE` ở trên, vì từ ADR 0036 có hai trục và chúng trả lời hai câu khác nhau:
 *
 *  - `tenants.status` — *gian hàng còn được hoạt động không?* Thứ quyết định xe có trên chợ hay không.
 *  - `verification` — *nền tảng đã xem xét pháp nhân chưa?* Không chặn đăng xe, và từ ADR 0040
 *    cũng KHÔNG còn là cổng mua gói: thanh toán mở tuyến gói, không cần một cái gật đầu nào trước.
 *
 * Gộp hai bảng lại là quay về đúng chỗ cũ: một quyết định "cần bổ sung hồ sơ pháp nhân" lại hiện
 * ra như "gian hàng của bạn chưa hoạt động", và chủ xe đi tìm xem xe mình biến đi đâu.
 */
export type ShopVerificationNoticeKey =
  | 'unverified'
  | 'pending'
  | 'needsRevision'
  | 'rejected'
  | 'verified';

export interface ShopVerificationNotice {
  key: ShopVerificationNoticeKey;
  tone: ShopNoticeTone;
  /** Nút gửi (lại) hồ sơ xác minh có ý nghĩa ở trạng thái này không. */
  canSubmit: boolean;
  /** `true` = phần mô tả ghép thêm nguyên văn lý do người duyệt viết. */
  useReason: boolean;
}

const VERIFICATION_NOTICE: Readonly<Record<ShopVerification, ShopVerificationNotice>> = {
  /*
   * CHƯA XÁC MINH = KHÔNG CÓ TIN GÌ, KHÔNG CÓ VIỆC GÌ (16/09/2026 — ADR 0040).
   *
   * Tới 16/09/2026 trạng thái này mang một dải "Gian hàng chưa được xác minh" kèm nút "Gửi xác
   * minh", và câu chữ hứa rằng xác minh là điều kiện để MUA GÓI (ADR 0036). ADR 0040 gỡ cổng đó:
   * thanh toán mở tuyến gói, không cần một cái gật đầu nào trước.
   *
   * Nên nút ấy không còn đổi lấy được gì cho người bấm nó — trong khi nó vẫn KHOÁ hồ sơ khỏi việc
   * sửa suốt thời gian chờ (`SHOP_VERIFICATION_PENDING`). Một hành động chỉ có giá mà không có
   * giá trị thì ẩn hẳn, không đổi thành một dòng giải thích luật nội bộ.
   *
   * Ba trạng thái CÒN LẠI vẫn hiện: `pending` giải thích vì sao hồ sơ đang bị khoá, còn
   * `needs_revision`/`rejected` là cuộc trao đổi đang mở với người duyệt và vẫn gửi lại được.
   * Backend không đổi — `SHOP_VERIFICATION_SUBMITTABLE` vẫn nhận `unverified`, nên hồ sơ cũ và
   * đường quản trị vẫn chạy nguyên.
   */
  [SHOP_VERIFICATION.UNVERIFIED]: {
    key: 'unverified',
    tone: 'info',
    canSubmit: false,
    useReason: false,
  },
  [SHOP_VERIFICATION.PENDING]: { key: 'pending', tone: 'info', canSubmit: false, useReason: false },
  [SHOP_VERIFICATION.NEEDS_REVISION]: {
    key: 'needsRevision',
    tone: 'warning',
    canSubmit: true,
    useReason: true,
  },
  [SHOP_VERIFICATION.REJECTED]: {
    key: 'rejected',
    tone: 'danger',
    canSubmit: true,
    useReason: true,
  },
  [SHOP_VERIFICATION.VERIFIED]: {
    key: 'verified',
    tone: 'success',
    canSubmit: false,
    useReason: false,
  },
};

/**
 * Giá trị lạ rơi về `unverified` — cùng lý do với `shopStatusNotice`: câu an toàn nhất khi không
 * hiểu mã là "chưa xác minh", vì nó không hứa hẹn gì và không cấp gì.
 */
export function shopVerificationNotice(verification: string): ShopVerificationNotice {
  return VERIFICATION_NOTICE[
    (VERIFICATION_NOTICE as Record<string, ShopVerificationNotice | undefined>)[verification]
      ? (verification as ShopVerification)
      : SHOP_VERIFICATION.UNVERIFIED
  ];
}
