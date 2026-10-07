import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PartnerAccountRoute } from '@/features/account/components/PartnerAccountRoute';

export async function generateMetadata(): Promise<Metadata> {
  // Tiêu đề TRUNG TÍNH: cùng URL là "Tài khoản & bảo mật" hoặc "Hồ sơ chủ xe" tuỳ tuyến, mà
  // tuyến chỉ biết sau `/auth/me` ở client.
  const t = await getTranslations('Navigation.manageGroups');
  return { title: t('account'), robots: { index: false, follow: false } };
}

/**
 * TÀI KHOẢN của tài khoản đối tác — "Tài khoản & bảo mật", hoặc "Hồ sơ chủ xe" với chủ xe tuyến
 * hoa hồng (06/10/2026). Thân trang chọn theo tuyến ở `PartnerAccountRoute`.
 *
 * Gộp từ ba trang: hồ sơ cá nhân ở đây, "Bảo mật tài khoản" ở `/manage/security` (05/10/2026) và
 * "Hồ sơ chủ xe" ở `/manage/registration` (06/10/2026) — hai route sau nay là redirect.
 */
export default function PartnerAccountRoutePage() {
  return <PartnerAccountRoute />;
}
