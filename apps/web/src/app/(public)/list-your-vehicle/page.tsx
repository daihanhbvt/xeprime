import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { REGISTRATION_TRACK } from '@xeprime/types';

import { partnerRegisterHref } from '@/constants/routes';
import { ListYourVehicleLanding } from '@/features/list-vehicle/components/ListYourVehicleLanding';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ListYourVehicle.landing');
  return { title: t('metaTitle'), description: t('subtitle') };
}

/**
 * `/list-your-vehicle` — landing CÔNG KHAI mời chủ xe đăng xe (site khách, cần SEO).
 *
 * Không cần đăng nhập: người ta đọc lời mời trước khi giao email. Hai nút dẫn sang trang đăng ký
 * của SITE PARTNER mang sẵn tuyến đã chọn (ADR 0040 · 0053) — tạo tài khoản đối tác xong là vào
 * thẳng bước tiếp theo của tuyến đó, không phải chọn lại.
 */
export default function ListYourVehiclePage() {
  return (
    <ListYourVehicleLanding
      personalHref={partnerRegisterHref(REGISTRATION_TRACK.COMMISSION)}
      shopHref={partnerRegisterHref(REGISTRATION_TRACK.PACKAGE)}
    />
  );
}
