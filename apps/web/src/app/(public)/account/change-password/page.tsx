import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ChangePasswordForm } from '@/features/auth/components/ChangePasswordForm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.account');
  return { title: t('changePassword'), robots: { index: false, follow: false } };
}

/** Đổi mật khẩu (hoặc đặt lần đầu với tài khoản OTP/social) — cổng đăng nhập ở `AccountShell`. */
export default function ChangePasswordPage() {
  return <ChangePasswordForm />;
}
