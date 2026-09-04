import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { legalPath } from '@/constants/legal';
import { LegalDocLinks } from '@/features/legal/components/LegalDocLinks';
import styles from './page.module.css';

/**
 * Trung tâm hỗ trợ CÔNG KHAI — không cần đăng nhập.
 *
 * Người đang mắc kẹt giữa chuyến (xe hỏng, không gọi được chủ xe, mất điện thoại đã đăng nhập)
 * là đúng nhóm cần kênh liên hệ nhất và cũng là nhóm ít có khả năng đăng nhập nhất. Vì vậy
 * trang này nằm ngoài tường đăng nhập, khác `/account/support` (hàng đợi ticket của một người,
 * chưa dựng).
 *
 * Quy chế sàn viện dẫn thẳng trang này làm "cơ chế tiếp nhận phản ánh" — đổi đường dẫn là phải
 * sửa cả văn bản.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Support');
  return {
    title: t('title'),
    description: t('subtitle'),
    // Chừng nào số hotline còn là chỗ trống thì trang này KHÔNG được đánh chỉ mục: một trang
    // hỗ trợ đứng trong kết quả tìm kiếm với số điện thoại giả còn tệ hơn không có trang nào.
    // Gỡ dòng này cùng lúc với việc điền kênh liên hệ thật.
    robots: { index: false, follow: true },
  };
}

export default async function SupportPage() {
  const t = await getTranslations('Support');
  const tLegal = await getTranslations('Legal');

  const channels = ['hotline', 'email', 'hours'] as const;
  const checklist = ['tripCode', 'phone', 'evidence', 'expectation'] as const;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.subtitle}>{t('subtitle')}</p>
      </header>

      {/* Cùng lý do với băng bản thảo ở trang pháp lý: số hotline giả mà lọt ra ngoài thì
          người gặp sự cố gọi vào hư không. */}
      <aside className={styles.draft} role="note">
        {t('draftNotice')}
      </aside>

      {/* Cấp cứu đứng TRƯỚC kênh của XePrime: có những việc gọi cho chúng tôi là sai thứ tự. */}
      <section className={styles.emergency} aria-labelledby="xp-support-emergency">
        <h2 id="xp-support-emergency" className={styles.emergencyTitle}>
          {t('emergency.heading')}
        </h2>
        <p className={styles.emergencyBody}>{t('emergency.body')}</p>
      </section>

      <section className={styles.block} aria-labelledby="xp-support-channels">
        <h2 id="xp-support-channels" className={styles.blockTitle}>
          {t('channels.heading')}
        </h2>
        <dl className={styles.channels}>
          {channels.map((key) => (
            <div key={key} className={styles.channel}>
              <dt className={styles.channelLabel}>{t(`channels.${key}.label`)}</dt>
              <dd className={styles.channelValue}>{t(`channels.${key}.value`)}</dd>
              <dd className={styles.channelNote}>{t(`channels.${key}.note`)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.block} aria-labelledby="xp-support-checklist">
        <h2 id="xp-support-checklist" className={styles.blockTitle}>
          {t('beforeContact.heading')}
        </h2>
        <ul className={styles.checklist}>
          {checklist.map((key) => (
            <li key={key}>{t(`beforeContact.${key}`)}</li>
          ))}
        </ul>
      </section>

      <section className={styles.block} aria-labelledby="xp-support-scope">
        <h2 id="xp-support-scope" className={styles.blockTitle}>
          {t('scope.heading')}
        </h2>
        <p className={styles.paragraph}>{t('scope.canDo')}</p>
        <p className={styles.paragraphMuted}>{t('scope.cannotDo')}</p>
      </section>

      <section className={styles.block} aria-labelledby="xp-support-legal">
        <h2 id="xp-support-legal" className={styles.blockTitle}>
          {t('legal.heading')}
        </h2>
        <p className={styles.paragraph}>{t('legal.body')}</p>
        <LegalDocLinks layout="inline" />
        <Link href={legalPath.index} className={styles.legalIndexLink}>
          {tLegal('meta.allDocs')} →
        </Link>
      </section>
    </div>
  );
}
