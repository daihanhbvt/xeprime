import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './InfoNote.module.css';

/**
 * Ba mức, và chúng KHÔNG thay thế cho nhau được:
 *
 * - `warning` — "đừng tin trang này hoàn toàn": bản thảo pháp lý, kênh liên hệ chưa có thật.
 * - `danger`  — việc phải làm TRƯỚC khi nghĩ tới XePrime: gọi 113/114/115.
 * - `info`    — bối cảnh thêm, đọc cũng được không đọc cũng xong.
 */
export type InfoNoteTone = 'warning' | 'danger' | 'info';

export interface InfoNoteProps {
  readonly tone?: InfoNoteTone;
  readonly title?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

const TONE_CLASS: Record<InfoNoteTone, string | undefined> = {
  warning: styles.warning,
  danger: styles.danger,
  info: styles.info,
};

/**
 * Khối ghi chú / cảnh báo dùng chung ở các trang nội dung công khai.
 *
 * Trước 23/09/2026 mỗi trang tự dựng khối của nó: trang pháp lý có `.draft`, trang hỗ trợ có
 * `.draft` KHÁC cộng thêm `.emergency` — ba biến thể cho cùng một ý "hãy đọc dòng này trước".
 * Gộp lại thành một component có `tone` để một cảnh báo trông giống nhau ở mọi nơi, và để chỗ
 * nào cần thêm mức thứ tư thì thêm đúng một lần.
 *
 * `role="note"` chứ không phải `role="alert"`: nội dung có sẵn lúc tải trang, không phải thứ
 * vừa xảy ra — `alert` sẽ cướp lời trình đọc màn hình ngay khi người dùng mới vào trang.
 */
export function InfoNote({ tone = 'info', title, children, className }: InfoNoteProps) {
  return (
    <aside className={cx(styles.note, TONE_CLASS[tone], className)} role="note">
      {title && <strong className={styles.title}>{title}</strong>}
      <div className={styles.body}>{children}</div>
    </aside>
  );
}
