'use client';

import Link from 'next/link';
import { resolveOwnerCtaHref } from '@/features/auth/post-auth-destination';
import { useCurrentUser } from '@/hooks/use-current-user';
import styles from './OwnerCta.module.css';

/**
 * CTA mời chủ xe — Figma `18:4`: DẢI sáng nền cát, tiêu đề + một dòng mô tả bên trái, nút viền
 * "Tìm hiểu thêm" bên phải (bản trước là khối tối cả logo — không đúng thiết kế đã duyệt).
 *
 * Đích tuỳ trạng thái đăng nhập/gian hàng — logic đó nằm ở `resolveOwnerCtaHref`, giữ nguyên.
 */
export function OwnerCta() {
  const { data: user } = useCurrentUser();

  return (
    <section className={styles.cta} aria-labelledby="owner-cta-title">
      <div className={styles.body}>
        <h2 id="owner-cta-title" className={styles.title}>
          Đăng xe cho thuê
        </h2>
        <p className={styles.desc}>
          Bạn có xe nhàn rỗi? Tạo thu nhập thụ động từ xe của bạn trên XePrime.
        </p>
      </div>
      <Link href={resolveOwnerCtaHref(user ?? null)} className={styles.button}>
        Tìm hiểu thêm
      </Link>
    </section>
  );
}
