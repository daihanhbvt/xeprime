import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ListYourVehicleLanding } from '@/features/list-vehicle/components/ListYourVehicleLanding';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ListYourVehicle.landing');
  return { title: t('title'), description: t('subtitle') };
}

/**
 * `/list-your-vehicle` — landing CÔNG KHAI mời chủ xe đăng xe.
 *
 * Không nằm trong `/manage` và không cần đăng nhập: người chưa có gian hàng phải đọc được lời
 * mời trước khi bị hỏi tài khoản. Rẽ nhánh theo trạng thái đăng nhập nằm trong component.
 */
export default function ListYourVehiclePage() {
  return <ListYourVehicleLanding />;
}
