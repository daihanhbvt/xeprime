'use client';

import { EyeOutlined, LockOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';

import styles from './PermissionState.module.css';

/**
 * Hai tình huống thiếu quyền ĐANG có trong sản phẩm:
 *  - `forbidden`  — không được vào bề mặt này (403 `FORBIDDEN` / `MISSING_PERMISSION`)
 *  - `view-only`  — vào xem được nhưng không ghi được
 *
 * KHÔNG có `unauthenticated` (401 do `AppShell`/proxy xử, đá về đăng nhập — `134:2482` cấm 403
 * điều hướng về login), KHÔNG có `no-tenant` (`NoTenantState` đã lo, và đó **không phải lỗi**),
 * KHÔNG có `unavailable` (`PlaceholderPage` đã lo).
 */
export type PermissionKind = 'forbidden' | 'view-only';

export interface PermissionStateProps {
  kind?: PermissionKind;
  /** Ghi đè câu chữ mặc định khi bề mặt cần nói cụ thể hơn. */
  title?: string;
  description?: ReactNode;
  /**
   * Quyền còn thiếu, **đã được người gọi lấy sẵn** từ `details.missing` mà API trả về.
   * Component không tự tra quyền và không gọi `usePermissions` — CLAUDE.md §3.
   *
   * Đây là tên khoá quyền (ví dụ `vehicles.delete`), KHÔNG phải dữ liệu được bảo vệ. Không hiển
   * thị bất cứ thứ gì thuộc về bản ghi mà người dùng vừa bị từ chối.
   */
  missingPermissions?: readonly string[];
  /** Lối đi an toàn do người gọi cung cấp — "Quay về trang chủ", "Liên hệ quản trị viên". */
  action?: ReactNode;
}

const DEFAULT_TITLE: Record<PermissionKind, string> = {
  forbidden: 'Bạn không có quyền truy cập',
  'view-only': 'Bạn chỉ có quyền xem',
};

const DEFAULT_DESCRIPTION: Record<PermissionKind, string> = {
  forbidden: 'Liên hệ quản trị viên nếu bạn cần quyền cho mục này.',
  'view-only': 'Bạn xem được dữ liệu nhưng không thực hiện được thay đổi.',
};

const ICON: Record<PermissionKind, ReactNode> = {
  forbidden: <LockOutlined />,
  'view-only': <EyeOutlined />,
};

/**
 * Màn báo thiếu quyền — **chỉ hiển thị**.
 *
 * Không chứa một dòng kiểm quyền nào: nhận thông tin đã giải quyết xong và vẽ ra. Lớp chặn thật
 * là guard ở backend (CLAUDE.md §3, brief 00 P1); ẩn màn này đi không bảo vệ được gì.
 *
 * Theo `134:2482`: KHÔNG điều hướng về đăng nhập (người dùng đã đăng nhập rồi), có nêu quyền còn
 * thiếu nếu biết, và có một lối đi tiếp.
 */
export function PermissionState({
  kind = 'forbidden',
  title,
  description,
  missingPermissions,
  action,
}: PermissionStateProps) {
  return (
    <div className={styles.root} role="status">
      <span className={styles.icon} aria-hidden="true">
        {ICON[kind]}
      </span>
      <p className={styles.title}>{title ?? DEFAULT_TITLE[kind]}</p>
      <p className={styles.description}>{description ?? DEFAULT_DESCRIPTION[kind]}</p>
      {missingPermissions && missingPermissions.length > 0 ? (
        <p className={styles.missing}>Cần quyền: {missingPermissions.join(', ')}</p>
      ) : null}
      {action ? <div className={styles.actions}>{action}</div> : null}
    </div>
  );
}
