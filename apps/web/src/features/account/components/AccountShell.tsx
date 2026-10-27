'use client';

import { useTranslations } from 'next-intl';
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
 *
 * Dải giới thiệu "Tài khoản của tôi" (design Account 22/10/2026) đứng trên MỌI trang của khu, chạy
 * hết bề ngang dưới header chợ. Nó KHÔNG phải tiêu đề: mỗi trang vẫn mang đúng một `h1` của riêng
 * mình (thẻ hồ sơ, "Quản lý thanh toán", "Chuyến của tôi"…) — một `h1` chung ở vỏ sẽ thành hai `h1`
 * trên mỗi trang.
 */
export function AccountShell({ children }: { children: ReactNode }) {
  const t = useTranslations('Account.shell');

  return (
    <CustomerAuthGate>
      {(user) => (
        <>
          <div className={styles.intro}>
            <div className={styles.introInner}>
              <p className={styles.introTitle}>{t('title')}</p>
              <p className={styles.introSubtitle}>{t('subtitle')}</p>
            </div>
          </div>
          <div className={styles.wrap}>
            <div className={styles.body}>
              <aside className={styles.aside}>
                <AccountSidebar user={user} />
              </aside>
              <div className={styles.content}>{children}</div>
            </div>
          </div>
        </>
      )}
    </CustomerAuthGate>
  );
}
