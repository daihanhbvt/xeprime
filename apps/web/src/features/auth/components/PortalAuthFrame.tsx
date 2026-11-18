'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher';
import { APP_NAME } from '@/constants/app-name';
import styles from './PortalAuthFrame.module.css';

/** Chữ "PARTNER" dưới logo là một phần nhận diện thương hiệu — không dịch. */
const PARTNER_WORDMARK = 'PARTNER';

/**
 * Khung trang đăng nhập · đăng ký · quên mật khẩu của site PARTNER — Figma "Login - Partner/Admin"
 * (Partner-XePrime `24382:23343`): thẻ ảnh bo góc bên trái + linh vật, đường hầm + logo XePrime PARTNER + thẻ giới thiệu, nửa phải cột form
 * (cùng cột form design v2 với hộp tài khoản site khách). Là TRANG chứ không phải popup (ADR 0053).
 * Hẹp hơn tablet ngang: chỉ còn cột form.
 */
export function PortalAuthFrame({
  children,
  topLink,
}: {
  children: ReactNode;
  /** Link nhỏ đầu cột form (vd "Về trang đăng nhập" ở màn quên mật khẩu). */
  topLink?: ReactNode;
}) {
  const t = useTranslations('Auth.portal');

  return (
    <div className={styles.page}>
      <aside className={styles.brand} aria-hidden="true">
        {/* Nền vệt sáng phủ kín thẻ - lấp hai bên khi khung bản vẽ hẹp hơn thẻ. */}
        <Image src="/auth/partner-login-bg.webp" alt="" fill sizes="53vw" className={styles.bg} />
        {/*
          Khung bản vẽ Figma `24382:23344` (1256 × 1040) thu NGUYÊN KHỐI cho vừa thẻ - mọi vị trí và
          cỡ chữ bên trong tính theo bề rộng khung (`cqw`), nên bố cục giữ đúng tỉ lệ bản vẽ ở mọi
          kích thước màn hình thay vì bị cắt. Lớp, dưới lên trên: ảnh đường hầm + xe · ánh vàng neo
          đáy · lưới `color-dodge` 40% (hai lớp sau dùng chung mặt nạ dải dọc `32e67`) · logo · thẻ.
        */}
        <div className={styles.stage}>
          <div className={styles.art}>
            <Image
              src="/auth/partner-login-tunnel.webp"
              alt=""
              fill
              sizes="53vw"
              className={styles.tunnel}
              priority
            />
            <Image
              src="/auth/partner-login-car.webp"
              alt=""
              fill
              sizes="53vw"
              className={styles.car}
            />
            <Image
              src="/auth/partner-login-grid.webp"
              alt=""
              fill
              sizes="53vw"
              className={styles.grid}
            />
            <div className={styles.logoBlock}>
              <Image
                src="/home/logo-gold-app.svg"
                alt={APP_NAME}
                width={414}
                height={130}
                unoptimized
                className={styles.logo}
              />
              <p className={styles.wordmark}>{PARTNER_WORDMARK}</p>
            </div>
            <div className={styles.infoCard}>
              <p className={styles.infoTitle}>{t('brandTitle')}</p>
              <p className={styles.infoBody}>{t('brandBody')}</p>
            </div>
          </div>
        </div>
      </aside>

      <Image
        src="/auth/partner-mascot.webp"
        alt=""
        width={307}
        height={409}
        className={styles.mascot}
        aria-hidden="true"
      />

      <main className={styles.content}>
        <div className={styles.locale}>
          <LocaleSwitcher />
        </div>
        <div className={styles.column}>
          {topLink ? <div className={styles.topLink}>{topLink}</div> : null}
          {children}
        </div>
      </main>
    </div>
  );
}
