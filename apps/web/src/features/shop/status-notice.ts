import {
  isTenantStatus,
  SHOP_VERIFICATION,
  TENANT_STATUS,
  type ShopVerification,
  type TenantStatus,
} from '@xeprime/types';
import type { WorkspacePaths } from '@/constants/routes';

/**
 * Trạng thái gian hàng → thông báo hiển thị, ở MỘT nơi.
 *
 * Trước đây có hai nguồn và chúng nói ngược nhau. `AppShell` gộp `draft | pending_review |
 * needs_revision` thành một cờ `isPendingApproval` rồi in "Gian hàng đang chờ duyệt" cho cả
 * ba — trong khi shop `draft` chưa gửi gì cả. Còn `ShopStatusBanner` ở `/manage/shop` thì nói
 * đúng ("Hồ sơ chưa được gửi duyệt"), nên người dùng nhận hai câu mâu thuẫn xếp chồng nhau trên
 * cùng một màn hình. Ba trạng thái khác nhau cần ba câu khác nhau, và cả hai chỗ phải lấy từ
 * cùng một bảng thì mới không trôi khỏi nhau lần nữa.
 *
 * Ba trạng thái còn lại (`rejected`, `suspended`, `expired`) trước đây KHÔNG có dải nào ở khung
 * quản lý: một gian hàng bị khoá chỉ biết qua việc xe biến mất khỏi marketplace.
 */

export type ShopNoticeTone = 'info' | 'success' | 'warning' | 'error';

/** Khoá message dưới `Shop.status.<key>` — cũng là khoá của nhánh nội dung ở cả hai chỗ hiển thị. */
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
   * Có hiện dải ở khung quản lý (mọi trang `/manage/*`) hay không.
   *
   * `active` thì không — một dải xanh "mọi thứ đều ổn" đứng thường trực trên đầu mọi màn hình
   * chỉ dạy người dùng bỏ qua vùng đó, và đúng lúc có tin xấu thì họ cũng không đọc nữa.
   */
  showInShell: boolean;
  /**
   * Nơi sửa được tình trạng này. `null` = không có việc gì để làm.
   *
   * `target` là MỘT KHOÁ trong bảng đường dẫn theo khu (`workspacePaths`), không phải một URL
   * cứng: cùng một tình trạng dẫn tới `/manage/shop` với gian hàng có gói và `/account/registration`
   * với chủ xe tuyến hoa hồng. Nhúng `/manage/...` vào bảng này nghĩa là dải trạng thái luôn mời
   * tuyến hoa hồng đi vào đúng khu họ không vào được.
   */
  action: { key: ShopNoticeAction; target: keyof WorkspacePaths } | null;
}

const NOTICE: Readonly<Record<TenantStatus, ShopStatusNotice>> = {
  [TENANT_STATUS.DRAFT]: {
    key: 'draft',
    tone: 'warning',
    showInShell: true,
    action: { key: 'complete', target: 'ownerProfile' },
  },
  [TENANT_STATUS.PENDING_REVIEW]: {
    key: 'pending',
    tone: 'info',
    showInShell: true,
    action: { key: 'view', target: 'ownerProfile' },
  },
  [TENANT_STATUS.NEEDS_REVISION]: {
    key: 'needsRevision',
    tone: 'warning',
    showInShell: true,
    action: { key: 'revise', target: 'ownerProfile' },
  },
  [TENANT_STATUS.REJECTED]: {
    key: 'rejected',
    tone: 'error',
    showInShell: true,
    action: { key: 'reason', target: 'ownerProfile' },
  },
  [TENANT_STATUS.ACTIVE]: {
    key: 'active',
    tone: 'success',
    showInShell: false,
    action: null,
  },
  // Khoá và hết hạn không sửa được từ trong cổng — lối đi tiếp duy nhất là hỏi nền tảng.
  [TENANT_STATUS.SUSPENDED]: {
    key: 'suspended',
    tone: 'error',
    showInShell: true,
    action: { key: 'support', target: 'support' },
  },
  [TENANT_STATUS.EXPIRED]: {
    key: 'expired',
    tone: 'warning',
    showInShell: true,
    action: { key: 'support', target: 'support' },
  },
};

/**
 * Trạng thái đi trên dây là `string` (sinh từ OpenAPI), nên chỗ này là biên phải kiểm.
 *
 * Mã lạ (backend mới hơn web) rơi về `draft`: nói "hồ sơ chưa xong, vào xem" luôn an toàn hơn
 * là im lặng hoặc in một trạng thái không ai hiểu.
 */
export function shopStatusNotice(status: string): ShopStatusNotice {
  return NOTICE[isTenantStatus(status) ? status : TENANT_STATUS.DRAFT];
}

/**
 * Trạng thái XÁC MINH gian hàng → thông báo hiển thị (ADR 0036).
 *
 * Bảng THỨ HAI, cạnh `NOTICE` ở trên, vì từ ADR 0036 có hai trục và chúng trả lời hai câu hỏi
 * khác nhau:
 *
 *  - `tenants.status` — *gian hàng còn được hoạt động không?* Chỉ còn `active` ↔ `suspended`
 *    (cộng vài giá trị cũ), và nó là thứ quyết định xe có nằm trên chợ hay không.
 *  - `verification` — *nền tảng đã xem xét pháp nhân chưa?* Không chặn đăng xe; nó là cổng để
 *    MUA GÓI thuê bao.
 *
 * Gộp hai bảng lại là quay về đúng chỗ cũ: một quyết định "cần bổ sung hồ sơ pháp nhân" lại
 * hiện ra như "gian hàng của bạn chưa hoạt động", và chủ xe đi tìm xem xe mình biến đi đâu.
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
  [SHOP_VERIFICATION.UNVERIFIED]: {
    key: 'unverified',
    tone: 'info',
    canSubmit: true,
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
    tone: 'error',
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
