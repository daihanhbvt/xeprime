import Link from 'next/link';
import { ROUTES } from '@/constants/routes';

/**
 * Server Component — không có 'use client'.
 *
 * Marketplace là phần cần SEO, nên trang này phải render được trên server. Thêm hook hay
 * state vào đây là mất lợi ích chính của việc chọn App Router (screen_spec §6.1).
 */
export default function MarketplacePage() {
  return (
    <section>
      <h1>XePrime</h1>
      <p>Marketplace thuê xe — sẽ implement ở Phase 3.</p>
      <p>
        <Link href={ROUTES.LOGIN}>Đăng nhập</Link> ·{' '}
        <Link href={ROUTES.MANAGE.ROOT}>Vào trang quản lý</Link>
      </p>
    </section>
  );
}
