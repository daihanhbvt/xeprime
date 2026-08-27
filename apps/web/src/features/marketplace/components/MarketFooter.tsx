'use client';

import {
  AndroidFilled,
  AppleFilled,
  DownOutlined,
  FacebookFilled,
  InstagramOutlined,
  TikTokOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Logo } from '@/components/brand/Logo';
import { FOOTER_COLUMNS } from '../constants';
import styles from './MarketFooter.module.css';

/** Tên mạng xã hội là DANH TỪ RIÊNG — không dịch, và cũng không cần khoá message. */
const SOCIALS = [
  { key: 'facebook', label: 'Facebook', Icon: FacebookFilled },
  { key: 'instagram', label: 'Instagram', Icon: InstagramOutlined },
  { key: 'tiktok', label: 'TikTok', Icon: TikTokOutlined },
];

/**
 * Năm bản quyền lấy khi render — hằng `2026` viết cứng sẽ sai ngay 01/01 năm sau.
 * Truyền dạng CHUỖI: ICU sẽ định dạng số có phân tách nhóm và biến 2026 thành "2.026".
 */
const COPYRIGHT_YEAR = String(new Date().getFullYear());

/**
 * Chân trang marketplace.
 *
 * `'use client'` là bắt buộc vì dùng `@ant-design/icons` (thư viện này gọi `React.createContext`
 * nội bộ — không chạy được trong cây Server Component của Next App Router). Nội dung vẫn được
 * render sẵn thành HTML ở server như mọi Client Component khác, nên không mất SEO.
 *
 * Mobile dùng `<details>` để gập/mở từng nhóm link (accordion không cần thêm state JS); desktop
 * ghi đè CSS cho luôn mở và ẩn mũi tên.
 */
export function MarketFooter() {
  const t = useTranslations('Marketplace.footer');

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandCol}>
          <Logo size="sm" />
          <p className={styles.tagline}>{t('tagline')}</p>
          <div className={styles.socials}>
            {SOCIALS.map(({ key, label, Icon }) => (
              <span key={key} className={styles.social} role="img" aria-label={label}>
                <Icon />
              </span>
            ))}
          </div>
        </div>

        <div className={styles.cols}>
          {FOOTER_COLUMNS.map((col) => {
            const title = t(col.titleKey);
            return (
              <details key={col.key} className={styles.col}>
                <summary className={styles.colTitle}>
                  {title}
                  <DownOutlined className={styles.caret} />
                </summary>
                <nav className={styles.colLinks} aria-label={title}>
                  {col.links.map((link) => (
                    <Link key={link.key} href={link.href} className={styles.link}>
                      {t(link.key)}
                    </Link>
                  ))}
                </nav>
              </details>
            );
          })}

          <details className={styles.col}>
            <summary className={styles.colTitle}>
              {t('apps.title')}
              <DownOutlined className={styles.caret} />
            </summary>
            <div className={styles.colLinks}>
              <span className={styles.store}>
                <AppleFilled />
                <span>
                  <small>{t('apps.downloadOn')}</small>
                  App Store
                </span>
              </span>
              <span className={styles.store}>
                <AndroidFilled />
                <span>
                  <small>{t('apps.downloadOn')}</small>
                  Google Play
                </span>
              </span>
              <span className={styles.storeNote}>{t('apps.note')}</span>
            </div>
          </details>
        </div>
      </div>

      <div className={styles.bottom}>
        <span>{t('copyright', { year: COPYRIGHT_YEAR })}</span>
        <span>{t('country')}</span>
      </div>
    </footer>
  );
}
