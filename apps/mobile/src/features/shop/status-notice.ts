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
