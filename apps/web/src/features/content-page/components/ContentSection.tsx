import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './ContentSection.module.css';

export interface ContentSectionProps {
  /** Neo cuộn + `aria-labelledby` của tiêu đề. Bắt buộc: mọi mục phải chia sẻ link được. */
  readonly id: string;
  readonly heading: string;
  /** Một câu đặt bối cảnh cho cả mục. */
  readonly lead?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Một mục nội dung trên trang công khai: tiêu đề, câu dẫn, rồi nội dung.
 *
 * Tồn tại để bốn trang (giới thiệu · ứng dụng · pháp lý · hỗ trợ) có CÙNG một nhịp dọc và cùng
 * một cấp tiêu đề. Trước đây mỗi trang tự đặt `font-size` cho `h2` của nó — 17px ở trang hỗ trợ,
 * 20px ở trang chủ, 19px ở trang pháp lý — nên đi giữa các trang là ba cấp tiêu đề khác nhau
 * cho cùng một vai.
 *
 * `id` là bắt buộc chứ không phải tuỳ chọn: một mục không neo được là một mục không gửi link
 * cho người khác được, và trang pháp lý dựng mục lục từ chính các neo này.
 */
export function ContentSection({ id, heading, lead, children, className }: ContentSectionProps) {
  return (
    <section id={id} className={cx(styles.section, className)} aria-labelledby={`${id}-title`}>
      <div className={styles.head}>
        <h2 id={`${id}-title`} className={styles.heading}>
          {heading}
        </h2>
        {lead && <p className={styles.lead}>{lead}</p>}
      </div>
      {children}
    </section>
  );
}
