import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cx } from '@/lib/cx';
import { LEGAL_DOC_VALUES, legalPath, type LegalDoc } from '@/constants/legal';
import styles from './LegalDocLinks.module.css';

interface LegalDocLinksProps {
  /** `stack` cho cột hẹp (cuối một văn bản), `inline` cho dải cuối trang. */
  layout?: 'stack' | 'inline';
  /** Bỏ văn bản đang đọc khỏi danh sách — dùng ở khối "Văn bản liên quan". */
  exclude?: LegalDoc;
  /**
   * Mở tab mới. Bật ở những nơi rời trang là MẤT VIỆC ĐANG LÀM (cổng quản lý, hộp thoại);
   * tắt ở trang tĩnh, nơi nút Back là thứ người đọc mong đợi.
   */
  newTab?: boolean;
  className?: string;
}

/**
 * Danh sách liên kết tới bốn văn bản pháp lý.
 *
 * Trước đây mỗi nơi tự lặp lại `LEGAL_DOC_VALUES.map(...)` cùng CSS gần giống nhau — thêm một
 * văn bản thứ năm sẽ phải nhớ sửa từng chỗ, và chỗ nào quên thì im lặng thiếu. Tiêu đề luôn lấy
 * từ `Legal.docs.<doc>.title`, tức đúng tiêu đề in trên chính văn bản đó.
 *
 * KHÔNG có `'use client'`: component chỉ đọc message và render link, nên nó chạy đúng như
 * Server Component ở trang pháp lý/hỗ trợ công khai (giữ nguyên chủ đích SEO của
 * `LegalDocumentView`) và vẫn dùng được bên trong cây client của cổng quản lý.
 */
export function LegalDocLinks({
  layout = 'stack',
  exclude,
  newTab = false,
  className,
}: LegalDocLinksProps) {
  const t = useTranslations('Legal');
  const docs = LEGAL_DOC_VALUES.filter((doc) => doc !== exclude);

  return (
    <ul className={cx(styles.list, layout === 'inline' && styles.inline, className)}>
      {docs.map((doc) => (
        <li key={doc}>
          <Link
            href={legalPath.doc(doc)}
            className={styles.link}
            {...(newTab ? { target: '_blank', rel: 'noreferrer' } : {})}
          >
            {t(`docs.${doc}.title` as never)}
          </Link>
        </li>
      ))}
    </ul>
  );
}
