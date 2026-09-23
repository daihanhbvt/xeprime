import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { legalPath } from '@/constants/legal';
import { ROUTES } from '@/constants/routes';
import { ContentSection } from '@/features/content-page/components/ContentSection';
import { FeatureCard } from '@/features/content-page/components/FeatureCard';
import { InfoNote } from '@/features/content-page/components/InfoNote';
import { PageHero } from '@/features/content-page/components/PageHero';
import styles from './page.module.css';

/**
 * Giới thiệu XePrime — đích THẬT của mục "Về Prime" trên thanh điều hướng.
 *
 * Mục đó trỏ về trang chủ cho tới 23/09/2026, tức một mục menu bấm vào thì không đi đâu cả.
 *
 * **Trang này nói gì.** Nó trả lời bốn câu mà trang chủ không trả lời được vì trang chủ bận bán
 * hàng: sàn này là gì, một chuyến thuê diễn ra thế nào, tiền đi đâu, và có xe thì tham gia kiểu
 * nào. Đây cũng là nơi duy nhất mô hình hai tuyến (ADR 0028) được nói bằng ngôn ngữ người dùng.
 *
 * **Không có con số nào ở đây.** Không "10.000 xe", không "5 sao", không tên pháp nhân. Sản
 * phẩm chưa mở, nên mọi con số sẽ là bịa; khối `status` nói thẳng điều đó thay vì im lặng.
 *
 * Server Component thuần: nội dung tĩnh, cần được index, và không có một state nào.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('About');
  return { title: t('meta.title'), description: t('meta.description') };
}

const SERVICES = ['selfDrive', 'withDriver', 'longTerm'] as const;
const STEPS = ['request', 'accept', 'hold', 'trip'] as const;
const MONEY = ['hold', 'pickup', 'lines'] as const;
const TRUST = ['listing', 'calendar', 'metrics'] as const;

export default async function AboutPage() {
  const t = await getTranslations('About');
  const tNav = await getTranslations('Navigation.public');

  return (
    <>
      <PageHero
        width="wide"
        breadcrumb={[{ label: tNav('home'), href: ROUTES.HOME }, { label: t('hero.title') }]}
        eyebrow={t('hero.eyebrow')}
        title={t('hero.title')}
        lead={t('hero.lead')}
      />

      <div className={styles.page}>
        <ContentSection id="about-services" heading={t('services.heading')}>
          <div className={styles.grid3}>
            {SERVICES.map((key) => (
              <FeatureCard
                key={key}
                title={t(`services.${key}.title`)}
                desc={t(`services.${key}.desc`)}
              />
            ))}
          </div>
        </ContentSection>

        {/* Bốn bước đánh số: thứ tự LÀ nội dung ở đây, nên huy hiệu mang số chứ không mang icon. */}
        <ContentSection id="about-how" heading={t('how.heading')} lead={t('how.lead')}>
          <ol className={styles.grid4}>
            {STEPS.map((key, i) => (
              <li key={key}>
                <FeatureCard
                  badge={i + 1}
                  title={t(`how.${key}.title`)}
                  desc={t(`how.${key}.desc`)}
                />
              </li>
            ))}
          </ol>
        </ContentSection>

        <ContentSection id="about-money" heading={t('money.heading')} lead={t('money.lead')}>
          <div className={styles.grid3}>
            {MONEY.map((key) => (
              <FeatureCard
                key={key}
                title={t(`money.${key}.title`)}
                desc={t(`money.${key}.desc`)}
              />
            ))}
          </div>
        </ContentSection>

        <ContentSection id="about-owners" heading={t('owners.heading')} lead={t('owners.lead')}>
          <div className={styles.grid2}>
            <FeatureCard title={t('owners.basic.title')} desc={t('owners.basic.desc')} />
            <FeatureCard title={t('owners.shop.title')} desc={t('owners.shop.desc')} />
          </div>
          <Link href={ROUTES.LIST_YOUR_VEHICLE.ROOT} className={styles.primaryAction}>
            {t('owners.action')}
          </Link>
        </ContentSection>

        <ContentSection id="about-trust" heading={t('trust.heading')}>
          <div className={styles.grid3}>
            {TRUST.map((key) => (
              <FeatureCard
                key={key}
                title={t(`trust.${key}.title`)}
                desc={t(`trust.${key}.desc`)}
              />
            ))}
          </div>
        </ContentSection>

        {/*
          Nói thẳng sản phẩm chưa mở. Cùng lý do với băng bản thảo ở trang pháp lý: một trang
          giới thiệu viết như thể mọi thứ đã chạy là một lời hứa mà sản phẩm chưa giữ được.
        */}
        <InfoNote tone="warning" title={t('status.title')}>
          <p>{t('status.body')}</p>
        </InfoNote>

        <ContentSection id="about-next" heading={t('next.heading')}>
          <div className={styles.grid3}>
            <FeatureCard
              href={ROUTES.SEARCH}
              title={t('next.search')}
              desc={t('next.searchDesc')}
            />
            <FeatureCard
              href={legalPath.index}
              title={t('next.legal')}
              desc={t('next.legalDesc')}
            />
            <FeatureCard
              href={ROUTES.SUPPORT}
              title={t('next.support')}
              desc={t('next.supportDesc')}
            />
          </div>
        </ContentSection>
      </div>
    </>
  );
}
