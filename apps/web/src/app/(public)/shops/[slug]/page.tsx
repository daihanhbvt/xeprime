import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchPublicShop } from '@/features/marketplace/api';
import { ShopHeader } from '@/features/marketplace/components/ShopHeader';
import { ShopVehicleGrid } from '@/features/marketplace/components/ShopVehicleGrid';
import { getTranslations } from 'next-intl/server';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const [shop, t] = await Promise.all([
    fetchPublicShop(slug),
    getTranslations('Marketplace.meta.shop'),
  ]);
  if (!shop) return { title: t('notFound') };
  return {
    title: t('title', { name: shop.name }),
    description:
      shop.bio ??
      (shop.provinceName
        ? t('descriptionWithProvince', { name: shop.name, province: shop.provinceName })
        : t('description', { name: shop.name })),
  };
}

export default async function ShopPage({ params }: PageProps) {
  const { slug } = await params;
  const shop = await fetchPublicShop(slug);
  if (!shop) notFound();

  return (
    <>
      <ShopHeader shop={shop} />
      <ShopVehicleGrid slug={slug} />
    </>
  );
}
