'use client';

import type { ReactNode } from 'react';
import { SupportNavigationScope } from '@/features/tenant-support/components/SupportNavigationScope';
import type { CurrentUser } from '@/hooks/use-current-user';
import { cx } from '@/lib/cx';
import { MobileNav } from './MobileNav';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import styles from './AppShell.module.css';

/**
 * KHUNG giao diện dùng chung cho site partner (`AppShell`) và site quản trị (`AdminShell`) —
 * sidebar, thanh trên, vùng nội dung, thanh tab dưới đáy (ADR 0051 điều 3: "AdminShell dùng lại
 * Sidebar/Topbar, không nhân bản").
 *
 * Khung KHÔNG quyết định ai được vào hay menu nào: hai vỏ gác cổng theo khu của mình rồi mới dựng
 * khung; menu do `useManageNavTree` chọn theo khu (`useZone`) và tuyến.
 *
 * `viewport` — route chiếm trọn chiều cao màn hình (lịch xe, hộp thư): vùng cuộn dọc thuộc về chính
 * màn đó, và thanh tab dưới đáy ẩn đi để màn đó có đáy màn hình.
 *
 * `SupportNavigationScope` bọc sidebar, nội dung và thanh tab: trong phiên hỗ trợ gian hàng (khu
 * admin — ADR 0050 §12) nó chặn mọi link "thoát" khỏi phiên; ngoài phiên nó không làm gì.
 */
export function ShellFrame({
  user,
  viewport = false,
  notices,
  children,
}: {
  user: CurrentUser;
  viewport?: boolean;
  /** Dải thông báo đầu vùng nội dung (trạng thái gian hàng, gói hết hạn…). */
  notices?: ReactNode;
  children: ReactNode;
}) {
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
        {viewport ? null : (
          <SupportNavigationScope>
            <MobileNav />
          </SupportNavigationScope>
        )}
      </div>
    </div>
  );
}
