import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LEGAL_DOC_VALUES, LEGAL_EFFECTIVE_FROM, legalPath } from '@/constants/legal';
import { ROUTES } from '@/constants/routes';
import { getAppFormat } from '@/i18n/server-format';
import styles from './page.module.css';

/**
 * Trang chủ của khu pháp lý.
 *
 * Ba lý do nó tồn tại thay vì để `/legal` trả 404:
 *
 *  1. Người ta CẮT URL. Ai đó gửi `/legal/cancellation` rồi người nhận xoá bớt đuôi để xem còn
 *     gì — trả 404 ở đúng chỗ đó là nói rằng sàn không có văn bản nào.
 *  2. Email, hợp đồng và chữ ký cần MỘT địa chỉ để viện dẫn cả bộ, không phải bốn.
 *  3. Nó là nơi duy nhất nói ra thứ mà từng văn bản riêng lẻ không nói: bốn bản này là một bộ,
 *     cùng một ngày hiệu lực, và chỗ để phản ánh là trung tâm hỗ trợ.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Legal');
  const fmt = await getAppFormat();
  return {
    title: t('index.title'),
    description: t('index.subtitle', { date: fmt.dateKey(LEGAL_EFFECTIVE_FROM) }),
    // Cùng lý do với từng văn bản: còn là bản thảo chưa qua rà soát thì không đánh chỉ mục.
    robots: { index: false, follow: true },
  };
}

export default async function LegalIndexPage() {
  const t = await getTranslations('Legal');
  const fmt = await getAppFormat();
  const effectiveFrom = fmt.dateKey(LEGAL_EFFECTIVE_FROM);

  return (
    <div className={styles.page}>
      <aside className={styles.draft} role="note">
        <strong className={styles.draftTitle}>{t('draftBanner.title')}</strong>
        <p className={styles.draftBody}>{t('draftBanner.body')}</p>
      </aside>

      <header className={styles.header}>
        <h1 className={styles.title}>{t('index.title')}</h1>
        <p className={styles.subtitle}>{t('index.subtitle', { date: effectiveFrom })}</p>
      </header>

      {/*
        Danh sách này KHÔNG dùng `LegalDocLinks`: ở đây mỗi văn bản cần cả câu tóm tắt để người
        đọc chọn đúng bản cần, còn `LegalDocLinks` là dải liên kết trần cho những chỗ pháp lý
        chỉ là mục phụ.
      */}
      <ul className={styles.docs}>
        {LEGAL_DOC_VALUES.map((doc) => (
          <li key={doc}>
            <Link href={legalPath.doc(doc)} className={styles.doc}>
              <span className={styles.docTitle}>{t(`docs.${doc}.title` as never)}</span>
              <span className={styles.docSummary}>{t(`docs.${doc}.summary` as never)}</span>
              <span className={styles.docMeta}>
                {t('meta.effectiveFrom', { date: effectiveFrom })}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section className={styles.support} aria-labelledby="xp-legal-support">
        <h2 id="xp-legal-support" className={styles.supportTitle}>
          {t('index.supportHeading')}
        </h2>
        <p className={styles.supportBody}>{t('index.supportBody')}</p>
        <Link href={ROUTES.SUPPORT} className={styles.supportLink}>
          {t('index.supportLink')}
        </Link>
      </section>

      <section className={styles.entity} aria-labelledby="xp-legal-entity">
        <h2 id="xp-legal-entity" className={styles.entityTitle}>
          {t('entity.heading')}
        </h2>
        <p className={styles.entityBody}>{t('entity.body')}</p>
      </section>
    </div>
  );
}
