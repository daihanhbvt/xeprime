'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { floatClass } from '@/components/motion/motion-classes';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import { cx } from '@/lib/cx';
import styles from './EmptyState.module.css';

/**
 * Trạng thái "không có gì để xem / không xem được" DÙNG CHUNG toàn web — Figma Xe-Prime "States
 * Page" `22306:65271`: hình minh hoạ 320 · tiêu đề 30/38 semibold · mô tả 16/24 · nút vàng gradient.
 * Sửa ở đây là đổi cho MỌI màn (danh sách rỗng, không khớp bộ lọc, lỗi tải, 404, bảo trì…), app
 * native giữ cùng bộ biến thể ở `components/feedback/EmptyState` + `components/state/*`.
 *
 * Tách theo NGUYÊN NHÂN chứ không theo hình thức — Figma `134:2093` (12.37):
 *  - `empty` · `no-results`: hình "Không tìm thấy kết quả" (`22306:67026`);
 *  - `error`: "Đã xảy ra lỗi hệ thống" (`22306:65773`);
 *  - `not-found`: 404 (`22306:65732`); `maintenance` (`22306:67113`); `coming-soon` (`22306:67210`).
 *
 * Cỡ tự co theo BỀ RỘNG CHỖ ĐẶT (container query): đủ rộng thì đúng số đo bản vẽ, trong thẻ hẹp
 * (cột phải, ô biểu đồ) thì hình và chữ thu nhỏ — một component cho mọi nơi, không prop cỡ.
 *
 * `permission-denied` KHÔNG nằm ở đây: ngữ nghĩa bảo mật riêng (`134:2482`), dùng `PermissionState`.
 */
export type EmptyStateVariant =
  'empty' | 'no-results' | 'error' | 'not-found' | 'maintenance' | 'coming-soon';

interface EmptyStateProps {
  variant: EmptyStateVariant;
  title: string;
  description?: ReactNode;
  /** Hành động chính — "Thêm xe đầu tiên", "Xoá bộ lọc", "Về trang chủ"… Feature tự quyết theo quyền. */
  action?: ReactNode;
  /** Hành động phụ, ví dụ "Quay về trang chủ" cạnh nút thử lại. */
  secondaryAction?: ReactNode;
  /**
   * Figma `134:2194` R1/R10: chỉ retry khi việc đó có nghĩa (mạng/timeout/500), không retry cho
   * 403/404/409 — nên nút này là tuỳ chọn, không mặc định.
   */
  onRetry?: () => void;
  retryLabel?: string;
}

const ART: Record<EmptyStateVariant, string> = {
  empty: '/states/no-results.webp',
  'no-results': '/states/no-results.webp',
  error: '/states/error.webp',
  'not-found': '/states/not-found.webp',
  maintenance: '/states/maintenance.webp',
  'coming-soon': '/states/coming-soon.webp',
};

const ALERT_VARIANTS: readonly EmptyStateVariant[] = ['error', 'maintenance'];

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
  const isAlert = ALERT_VARIANTS.includes(variant);

  return (
    <div className={styles.root} role={isAlert ? 'alert' : 'status'}>
      <div className={styles.inner}>
        {/* Hình của bản vẽ (PNG xuất từ Figma) — trang trí, tiêu đề đã nói đủ. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ART[variant]}
          alt=""
          aria-hidden="true"
          width={320}
          height={320}
          className={cx(styles.art, styles[`art_${variant}`], floatClass)}
        />
        <div className={styles.text}>
          <p className={styles.title}>{title}</p>
          {description ? <p className={styles.description}>{description}</p> : null}
        </div>
        {onRetry || action || secondaryAction ? (
          <div className={styles.actions}>
            {onRetry ? <CtaButton onClick={onRetry}>{retryText}</CtaButton> : null}
            {action}
            {secondaryAction}
          </div>
        ) : null}
      </div>
    </div>
  );
}
