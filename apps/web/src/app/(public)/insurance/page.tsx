import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { insuranceCoverageItems } from '@xeprime/domain';
import { INSURANCE_PRODUCT_KIND, VEHICLE_TYPE } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { ContentSection } from '@/features/content-page/components/ContentSection';
import { FeatureCard } from '@/features/content-page/components/FeatureCard';
import { PageHero } from '@/features/content-page/components/PageHero';
import { fetchPublicInsuranceProductsServer } from '@/features/insurance/api';
import { getAppFormat } from '@/i18n/server-format';
import { getServerLocale } from '@/i18n/locale';
import { openGraphFor } from '@/lib/seo';
import styles from './page.module.css';

/**
 * Quyền lợi bảo hiểm vật chất xe — ADR 0091 điều 8.
 *
 * Trang công khai khách mở từ ô bảo hiểm ở trang đặt xe: quyền lợi, mức khấu trừ, AI chịu khấu trừ
 * (khách thuê), hotline bồi thường. Quyền lợi/khấu trừ/hotline đọc từ danh mục sản phẩm admin quản
 * lý — không con số nào viết cứng ở đây; danh mục chưa tải được thì trang vẫn nói đủ luật chung.
 *
 * Server Component thuần: nội dung gần như tĩnh và cần được index.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Insurance.info');
  const title = t('meta.title');
  const description = t('meta.description');
  return {
    title,
    description,
    alternates: { canonical: ROUTES.INSURANCE },
    openGraph: openGraphFor({ title, description, path: ROUTES.INSURANCE }),
  };
}

const RULES = ['scope', 'coverage', 'cancel', 'unissued'] as const;
const CLAIM_STEPS = ['safety', 'hotline', 'owner'] as const;

export default async function InsurancePage() {
  const t = await getTranslations('Insurance.info');
  const tNav = await getTranslations('Navigation.public');
  const locale = await getServerLocale();
  const fmt = await getAppFormat();
  const products = await fetchPublicInsuranceProductsServer(VEHICLE_TYPE.CAR);
  const product = products.find((p) => p.kind === INSURANCE_PRODUCT_KIND.VEHICLE_TRIP) ?? null;
  const name = product ? (locale === 'en' ? product.nameEn : product.nameVi) : null;
  const coverage = product ? (locale === 'en' ? product.coverageEn : product.coverageVi) : null;
  const payoutNote = product
    ? ((locale === 'en' ? product.maxPayoutNoteEn : product.maxPayoutNoteVi) ?? null)
    : null;

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
        {product ? (
          <ContentSection id="insurance-benefits" heading={name ?? t('benefits.heading')}>
            <dl className={styles.facts}>
              <div className={styles.fact}>
                <dt>{t('benefits.coverage')}</dt>
                <dd>
                  {/* Mỗi dòng phạm vi là một mục (admin sửa dạng danh sách). */}
                  <ul className={styles.coverageList}>
                    {insuranceCoverageItems(coverage).map((item, index) => (
                      <li key={`${index}-${item}`}>{item}</li>
                    ))}
                  </ul>
                </dd>
              </div>
              <div className={styles.fact}>
                <dt>{t('benefits.deductible')}</dt>
                <dd>
                  {product.deductibleAmount
                    ? t('benefits.deductibleValue', { amount: fmt.money(product.deductibleAmount) })
                    : t('benefits.noDeductible')}
                </dd>
              </div>
              {product.maxPayoutAmount || payoutNote ? (
                <div className={styles.fact}>
                  <dt>{t('benefits.maxPayout')}</dt>
                  <dd>
                    {product.maxPayoutAmount ? fmt.money(product.maxPayoutAmount) : null}
                    {product.maxPayoutAmount && payoutNote ? ' - ' : null}
                    {payoutNote}
                  </dd>
                </div>
              ) : null}
              {product.claimHotline ? (
                <div className={styles.fact}>
                  <dt>{t('benefits.hotline')}</dt>
                  <dd>
                    <a href={`tel:${product.claimHotline.replace(/\s/g, '')}`}>
                      {product.claimHotline}
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
          </ContentSection>
        ) : null}

        <ContentSection id="insurance-deductible" heading={t('deductible.heading')}>
          <p className={styles.lead}>{t('deductible.body')}</p>
        </ContentSection>

        <ContentSection id="insurance-rules" heading={t('rules.heading')}>
          <div className={styles.grid3}>
            {RULES.map((key) => (
              <FeatureCard
                key={key}
                title={t(`rules.${key}.title`)}
                desc={t(`rules.${key}.desc`)}
              />
            ))}
          </div>
        </ContentSection>

        <ContentSection id="insurance-claim" heading={t('claim.heading')}>
          <ol className={styles.grid3}>
            {CLAIM_STEPS.map((key, i) => (
              <li key={key}>
                <FeatureCard
                  badge={i + 1}
                  title={t(`claim.${key}.title`)}
                  desc={t(`claim.${key}.desc`)}
                />
              </li>
            ))}
          </ol>
        </ContentSection>
      </div>
    </>
  );
}
