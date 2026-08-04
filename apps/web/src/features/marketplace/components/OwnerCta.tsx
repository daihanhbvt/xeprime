'use client';

import { ArrowRightOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { resolveOwnerCtaHref } from '@/features/auth/post-auth-destination';
import { useCurrentUser } from '@/hooks/use-current-user';
import styles from './OwnerCta.module.css';

/**
 * CTA mời chủ xe đăng xe cho thuê — ý định làm CHỦ XE tường minh, nên đây là một trong số ít
 * chỗ ở marketplace dẫn thẳng sang cổng quản lý.
 *
 * Đích tuỳ trạng thái: chưa đăng nhập → portal login kèm `intent=owner`; đã đăng nhập mà chưa
 * có gian hàng → onboarding; đã có gian hàng → portal. Trước đây nút này trỏ cứng `/manage` và
 * dựa vào việc AppShell tự bật form tạo shop — chính là cơ chế khiến mọi user vào `/manage` đều
 * bị hỏi mở gian hàng.
 */
export function OwnerCta() {
  const { data: user } = useCurrentUser();

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
        <Link href={resolveOwnerCtaHref(user ?? null)} className={styles.button}>
          Đăng xe cho thuê <ArrowRightOutlined />
        </Link>
      </div>
    </section>
  );
}
