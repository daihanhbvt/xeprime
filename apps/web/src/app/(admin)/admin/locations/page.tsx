import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AdminLocationsView } from '@/features/locations/components/AdminLocationsView';

export async function generateMetadata(): Promise<Metadata> {
  // Cùng nhãn với mục menu — tab trình duyệt nói đúng tên màn đang mở, theo ngôn ngữ đang dùng.
  const t = await getTranslations('Navigation.platform');
  return { title: t('locations') };
}

export default function AdminLocationsPage() {
  return <AdminLocationsView />;
}
