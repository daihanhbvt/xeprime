'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useLocaleChoice } from '@/components/i18n/locale-menu';
import { APP_NAME } from '@/constants/app-name';
import { ROUTES } from '@/constants/routes';
import { AppStoreQr } from '@/features/content-page/components/AppStoreQr';
import { SUPPORTED_LOCALES } from '@/i18n/config';
import { isActivePath } from '@/lib/active-path';
import { cx } from '@/lib/cx';
import { useTheme } from '@/lib/theme';
import { FOOTER_COLUMNS, FOOTER_SERVICE_LINKS } from '../constants';
import styles from './MarketFooter.module.css';

/**
 * Bốn mạng xã hội của bản vẽ. Tên là DANH TỪ RIÊNG — không dịch, không cần khoá message.
 *
 * KHÔNG phải liên kết: XePrime chưa công bố kênh chính thức nào. Biểu tượng không bắt sự kiện,
 * không con trỏ bàn tay — thay vì bốn nút trông bấm được mà bấm không đi đâu.
 */
const SOCIALS = [
  { key: 'facebook', label: 'Facebook' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'twitter', label: 'X (Twitter)' },
  { key: 'tiktok', label: 'TikTok' },
] as const;

/**
 * Năm bản quyền lấy khi render — hằng `2026` viết cứng sẽ sai ngay 01/01 năm sau.
 * Truyền dạng CHUỖI: ICU sẽ định dạng số có phân tách nhóm và biến 2026 thành "2.026".
 */
const COPYRIGHT_YEAR = String(new Date().getFullYear());

/**
 * Chân trang marketplace — design v2 (Figma "Footer" PC, ADR 0062).
 *
 *     ┌──────────────┬────────────────────────────────────────────────────────┐
 *     │ logo         │ Khám phá · Về XePrime · Pháp lý · Ứng dụng XePrime (QR) │
 *     │ tagline      │                                                        │
 *     │ ● ● ● ●      │                                                        │
 *     ├──────────────┴────────────────────────────────────────────────────────┤
 *     │ © năm XePrime Co., Ltd. …                                    VI | EN  │
 *     └───────────────────────────────────────────────────────────────────────┘
 *
 * So với bản trước: không còn dải mời đăng xe (trang chủ đã có khối "Đăng ký trở thành đối tác",
 * header có nút "Trở thành chủ xe") và không còn nút lên đầu trang. Đổi ngôn ngữ là hai chữ
 * VI | EN ở góc phải — bộ đổi THẬT (Server Action ghi cookie `XP_LOCALE`, ADR 0012), và là chỗ
 * duy nhất khách CHƯA đăng nhập đổi được ngôn ngữ vì header v2 không còn nút riêng.
 *
 * `'use client'` vì `useLocaleChoice`, `usePathname` và `QRCode` của AntD. Nội dung vẫn render sẵn
 * ra HTML ở server nên mọi liên kết vẫn nằm trong HTML tĩnh cho bot đọc.
 *
 * **Mọi liên kết trỏ tới một trang CÓ THẬT** — khoá ở `constants/legal.test.ts`.
 */
export function MarketFooter() {
  const t = useTranslations('Marketplace.footer');
  const tService = useTranslations('HomeSearch.service');
  const tLocale = useTranslations('Common.locale');
  const pathname = usePathname();
  const localeChoice = useLocaleChoice();
  const { theme } = useTheme();
  const footerLogoSrc =
    theme === 'dark' ? '/home/logo-gold-footer-dark.svg' : '/home/logo-gold-footer.svg';

  /*
   * Mục ĐANG XEM: chữ vàng + `aria-current="page"`. Ba mục dịch vụ (`/search?serviceType=…`)
   * không bao giờ sáng — xem `isActivePath`.
   */
  const linkProps = (href: string) => {
    const current = isActivePath(pathname, href);
    return {
      className: cx(styles.link, current && styles.linkActive),
      'aria-current': current ? ('page' as const) : undefined,
    };
  };

  return (
    <footer className={styles.footer}>
      {/* Vệt sáng mờ ngang chân trang — ảnh xem trước app xoay ngang, hoà sáng (screen). */}
      <span className={styles.glow} aria-hidden="true">
        <span className={styles.glowInner}>
          <span className={styles.glowCrop}>
            <Image
              src="/home/app-preview-blur.webp"
              alt=""
              fill
              sizes="1600px"
              className={styles.fill}
            />
          </span>
        </span>
      </span>

      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.about}>
            <Link href={ROUTES.HOME} className={styles.brand} aria-label={APP_NAME}>
              <Image
                src={footerLogoSrc}
                alt=""
                width={167}
                height={52}
                unoptimized
                className={styles.logo}
              />
            </Link>
            <p className={styles.tagline}>{t('tagline')}</p>
            <div className={styles.socials} role="group" aria-label={t('socialsLabel')}>
              {SOCIALS.map(({ key, label }) => (
                <Image
                  key={key}
                  src={`/home/social-${key}.svg`}
                  alt={label}
                  width={20}
                  height={20}
                  unoptimized
                  className={styles.social}
                />
              ))}
            </div>
          </div>

          <div className={styles.columns}>
            {/*
              Cột dịch vụ dựng riêng chứ không nhét vào `FOOTER_COLUMNS`: nhãn của nó đến từ
              namespace KHÁC (`HomeSearch.service`, dùng chung với tab tìm kiếm trang chủ).
            */}
            <nav className={styles.col} aria-labelledby="xp-footer-explore">
              <h2 id="xp-footer-explore" className={styles.colTitle}>
                {t('columns.explore.title')}
              </h2>
              <ul className={styles.colLinks}>
                {FOOTER_SERVICE_LINKS.map((link) => (
                  <li key={link.key}>
                    <Link href={link.href} className={styles.link}>
                      {tService(link.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            {FOOTER_COLUMNS.map((col) => (
              <nav key={col.key} className={styles.col} aria-labelledby={`xp-footer-${col.key}`}>
                <h2 id={`xp-footer-${col.key}`} className={styles.colTitle}>
                  {t(col.titleKey)}
                </h2>
                <ul className={styles.colLinks}>
                  {col.links.map((link) => (
                    <li key={link.key}>
                      <Link href={link.href} {...linkProps(link.href)}>
                        {t(link.key)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}

            {/*
              Cụm mã QR dùng CHUNG với trang `/app` (`AppStoreQr`): khi app lên store thì chỉ có một
              chỗ phải sửa (`APP_DOWNLOAD_QR`).
            */}
            <section className={styles.col} aria-labelledby="xp-footer-apps">
              <h2 id="xp-footer-apps" className={styles.colTitle}>
                {t('apps.heading')}
              </h2>
              <AppStoreQr size={88} variant="footer" />
            </section>
          </div>
        </div>

        <div className={styles.bottom}>
          <p className={styles.copyright}>
            {t.rich('copyrightCompany', {
              year: COPYRIGHT_YEAR,
              brand: (chunks) => <span className={styles.copyrightBrand}>{chunks}</span>,
            })}
          </p>

          <div className={styles.locales} role="group" aria-label={t('localeLabel')}>
            {SUPPORTED_LOCALES.map((value, index) => (
              <span key={value} className={styles.localeItem}>
                {index > 0 ? <span className={styles.localeDivider} aria-hidden="true" /> : null}
                <button
                  type="button"
                  className={cx(
                    styles.localeButton,
                    value === localeChoice.locale && styles.localeActive,
                  )}
                  aria-pressed={value === localeChoice.locale}
                  title={tLocale(value)}
                  disabled={localeChoice.pending}
                  onClick={() => localeChoice.choose(value)}
                >
                  {tLocale(`${value}Short`)}
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
