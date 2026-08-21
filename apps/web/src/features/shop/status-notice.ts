import { isTenantStatus, TENANT_STATUS, type TenantStatus } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';

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
  /** Nơi sửa được tình trạng này. `null` = không có việc gì để làm. */
  action: { key: ShopNoticeAction; href: string } | null;
}

const NOTICE: Readonly<Record<TenantStatus, ShopStatusNotice>> = {
  [TENANT_STATUS.DRAFT]: {
    key: 'draft',
    tone: 'warning',
    showInShell: true,
    action: { key: 'complete', href: ROUTES.MANAGE.SHOP },
  },
  [TENANT_STATUS.PENDING_REVIEW]: {
    key: 'pending',
    tone: 'info',
    showInShell: true,
    action: { key: 'view', href: ROUTES.MANAGE.SHOP },
  },
  [TENANT_STATUS.NEEDS_REVISION]: {
    key: 'needsRevision',
    tone: 'warning',
    showInShell: true,
    action: { key: 'revise', href: ROUTES.MANAGE.SHOP },
  },
  [TENANT_STATUS.REJECTED]: {
    key: 'rejected',
    tone: 'error',
    showInShell: true,
    action: { key: 'reason', href: ROUTES.MANAGE.SHOP },
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
    action: { key: 'support', href: ROUTES.MANAGE.SUPPORT },
  },
  [TENANT_STATUS.EXPIRED]: {
    key: 'expired',
    tone: 'warning',
    showInShell: true,
    action: { key: 'support', href: ROUTES.MANAGE.SUPPORT },
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
