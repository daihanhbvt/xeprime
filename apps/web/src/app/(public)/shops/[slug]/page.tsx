import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchPublicShop } from '@/features/marketplace/api';
import { ShopHeader } from '@/features/marketplace/components/ShopHeader';
import { ShopVehicleGrid } from '@/features/marketplace/components/ShopVehicleGrid';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const shop = await fetchPublicShop(slug);
  if (!shop) return { title: 'Không tìm thấy gian hàng' };
  return {
    title: `${shop.name} · Gian hàng thuê xe`,
    description: shop.bio ?? `Thuê xe tại ${shop.name}${shop.provinceName ? ` · ${shop.provinceName}` : ''}`,
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
