'use client';

import { Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';
import { EmptyState } from '@/components/feedback/EmptyState';
import styles from './ChartFrame.module.css';

interface ChartFrameProps {
  /** Tiêu đề biểu đồ — cũng là chú thích của `<figure>`, nên bắt buộc. */
  title: string;
  /** Điều khiển riêng của biểu đồ (đổi độ mịn…), đứng cùng hàng với tiêu đề. */
  actions?: ReactNode;
  /** Một câu nói biểu đồ này đang trả lời câu hỏi gì. */
  description?: string;
  height?: number;
  loading?: boolean;
  /** Chỉ coi là lỗi khi KHÔNG còn dữ liệu cũ để hiện — refetch nền hỏng thì giữ hình đang xem. */
  error?: { title: string; onRetry?: () => void } | null;
  /** Kỳ không có dữ liệu — khác hẳn "đang tải" và "lỗi", nên là trạng thái riêng. */
  empty?: { title: string; description?: string } | null;
  children: ReactElement;
}

/**
 * Khung chung của mọi biểu đồ — **nơi duy nhất trong `apps/web` được import `recharts`**, cùng
 * với các component vẽ series nằm trong chính thư mục này.
 *
 * Gom lại một chỗ vì ba lý do: (a) đổi thư viện biểu đồ về sau chỉ chạm thư mục này; (b)
 * `recharts` không lọt sang bundle marketplace (ngân sách 180KB — `docs/design/10` §5), vì đây
 * là lá `'use client'` chỉ được dựng dưới route `(manage)`; (c) bốn trạng thái tải/rỗng/lỗi/
 * có-dữ-liệu xử lý một lần, thay vì mỗi biểu đồ tự bịa một kiểu.
 *
 * `<figure>` + `<figcaption>` chứ không phải `<div>` + `<h3>`: biểu đồ là hình có chú thích, và
 * trình đọc màn hình cần biết tiêu đề đó thuộc về hình nào. Ba trạng thái không-dữ-liệu đi qua
 * `EmptyState` dùng chung — một biểu đồ lỗi không được trông khác một bảng lỗi.
 */
export function ChartFrame({
  title,
  actions,
  description,
  height = 300,
  loading,
  error,
  empty,
  children,
}: ChartFrameProps) {
  const t = useTranslations('Common');

  return (
    <figure className={styles.frame}>
      <div className={styles.header}>
        <figcaption className={styles.title}>{title}</figcaption>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      {description ? <p className={styles.description}>{description}</p> : null}

      <div className={styles.body}>
        {error ? (
          <EmptyState
            variant="error"
            title={error.title}
            onRetry={error.onRetry}
            retryLabel={t('actions.retry')}
          />
        ) : loading ? (
          <Skeleton.Node active className={styles.skeleton} />
        ) : empty ? (
          <EmptyState variant="empty" title={empty.title} description={empty.description} />
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            {children}
          </ResponsiveContainer>
        )}
      </div>
    </figure>
  );
}
