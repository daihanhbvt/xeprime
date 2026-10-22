import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { FavoritesView } from '@/features/favorites/components/FavoritesView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.account');
  return { title: t('favorites'), robots: { index: false, follow: false } };
}

/**
 * Xe yêu thích của tài khoản khách (BRD customer favorites). Tab Ô tô/Xe máy nằm trên URL nên
 * view đọc `useSearchParams` — bọc Suspense để trang vẫn dựng tĩnh được phần khung.
 */
export default function AccountFavoritesPage() {
  return (
    <Suspense fallback={null}>
      <FavoritesView />
    </Suspense>
  );
}
