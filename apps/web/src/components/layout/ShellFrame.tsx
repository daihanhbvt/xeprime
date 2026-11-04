'use client';

import type { ReactNode } from 'react';
import { SupportNavigationScope } from '@/features/tenant-support/components/SupportNavigationScope';
import type { CurrentUser } from '@/hooks/use-current-user';
import { cx } from '@/lib/cx';
import { MobileNav } from './MobileNav';
import { PageTitleProvider } from './page-title-context';
import { PartnerBreadcrumb } from './PartnerBreadcrumb';
import { PartnerHeader } from './PartnerHeader';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import styles from './AppShell.module.css';

/** `sidebar` — site quản trị (kể cả phiên hỗ trợ gian hàng). `topnav` — site partner. */
export type ShellLayout = 'sidebar' | 'topnav';

/**
 * KHUNG giao diện dùng chung cho site partner (`AppShell`) và site quản trị (`AdminShell`) — vùng
 * nội dung, thanh tab dưới đáy và drawer menu mobile (ADR 0051 điều 3: "AdminShell dùng lại
 * Sidebar/Topbar, không nhân bản").
 *
 * Hai bố cục, một cây menu (`useManageNavTree`):
 *  - `sidebar` — sidebar trái + thanh trên (`Topbar`). Site quản trị, chờ design riêng.
 *  - `topnav` — header menu ngang của design Partner-XePrime (`PartnerHeader`, 02/11/2026) + dải
 *    breadcrumb ở trang con, nội dung canh cùng cột 1560px với header.
 * Dưới 1024px cả hai cùng dùng thanh tab dưới đáy + drawer (`MobileNav`).
 *
 * Khung KHÔNG quyết định ai được vào hay menu nào: hai vỏ gác cổng theo khu của mình rồi mới dựng
 * khung; menu do `useManageNavTree` chọn theo khu (`useZone`) và tuyến.
 *
 * `viewport` — route chiếm trọn chiều cao màn hình (lịch xe, hộp thư): vùng cuộn dọc thuộc về chính
 * màn đó, và thanh tab dưới đáy ẩn đi để màn đó có đáy màn hình.
 *
 * `SupportNavigationScope` bọc menu, nội dung và thanh tab: trong phiên hỗ trợ gian hàng (khu
 * admin — ADR 0050 §12) nó chặn mọi link "thoát" khỏi phiên; ngoài phiên nó không làm gì.
 */
export function ShellFrame({
  user,
  layout = 'sidebar',
  viewport = false,
  notices,
  children,
}: {
  user: CurrentUser;
  layout?: ShellLayout;
  viewport?: boolean;
  /** Dải thông báo đầu vùng nội dung (trạng thái gian hàng, gói hết hạn…). */
  notices?: ReactNode;
  children: ReactNode;
}) {
  const mobileNav = viewport ? null : (
    <SupportNavigationScope>
      <MobileNav />
    </SupportNavigationScope>
  );

  if (layout === 'topnav') {
    return (
      <PageTitleProvider>
        <div className={cx(styles.shell, styles.shellTopnav, viewport && styles.shellViewport)}>
          <div className={styles.main}>
            <PartnerHeader user={user} />
            <PartnerBreadcrumb />
            <main
              className={cx(
                styles.content,
                styles.contentTopnav,
                viewport && styles.contentViewport,
              )}
            >
              {notices}
              {children}
            </main>
            {mobileNav}
          </div>
        </div>
      </PageTitleProvider>
    );
  }

  return (
    <div className={cx(styles.shell, viewport && styles.shellViewport)}>
      <SupportNavigationScope>
        <Sidebar />
      </SupportNavigationScope>
      <div className={styles.main}>
        <Topbar user={user} />
        <main className={cx(styles.content, viewport && styles.contentViewport)}>
          <SupportNavigationScope>
            {notices}
            {children}
          </SupportNavigationScope>
        </main>
        {mobileNav}
      </div>
    </div>
  );
}
