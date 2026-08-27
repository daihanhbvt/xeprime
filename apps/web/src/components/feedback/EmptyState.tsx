'use client';

import { ExclamationCircleOutlined, InboxOutlined, SearchOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import type { ReactNode } from 'react';

import styles from './EmptyState.module.css';
import { useTranslations } from 'next-intl';

/**
 * Ba trạng thái "không có gì để xem", tách theo NGUYÊN NHÂN chứ không theo hình thức —
 * Figma `134:2093` (12.37) yêu cầu phân biệt rõ, và ma trận QA thị giác Wave 0B §4.4 (`docs/implementation/` đã nghỉ hưu 21/08/2026)
 * xếp đây là cặp hay sai nhất.
 *
 * `permission-denied` KHÔNG nằm ở đây: nó có ngữ nghĩa bảo mật riêng và câu chữ riêng
 * (`134:2482` cấm gộp), nên dùng `PermissionState`.
 * `unavailable` (tính năng chưa xây) cũng không: đã có `PlaceholderPage`.
 */
export type EmptyStateVariant = 'empty' | 'no-results' | 'error';

interface EmptyStateProps {
  variant: EmptyStateVariant;
  title: string;
  description?: ReactNode;
  /** Hành động chính — "Thêm xe đầu tiên", "Xoá bộ lọc"… Feature tự quyết theo quyền của nó. */
  action?: ReactNode;
  /** Hành động phụ, ví dụ "Quay về trang chủ" cạnh nút thử lại. */
  secondaryAction?: ReactNode;
  /**
   * Chỉ dùng với `variant="error"`. Figma `134:2194` R1: mỗi lỗi phải nói được chuyện gì xảy ra
   * VÀ người dùng làm gì tiếp; R10: chỉ retry khi việc đó có nghĩa (mạng/timeout/500), không
   * retry cho 403/404/409 — nên nút này là tuỳ chọn, không mặc định.
   */
  onRetry?: () => void;
  retryLabel?: string;
}

const ICON: Record<EmptyStateVariant, ReactNode> = {
  empty: <InboxOutlined />,
  'no-results': <SearchOutlined />,
  error: <ExclamationCircleOutlined />,
};

/**
 * Khối trạng thái rỗng / không có kết quả / lỗi.
 *
 * Người gọi **không** truyền màu: `variant` quyết định biểu tượng và tông màu, nên không thể vô
 * tình dùng gold thương hiệu để báo lỗi (CLAUDE.md — gold không mang nghĩa status).
 *
 * A11y: lỗi dùng `role="alert"` (cần được đọc ngay); rỗng / không-kết-quả dùng `role="status"`
 * (đọc khi rảnh). Figma `130:1683` đề nghị `aria-live="assertive"` cho trạng thái rỗng của bảng —
 * **cố ý không theo**: `assertive` ngắt lời trình đọc màn hình, dành cho việc khẩn; một danh sách
 * rỗng sau khi lọc không phải việc khẩn. Ghi lại ở backlog thay vì im lặng lệch chuẩn.
 */
export function EmptyState({
  variant,
  title,
  description,
  action,
  secondaryAction,
  onRetry,
  retryLabel,
}: EmptyStateProps) {
  const tCommon = useTranslations('Common');
  const retryText = retryLabel ?? tCommon('actions.retry');
  const isError = variant === 'error';

  return (
    <div className={styles.root} role={isError ? 'alert' : 'status'}>
      <span className={isError ? styles.iconError : styles.icon} aria-hidden="true">
        {ICON[variant]}
      </span>
      <p className={styles.title}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
      {onRetry || action || secondaryAction ? (
        <div className={styles.actions}>
          {onRetry ? (
            <Button type="primary" onClick={onRetry}>
              {retryText}
            </Button>
          ) : null}
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
