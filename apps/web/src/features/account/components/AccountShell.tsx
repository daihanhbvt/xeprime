'use client';

import type { ReactNode } from 'react';

import { AccountSidebar } from './AccountSidebar';
import { CustomerAuthGate } from './CustomerAuthGate';
import styles from './AccountShell.module.css';

/**
 * Vỏ chung của khu `/account` (và `/trips`, được bọc cùng vỏ) của SITE KHÁCH — menu trái và **cổng
 * đăng nhập đặt ĐÚNG MỘT LẦN**: mỗi trang tự gác là từng ấy bản sao của cùng một luồng bảo mật, và
 * chỉ cần một trang quên là lộ khung trang cho người chưa đăng nhập.
 *
 * Từ ADR 0053 khu này CHỈ phục vụ tài khoản khách: phiên ở đây luôn là phiên realm `customer` (cookie
 * của site khách), nên không còn nhánh "tài khoản gian hàng mở nhầm khu khách" phải chuyển hướng —
 * tài khoản đối tác không có phiên ở site này. Owner Lite đã sang site partner.
 *
 * Cổng đăng nhập là `CustomerAuthGate` — dùng chung với trang thanh toán `/payment/:id`.
 */
export function AccountShell({ children }: { children: ReactNode }) {
  return (
    <CustomerAuthGate>
      {(user) => (
        <div className={styles.wrap}>
          <div className={styles.body}>
            <aside className={styles.aside}>
              <AccountSidebar user={user} />
            </aside>
            <div className={styles.content}>{children}</div>
          </div>
        </div>
      )}
    </CustomerAuthGate>
  );
}
