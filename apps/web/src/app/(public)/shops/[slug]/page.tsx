import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchPublicShop } from '@/features/marketplace/api';
import { ShopAbout } from '@/features/marketplace/components/ShopAbout';
import { ShopHeader } from '@/features/marketplace/components/ShopHeader';
import { ShopReviews } from '@/features/marketplace/components/ShopReviews';
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

/**
 * Trang gian hàng công khai.
 *
 * Bốn khối, theo đúng thứ tự một người quyết định thuê xe: họ là ai → họ làm được gì → có xe
 * nào → người khác nói gì. Ba khối đầu render từ MỘT lần đọc hồ sơ (`fetchPublicShop`, cache 60
 * giây); đánh giá tự đọc lấy vì nó có nhịp đổi khác hẳn (cache 120 giây) và được phép hỏng mà
 * không kéo cả trang theo.
 *
 * `ShopVehicleGrid` là client island duy nhất ở tầng này — nó phân trang qua URL (ADR 0004).
 */
export default async function ShopPage({ params }: PageProps) {
  const { slug } = await params;
  const shop = await fetchPublicShop(slug);
  if (!shop) notFound();

  return (
    <>
      <ShopHeader shop={shop} />
      <ShopAbout shop={shop} />
      <ShopVehicleGrid slug={slug} />
      <ShopReviews slug={slug} />
    </>
  );
}
