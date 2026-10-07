import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { OwnerRegistrationRedirect } from '@/features/account/components/OwnerRegistrationRedirect';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.account');
  return { title: t('ownerProfile'), robots: { index: false, follow: false } };
}

/**
 * ALIAS CHUYỂN TIẾP (06/10/2026) — "Hồ sơ chủ xe" đã gộp vào trang tài khoản (`/account`), cùng
 * với hồ sơ cá nhân và bảo mật. Tiến trình đăng ký (ba bước) là trang chủ Owner Lite ở bậc
 * `registering` (`OwnerLiteHome`).
 *
 * Route giữ lại vì bookmark, thông báo cũ và link trong email vẫn mang nó. Đích theo tuyến (xem
 * `OwnerRegistrationRedirect`). Không còn mục menu nào trỏ tới đây.
 */
export default function OwnerRegistrationRedirectPage() {
  return <OwnerRegistrationRedirect />;
}
