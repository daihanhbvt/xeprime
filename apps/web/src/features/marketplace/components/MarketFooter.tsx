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
import { Logo } from '@/components/brand/Logo';
import { FOOTER_COLUMNS } from '../constants';
import styles from './MarketFooter.module.css';

const SOCIALS = [
  { key: 'facebook', label: 'Facebook', Icon: FacebookFilled },
  { key: 'instagram', label: 'Instagram', Icon: InstagramOutlined },
  { key: 'tiktok', label: 'TikTok', Icon: TikTokOutlined },
];

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
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandCol}>
          <Logo size="sm" />
          <p className={styles.tagline}>
            XePrime là nền tảng kết nối chủ xe và người thuê xe trên toàn quốc. Thuê xe dễ dàng, an
            toàn và minh bạch.
          </p>
          <div className={styles.socials}>
            {SOCIALS.map(({ key, label, Icon }) => (
              <span key={key} className={styles.social} role="img" aria-label={label}>
                <Icon />
              </span>
            ))}
          </div>
        </div>

        <div className={styles.cols}>
          {FOOTER_COLUMNS.map((col) => (
            <details key={col.title} className={styles.col}>
              <summary className={styles.colTitle}>
                {col.title}
                <DownOutlined className={styles.caret} />
              </summary>
              <nav className={styles.colLinks} aria-label={col.title}>
                {col.links.map((link) => (
                  <Link key={link.label} href={link.href} className={styles.link}>
                    {link.label}
                  </Link>
                ))}
              </nav>
            </details>
          ))}

          <details className={styles.col}>
            <summary className={styles.colTitle}>
              Tải ứng dụng
              <DownOutlined className={styles.caret} />
            </summary>
            <div className={styles.colLinks}>
              <span className={styles.store}>
                <AppleFilled />
                <span>
                  <small>Tải trên</small>
                  App Store
                </span>
              </span>
              <span className={styles.store}>
                <AndroidFilled />
                <span>
                  <small>Tải trên</small>
                  Google Play
                </span>
              </span>
              <span className={styles.storeNote}>Ứng dụng đang phát triển</span>
            </div>
          </details>
        </div>
      </div>

      <div className={styles.bottom}>
        <span>© 2026 XePrime. All rights reserved.</span>
        <span>Nền tảng cho thuê xe tại Việt Nam</span>
      </div>
    </footer>
  );
}
