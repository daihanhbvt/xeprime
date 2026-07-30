import type { ReactNode } from 'react';
import { MarketHeader } from '@/features/marketplace/components/MarketHeader';
import { MarketFooter } from '@/features/marketplace/components/MarketFooter';
import { MobileTabBar } from '@/features/marketplace/components/MobileTabBar';
import styles from './public-layout.module.css';

/**
 * Marketplace công khai.
 *
 * Route group này KHÔNG bọc AppShell: đây là phần cần SEO (screen_spec §6.1 — chuyển sang
 * Next.js chính là để index được xe/gian hàng). Layout là Server Component; Header/Footer/TabBar
 * là client island (đọc user, điều hướng, hoặc dùng `@ant-design/icons`) nhưng đều nhẹ và vẫn
 * render sẵn ra HTML ở server.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.wrapper}>
      <MarketHeader />
      <main className={styles.main}>{children}</main>
      <MarketFooter />
      <MobileTabBar />
    </div>
  );
}
