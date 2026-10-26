import { Suspense, type ReactNode } from 'react';
import { AccountPhoneReminderProvider } from '@/features/auth/components/AccountPhoneGate';
import { AuthModal } from '@/features/auth/components/AuthModal';
import { AuthModalProvider, AuthUrlSync } from '@/features/auth/components/AuthModalProvider';
import { FavoriteIntentResumer } from '@/features/favorites/components/FavoriteIntentResumer';
import { MarketHeader } from '@/features/marketplace/components/MarketHeader';
import { MarketFooterSlot } from '@/features/marketplace/components/MarketFooterSlot';
import { MobileTabBar } from '@/features/marketplace/components/MobileTabBar';
import { ZONE } from '@/zones';
import { ZoneProvider } from '@/zones/ZoneProvider';
import styles from './public-layout.module.css';

/**
 * Marketplace công khai.
 *
 * Route group này KHÔNG bọc AppShell: đây là phần cần SEO (screen_spec §6.1 — chuyển sang
 * Next.js chính là để index được xe/gian hàng). Layout là Server Component; Header/Footer/TabBar
 * là client island (đọc user, điều hướng, hoặc dùng `@ant-design/icons`) nhưng đều nhẹ và vẫn
 * render sẵn ra HTML ở server.
 *
 * `AuthModalProvider` bọc cả cây để mọi CTA của khách mở được modal đăng nhập ngay tại trang
 * đang xem. Nó không đọc `useSearchParams` (xem docblock của provider) nên `children` vẫn
 * render tĩnh bình thường; phần đọc URL là `AuthUrlSync`, một leaf được bọc Suspense riêng.
 *
 * `AccountPhoneReminderProvider`: tài khoản khách chưa có SĐT đã xác minh (vừa vào bằng
 * Google/Facebook, hoặc tài khoản cũ) được NHẮC xác minh, đóng được; luồng đặt xe hỏi lại lúc gửi
 * yêu cầu — ADR 0071.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  // Gốc SITE KHÁCH (`xeprime.vn`, realm `customer` — ADR 0051 điều 2).
  return (
    <ZoneProvider zone={ZONE.MARKET}>
      <AuthModalProvider>
        <AccountPhoneReminderProvider>
          <Suspense fallback={null}>
            <AuthUrlSync />
          </Suspense>
          <div className={styles.wrapper}>
            <MarketHeader />
            <main className={styles.main}>{children}</main>
            <MarketFooterSlot />
            <MobileTabBar />
          </div>
          <AuthModal />
          {/* Lượt thích xe bị gián đoạn vì chưa đăng nhập — hoàn tất sau khi có phiên (BRD §5.1.7). */}
          <FavoriteIntentResumer />
        </AccountPhoneReminderProvider>
      </AuthModalProvider>
    </ZoneProvider>
  );
}
