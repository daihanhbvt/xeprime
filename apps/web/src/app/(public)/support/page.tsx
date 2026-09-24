import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LEGAL_DOC, legalPath } from '@/constants/legal';
import { ROUTES } from '@/constants/routes';
import { ContentSection } from '@/features/content-page/components/ContentSection';
import { FeatureCard } from '@/features/content-page/components/FeatureCard';
import { InfoNote } from '@/features/content-page/components/InfoNote';
import { PageHero } from '@/features/content-page/components/PageHero';
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
 *
 * ── Hai quyết định nội dung ─────────────────────────────────────────────────
 *
 * **Không có ô tìm kiếm.** Một help center thường mở bằng thanh tìm kiếm, nhưng trong repo
 * chưa có một bài trợ giúp nào để tìm — không có bảng bài viết, không có API. Một ô tìm kiếm
 * luôn trả rỗng tệ hơn hẳn việc không có ô nào. Khi có kho bài viết thật thì nó vào đây.
 *
 * **Không hiện số tổng đài giả.** Bó message vẫn giữ `channels.<key>.value` với chỗ trống
 * «điền số hotline» vì màn hỗ trợ của app native đang đọc khoá đó; trang web thì KHÔNG render
 * nó, mà hiện một viên "Sắp công bố" và nói thẳng lý do. Một trang hỗ trợ đăng số điện thoại
 * không gọi được là cái bẫy đúng vào lúc người ta cần nhất.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Support');
  return {
    title: t('title'),
    description: t('subtitle'),
    // Chừng nào kênh liên hệ còn là chỗ trống thì trang này KHÔNG được đánh chỉ mục: một trang
    // hỗ trợ đứng trong kết quả tìm kiếm mà không liên hệ được còn tệ hơn không có trang nào.
    // Gỡ dòng này cùng lúc với việc điền kênh liên hệ thật.
    robots: { index: false, follow: true },
  };
}

const CHANNELS = ['hotline', 'email', 'hours'] as const;
const CHECKLIST = ['tripCode', 'phone', 'evidence', 'expectation'] as const;

export default async function SupportPage() {
  const t = await getTranslations('Support');
  const tNav = await getTranslations('Navigation.public');
  const tLegal = await getTranslations('Legal');

  /*
   * Mọi chủ đề trỏ tới một trang CÓ THẬT trong repo — trang giới thiệu (có neo tới đúng mục),
   * bốn văn bản pháp lý, landing đăng xe và cổng đăng nhập khu làm việc. Không có mục nào dẫn
   * tới một bài viết chưa tồn tại.
   */
  const renterTopics = [
    { key: 'how', href: `${ROUTES.ABOUT}#about-how` },
    { key: 'money', href: `${ROUTES.ABOUT}#about-money` },
    { key: 'cancel', href: legalPath.doc(LEGAL_DOC.CANCELLATION) },
    { key: 'privacy', href: legalPath.doc(LEGAL_DOC.PRIVACY) },
  ] as const;

  const ownerTopics = [
    { key: 'start', href: ROUTES.LIST_YOUR_VEHICLE.ROOT },
    { key: 'rules', href: legalPath.doc(LEGAL_DOC.MARKETPLACE_RULES) },
    { key: 'terms', href: legalPath.doc(LEGAL_DOC.TERMS) },
    { key: 'manage', href: ROUTES.MANAGE.LOGIN },
  ] as const;

  return (
    <>
      <PageHero
        width="wide"
        breadcrumb={[{ label: tNav('home'), href: ROUTES.HOME }, { label: t('title') }]}
        eyebrow={t('eyebrow')}
        title={t('title')}
        lead={t('subtitle')}
      />

      <div className={styles.page}>
        {/* Cấp cứu đứng TRƯỚC kênh của XePrime: có những việc gọi cho chúng tôi là sai thứ tự. */}
        <InfoNote tone="danger" title={t('emergency.heading')}>
          <p>{t('emergency.body')}</p>
        </InfoNote>

        <ContentSection
          id="support-channels"
          heading={t('channels.heading')}
          lead={t('channels.lead')}
        >
          <ul className={styles.channels}>
            {CHANNELS.map((key) => (
              <li key={key} className={styles.channel}>
                <span className={styles.channelLabel}>{t(`channels.${key}.label`)}</span>
                {/*
                  Chỗ đáng lẽ là số điện thoại / email / khung giờ. Hiện một viên trạng thái
                  thay vì `channels.<key>.value` — xem docblock đầu file.
                */}
                <span className={styles.pending}>{t('channels.pendingBadge')}</span>
                <span className={styles.channelNote}>{t(`channels.${key}.note`)}</span>
              </li>
            ))}
          </ul>
          <InfoNote tone="warning" className={styles.pendingNote}>
            <p>{t('channels.pendingNote')}</p>
          </InfoNote>
        </ContentSection>

        <ContentSection id="support-topics" heading={t('topics.heading')} lead={t('topics.lead')}>
          <div className={styles.topicGroup}>
            <h3 className={styles.groupTitle}>{t('topics.renterHeading')}</h3>
            <div className={styles.topics}>
              {renterTopics.map(({ key, href }) => (
                <FeatureCard
                  key={key}
                  href={href}
                  title={t(`topics.${key}.title`)}
                  desc={t(`topics.${key}.desc`)}
                />
              ))}
            </div>
          </div>

          <div className={styles.topicGroup}>
            <h3 className={styles.groupTitle}>{t('topics.ownerHeading')}</h3>
            <div className={styles.topics}>
              {ownerTopics.map(({ key, href }) => (
                <FeatureCard
                  key={key}
                  href={href}
                  title={t(`topics.${key}.title`)}
                  desc={t(`topics.${key}.desc`)}
                />
              ))}
            </div>
          </div>
        </ContentSection>

        <ContentSection id="support-checklist" heading={t('beforeContact.heading')}>
          <ol className={styles.checklist}>
            {CHECKLIST.map((key) => (
              <li key={key} className={styles.checkItem}>
                {t(`beforeContact.${key}`)}
              </li>
            ))}
          </ol>
        </ContentSection>

        {/*
          Hai câu, hai sắc thái: phạm vi LÀM ĐƯỢC đọc như nội dung thường, phạm vi KHÔNG làm
          được có vạch mép trái để người đang bực không lướt qua nó. Không bịa thêm hai tiêu đề
          "chúng tôi làm gì / không làm gì" — bó message chỉ có hai câu này, và chúng tự nói đủ.
        */}
        <ContentSection id="support-scope" heading={t('scope.heading')}>
          <p className={styles.scopeCan}>{t('scope.canDo')}</p>
          <InfoNote tone="info" className={styles.scopeCannot}>
            <p>{t('scope.cannotDo')}</p>
          </InfoNote>
        </ContentSection>

        <ContentSection id="support-legal" heading={t('legal.heading')} lead={t('legal.body')}>
          <LegalDocLinks layout="inline" />
          <p className={styles.allDocs}>
            <Link href={legalPath.index} className={styles.allDocsLink}>
              {tLegal('meta.allDocs')} →
            </Link>
          </p>
        </ContentSection>
      </div>
    </>
  );
}
