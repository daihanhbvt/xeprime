import type { Href } from 'expo-router';
import { isTenantStatus, TENANT_STATUS, type TenantStatus } from '@xeprime/types';
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
  'draft' | 'pending' | 'needsRevision' | 'rejected' | 'active' | 'suspended' | 'expired';

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
   * Web lưu một KHOÁ của `workspacePaths` rồi tra theo khu; bảng này chỉ được đọc ở màn Tổng quan
   * của CỔNG QUẢN LÝ (`ShopDashboardScreen`), nên nó ghi thẳng đích của khu đó — đúng
   * `workspacePaths(MANAGE)`: `ownerProfile` = `/manage/shop`, `support` = `/manage/support`.
   */
  action: { key: ShopNoticeAction; href: Href } | null;
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
   * web: trung tâm hỗ trợ của cổng quản lý (SYS-05, `/manage/support`).
   */
  [TENANT_STATUS.SUSPENDED]: {
    key: 'suspended',
    tone: 'danger',
    showInShell: true,
    action: { key: 'support', href: ROUTES.manage.support() },
  },
  [TENANT_STATUS.EXPIRED]: {
    key: 'expired',
    tone: 'warning',
    showInShell: true,
    action: { key: 'support', href: ROUTES.manage.support() },
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
