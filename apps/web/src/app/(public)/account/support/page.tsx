import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CustomerSupportCases } from '@/features/support-cases/components/CustomerSupportCases';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.account');
  return { title: t('support'), robots: { index: false, follow: false } };
}

/**
 * Yêu cầu hỗ trợ CỦA MỘT NGƯỜI — khác trung tâm hỗ trợ công khai `/support` (kênh liên hệ, không
 * cần đăng nhập). Cổng đăng nhập nằm ở `AccountShell` của layout, không lặp lại ở đây.
 */
export default function AccountSupportPage() {
  return <CustomerSupportCases />;
}
