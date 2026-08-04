import type { Metadata } from 'next';
import { AccountView } from '@/features/account/components/AccountView';

export const metadata: Metadata = {
  title: 'Tài khoản của tôi',
  // Hồ sơ cá nhân — không có gì để index, và không nên xuất hiện trên công cụ tìm kiếm.
  robots: { index: false, follow: false },
};

/**
 * Tài khoản của KHÁCH, nằm trong khu công khai để giữ nguyên header/footer marketplace —
 * khách không phải rời không gian đang dùng chỉ để sửa tên. Dữ liệu cá nhân nên là client island.
 */
export default function AccountPage() {
  return <AccountView />;
}
