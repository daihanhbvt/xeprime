import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LEGAL_DOC_VALUES, legalPath, type LegalDoc } from '@/constants/legal';
import styles from './LegalDocPager.module.css';

export interface LegalDocPagerProps {
  readonly current: LegalDoc;
}

/**
 * Điều hướng "văn bản trước / văn bản tiếp theo" ở cuối một văn bản pháp lý.
 *
 * **Vì sao thay cho danh sách "văn bản liên quan".** Bốn văn bản là MỘT BỘ đọc theo thứ tự —
 * điều khoản → bảo mật → quy chế sàn → huỷ/hoàn tiền. Người đọc hết một bản thường muốn đọc
 * bản kế, và một dải bốn liên kết bằng nhau bắt họ tự nhớ mình vừa đọc cái nào. Cặp trước/sau
 * trả lời đúng câu hỏi đó, và nó cũng là thứ chân trang KHÔNG làm được (chân trang không biết
 * người ta đang đọc gì).
 *
 * Thứ tự lấy thẳng từ `LEGAL_DOC_VALUES` — cùng nguồn với mục lục, bộ chuyển ở cột bên và trang
 * chủ khu pháp lý, nên thêm một văn bản thứ năm không phải sửa ở đây.
 *
 * Văn bản đầu không có "trước", văn bản cuối không có "sau": ô tương ứng bỏ trống chứ không
 * render một liên kết chết hay một nút mờ bấm không được.
 */
export function LegalDocPager({ current }: LegalDocPagerProps) {
  const t = useTranslations('Legal');
  const index = LEGAL_DOC_VALUES.indexOf(current);
  const prev = index > 0 ? LEGAL_DOC_VALUES[index - 1] : undefined;
  const next =
    index >= 0 && index < LEGAL_DOC_VALUES.length - 1 ? LEGAL_DOC_VALUES[index + 1] : undefined;

  if (!prev && !next) return null;

  return (
    <nav className={styles.pager} aria-label={t('meta.related')}>
      {prev ? (
        <Link href={legalPath.doc(prev)} className={styles.item}>
          <span className={styles.direction}>
            <span className={styles.arrowPrev} aria-hidden="true" />
            {t('meta.prevDoc')}
          </span>
          <span className={styles.title}>{t(`docs.${prev}.title` as never)}</span>
        </Link>
      ) : (
        /* Giữ ô trống để ô "tiếp theo" vẫn nằm đúng mép phải trên lưới hai cột. */
        <span aria-hidden="true" />
      )}

      {next && (
        <Link href={legalPath.doc(next)} className={`${styles.item} ${styles.itemNext}`}>
          <span className={styles.direction}>
            {t('meta.nextDoc')}
            <span className={styles.arrowNext} aria-hidden="true" />
          </span>
          <span className={styles.title}>{t(`docs.${next}.title` as never)}</span>
        </Link>
      )}
    </nav>
  );
}
