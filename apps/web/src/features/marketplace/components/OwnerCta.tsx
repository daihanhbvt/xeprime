'use client';

import { ArrowRightOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { ROUTES } from '@/constants/routes';
import styles from './OwnerCta.module.css';

/**
 * CTA mời chủ xe đăng xe cho thuê — nội dung tĩnh, nhưng cần `'use client'` vì dùng
 * `@ant-design/icons` (gọi `React.createContext` nội bộ, không chạy được trong cây Server
 * Component). Nút dẫn vào khu quản lý; người chưa có gian hàng sẽ gặp luồng đăng ký shop ở đó
 * (AppShell tự điều hướng).
 */
export function OwnerCta() {
  return (
    <section className={styles.cta}>
      <span className={styles.glow} aria-hidden="true" />
      <div className={styles.body}>
        <Logo size="sm" tone="light" />
        <h2 className={styles.title}>
          Có xe nhàn rỗi?
          <br />
          Cho thuê trên XePrime.
        </h2>
        <p className={styles.desc}>
          Đăng ô tô hoặc xe máy của bạn lên để khách chủ động liên hệ. Tự quản lý lịch, tự duyệt đơn
          — XePrime lo phần còn lại.
        </p>
        <Link href={ROUTES.MANAGE.ROOT} className={styles.button}>
          Đăng xe cho thuê <ArrowRightOutlined />
        </Link>
      </div>
    </section>
  );
}
