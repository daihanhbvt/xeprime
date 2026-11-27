import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LEGAL_DOC_GROUPS, LEGAL_EFFECTIVE_FROM, legalDocsFor, legalPath } from '@/constants/legal';
import { ROUTES } from '@/constants/routes';
import { ContentSection } from '@/features/content-page/components/ContentSection';
import { FeatureCard } from '@/features/content-page/components/FeatureCard';
import { PageHero } from '@/features/content-page/components/PageHero';
import { getAppFormat } from '@/i18n/server-format';
import { isCustomerAppWebView } from '@/lib/in-app-webview';
import styles from './page.module.css';

/**
 * Trang chủ của khu pháp lý.
 *
 * Ba lý do nó tồn tại thay vì để `/legal` trả 404:
 *
 *  1. Người ta CẮT URL. Ai đó gửi `/legal/cancellation` rồi người nhận xoá bớt đuôi để xem còn
 *     gì — trả 404 ở đúng chỗ đó là nói rằng sàn không có văn bản nào.
 *  2. Email, hợp đồng và chữ ký cần MỘT địa chỉ để viện dẫn cả bộ, không phải bốn.
 *  3. Nó là nơi duy nhất nói ra thứ mà từng văn bản riêng lẻ không nói: các bản này là một bộ,
 *     cùng một ngày hiệu lực, và chỗ để phản ánh là trung tâm hỗ trợ.
 *
 * Văn bản chia KHỐI theo người đọc (`LEGAL_DOC_GROUPS`): áp dụng cho mọi người · khi thuê xe ·
 * dành cho chủ xe — người thuê tìm chính sách huỷ không phải lội qua chính sách thuế. WebView của
 * app khách bỏ văn bản chỉ-web (điều kiện gói).
 *
 * Dùng chung `PageHero` / `ContentSection` / `FeatureCard` với trang giới thiệu, trang ứng dụng
 * và trung tâm trợ giúp — bốn khu này người dùng đi qua lại liên tục, nên chúng phải là MỘT hệ.
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
  const tNav = await getTranslations('Navigation.public');
  const fmt = await getAppFormat();
  const effectiveFrom = fmt.dateKey(LEGAL_EFFECTIVE_FROM);
  const visible = new Set(legalDocsFor({ inCustomerApp: await isCustomerAppWebView() }));
  const groups = LEGAL_DOC_GROUPS.map((g) => ({
    ...g,
    docs: g.docs.filter((doc) => visible.has(doc)),
  })).filter((g) => g.docs.length > 0);

  return (
    <>
      <PageHero
        breadcrumb={[{ label: tNav('home'), href: ROUTES.HOME }, { label: t('index.title') }]}
        eyebrow={t('meta.eyebrow')}
        title={t('index.title')}
        lead={t('index.subtitle', { date: effectiveFrom })}
        meta={t('meta.effectiveFrom', { date: effectiveFrom })}
      />

      <div className={styles.page}>
        {/*
          Danh sách này KHÔNG dùng `LegalDocLinks`: ở đây mỗi văn bản cần cả câu tóm tắt để
          người đọc chọn đúng bản cần, còn `LegalDocLinks` là dải liên kết trần cho những chỗ
          pháp lý chỉ là mục phụ.
        */}
        {groups.map((group) => (
          <ContentSection
            key={group.group}
            id={`legal-${group.group}`}
            heading={t(`index.groups.${group.group}.title`)}
            lead={t(`index.groups.${group.group}.desc`)}
          >
            <div className={styles.docs}>
              {group.docs.map((doc) => (
                <FeatureCard
                  key={doc}
                  href={legalPath.doc(doc)}
                  title={t(`docs.${doc}.title` as never)}
                  desc={t(`docs.${doc}.summary` as never)}
                />
              ))}
            </div>
          </ContentSection>
        ))}

        <ContentSection id="legal-support" heading={t('index.supportHeading')}>
          <div className={styles.notes}>
            <FeatureCard
              href={ROUTES.SUPPORT}
              title={t('index.supportLink')}
              desc={t('index.supportBody')}
            />
            <FeatureCard title={t('entity.heading')} desc={t('entity.body')} />
          </div>
        </ContentSection>
      </div>
    </>
  );
}
