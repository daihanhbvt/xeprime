import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ROUTES } from '@/constants/routes';
import { ContentSection } from '@/features/content-page/components/ContentSection';
import { FeatureCard } from '@/features/content-page/components/FeatureCard';
import { InfoNote } from '@/features/content-page/components/InfoNote';
import { PageHero } from '@/features/content-page/components/PageHero';
import { AppStoreQr } from '@/features/content-page/components/AppStoreQr';
import { APP_PREVIEW_SCREENS } from '@/features/content-page/app-preview';
import styles from './page.module.css';

/**
 * Giới thiệu ỨNG DỤNG di động — đích của mục "Tải ứng dụng" ở chân trang.
 *
 * **Vì sao tách khỏi chân trang.** Chân trang chỉ còn đủ chỗ cho hai mã QR và một câu; mọi thứ
 * đáng nói về app (làm được gì, trông ra sao, bao giờ có) phải có một trang. Khi app lên store
 * thì đây là trang mang link store, nên chân trang chỉ cần trỏ đúng một chỗ và không phải sửa.
 *
 * **Ảnh là ẢNH MINH HOẠ TẠM.** Ba file SVG ở `public/app/` là phác thảo khối, không phải ảnh
 * chụp màn hình thật — app chưa phát hành nên chưa có gì để chụp. Chúng cố ý không chứa chữ
 * nào (khỏi phải dịch, và khỏi giả vờ là giao diện thật), và `preview.note` nói rõ điều đó ngay
 * dưới lưới ảnh. Thay bằng ảnh thật: ghi đè ba file, giữ tỉ lệ 390×844.
 *
 * Server Component thuần trừ `AppStoreQr` — `QRCode` của AntD phải chạy ở client.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('AppPromo');
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    // App chưa phát hành: một trang "tải ứng dụng" đứng trong kết quả tìm kiếm mà không tải
    // được gì là một lời hứa sai. Gỡ dòng này cùng lúc với khi có link store thật.
    robots: { index: false, follow: true },
  };
}

const FEATURES = ['notify', 'chat', 'handover', 'host'] as const;

export default async function AppPromoPage() {
  const t = await getTranslations('AppPromo');
  const tNav = await getTranslations('Navigation.public');

  return (
    <>
      <PageHero
        width="wide"
        breadcrumb={[{ label: tNav('home'), href: ROUTES.HOME }, { label: t('hero.title') }]}
        eyebrow={t('hero.eyebrow')}
        title={t('hero.title')}
        lead={t('hero.lead')}
        meta={t('hero.status')}
      />

      <div className={styles.page}>
        {/* ─── Ảnh minh hoạ trong khung điện thoại ────────────────────────── */}
        <ContentSection id="app-preview" heading={t('preview.heading')}>
          <ul className={styles.screens}>
            {APP_PREVIEW_SCREENS.map((screen) => (
              <li key={screen.key} className={styles.screen}>
                <div className={styles.phone}>
                  {/*
                    Khung máy vẽ bằng CSS, ảnh nằm trong. `priority={false}` là mặc định: ba
                    ảnh này nằm dưới nếp gấp trên gần như mọi màn hình.
                  */}
                  <Image
                    src={screen.src}
                    alt=""
                    aria-hidden="true"
                    width={390}
                    height={844}
                    className={styles.phoneImage}
                  />
                </div>
                <h3 className={styles.screenTitle}>{t(`preview.${screen.key}.title`)}</h3>
                <p className={styles.screenDesc}>{t(`preview.${screen.key}.desc`)}</p>
              </li>
            ))}
          </ul>
          <p className={styles.previewNote}>{t('preview.note')}</p>
        </ContentSection>

        {/* ─── Ứng dụng làm được gì ───────────────────────────────────────── */}
        <ContentSection id="app-features" heading={t('features.heading')}>
          <div className={styles.featureGrid}>
            {FEATURES.map((key) => (
              <FeatureCard
                key={key}
                title={t(`features.${key}.title`)}
                desc={t(`features.${key}.desc`)}
              />
            ))}
          </div>
        </ContentSection>

        {/* ─── Tải ứng dụng ───────────────────────────────────────────────── */}
        <ContentSection id="app-download" heading={t('download.heading')}>
          <div className={styles.download}>
            <div className={styles.downloadCopy}>
              <p className={styles.downloadBody}>{t('download.body')}</p>
              <p className={styles.scanHint}>{t('download.scanHint')}</p>
            </div>
            <AppStoreQr size={116} tone="light" />
          </div>
        </ContentSection>

        {/* Không có app thì vẫn dùng được web — nói ra thay vì để người đọc tự đoán. */}
        <InfoNote tone="info" title={t('web.heading')}>
          <p>{t('web.body')}</p>
          <p>
            <Link href={ROUTES.SEARCH} className={styles.webLink}>
              {t('web.action')} →
            </Link>
          </p>
        </InfoNote>
      </div>
    </>
  );
}
