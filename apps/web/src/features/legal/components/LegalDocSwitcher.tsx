import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LEGAL_DOC_VALUES, legalPath, type LegalDoc } from '@/constants/legal';
import { cx } from '@/lib/cx';
import styles from './LegalDocSwitcher.module.css';

export interface LegalDocSwitcherProps {
  /** Văn bản đang mở — mục của nó thành trạng thái "đang xem", không còn là liên kết. */
  readonly current: LegalDoc;
  readonly label: string;
  readonly className?: string;
}

/**
 * Bộ chuyển giữa bốn văn bản pháp lý, luôn hiện ở đầu cột bên.
 *
 * **Vì sao không dùng `LegalDocLinks`.** Component đó là một DẢI liên kết cho những chỗ pháp lý
 * chỉ là mục phụ (cuối trang hỗ trợ, cuối một văn bản). Ở đây bốn văn bản là bối cảnh ĐIỀU
 * HƯỚNG thường trực: người đọc điều khoản rất hay cần nhảy sang chính sách huỷ rồi quay lại,
 * và họ cần thấy mình đang ở đâu trong bộ bốn. Đó là hai vai khác nhau của cùng một danh sách.
 *
 * Mục đang mở render thành `<span aria-current="page">` chứ không phải một liên kết trỏ về
 * chính trang hiện tại — một liên kết như vậy là cái bẫy cho người dùng bàn phím.
 *
 * Không có `'use client'`: nó chỉ đọc message và render link, nên chạy đúng như Server Component
 * bên trong `LegalDocumentView` (giữ nguyên chủ đích SEO của trang).
 */
export function LegalDocSwitcher({ current, label, className }: LegalDocSwitcherProps) {
  const t = useTranslations('Legal');

  return (
    <nav className={cx(styles.switcher, className)} aria-label={label}>
      <p className={styles.label}>{label}</p>
      <ul className={styles.list}>
        {LEGAL_DOC_VALUES.map((doc) => {
          const title = t(`docs.${doc}.title` as never);
          if (doc === current) {
            return (
              <li key={doc}>
                <span className={cx(styles.item, styles.itemCurrent)} aria-current="page">
                  {title}
                </span>
              </li>
            );
          }
          return (
            <li key={doc}>
              <Link href={legalPath.doc(doc)} className={styles.item}>
                {title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
