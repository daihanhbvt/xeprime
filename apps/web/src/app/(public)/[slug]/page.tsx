import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { STOREFRONT_KIND, isReservedShopSlug } from '@xeprime/types';
import { getTranslations } from 'next-intl/server';
import { PageBreadcrumb } from '@/components/navigation/PageBreadcrumb';
import { ROUTES, shopPath } from '@/constants/routes';
import { fetchPublicShop } from '@/features/marketplace/api';
import { metaDescription, openGraphFor } from '@/lib/seo';
import { ShopBranches } from '@/features/marketplace/components/ShopBranches';
import { ShopHeader } from '@/features/marketplace/components/ShopHeader';
import { ShopReviews } from '@/features/marketplace/components/ShopReviews';
import { ShopTrust } from '@/features/marketplace/components/ShopTrust';
import { ShopVehicles } from '@/features/marketplace/components/ShopVehicles';
import { Reveal } from '@/components/motion/Reveal';
import styles from './page.module.css';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (isReservedShopSlug(slug)) return {};
  const [shop, t] = await Promise.all([
    fetchPublicShop(slug),
    getTranslations('Marketplace.meta.shop'),
  ]);
  if (!shop) return { title: t('notFound') };
  const title = t('title', { name: shop.name });
  const description = metaDescription(
    shop.bio ||
      (shop.provinceName
        ? t('descriptionWithProvince', { name: shop.name, province: shop.provinceName })
        : t('description', { name: shop.name })),
  );
  // Canonical không mang bộ lọc xe của gian hàng (`?vehicleType=`, `?page=`…) — cùng một hồ sơ.
  const path = shopPath.detail(shop.slug);
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: openGraphFor({ title, description, path, images: [shop.coverUrl, shop.logoUrl] }),
  };
}

/**
 * Trang gian hàng công khai — Figma chủ xe cá nhân `20058:71206`, gian hàng `20063:59202`.
 *
 * Các khối theo đúng thứ tự một người quyết định thuê xe: họ là ai (thẻ hồ sơ gom danh tính, giới
 * thiệu và số liệu) → điều gì đã được kiểm chứng về họ (uy tín — chỉ gian hàng) → họ ở đâu (chi
 * nhánh — chỉ gian hàng) → có xe nào → người khác nói gì. Hồ
 * sơ, chi nhánh và bộ lọc xe render từ MỘT lần đọc hồ sơ (`fetchPublicShop`, cache 60 giây); đánh
 * giá tự đọc lấy vì nó có nhịp đổi khác hẳn (cache 120 giây) và được phép hỏng mà không kéo cả
 * trang theo.
 *
 * `ShopVehicles` là client island duy nhất ở tầng này — bộ lọc và phân trang sống ở URL (ADR 0004).
 */
export default async function ShopPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  // Tên đường dẫn hệ thống không bao giờ là gian hàng — khỏi hỏi API cho mọi URL gõ sai.
  if (isReservedShopSlug(slug)) notFound();
  const [shop, t] = await Promise.all([fetchPublicShop(slug), getTranslations('Shops.breadcrumb')]);
  if (!shop) notFound();
  /*
   * Mở bằng slug CŨ (link `/shops/<tên>-<mã>` đã chia sẻ trước khi rút gọn — API nhận cả bí danh)
   * ⇒ chuyển hẳn sang slug hiện tại, giữ nguyên bộ lọc trên URL.
   */
  if (shop.slug !== decodeURIComponent(slug)) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(await searchParams)) {
      for (const item of Array.isArray(value) ? value : value == null ? [] : [value]) {
        query.append(key, item);
      }
    }
    permanentRedirect(`${shopPath.detail(shop.slug)}${query.size > 0 ? `?${query}` : ''}`);
  }

  const isShop = shop.storefrontKind === STOREFRONT_KIND.SHOP;

  return (
    <div className={styles.page}>
      <div className={styles.crumbBar}>
        <PageBreadcrumb
          ariaLabel={t('label')}
          className={styles.crumbs}
          back={{ href: ROUTES.SEARCH, label: t('back') }}
          crumbs={[
            { key: 'home', label: t('home'), href: ROUTES.HOME },
            { key: 'current', label: t(isShop ? 'shop' : 'personal') },
          ]}
        />
      </div>

      <ShopHeader shop={shop} />

      <div className={styles.body}>
        {isShop ? (
          <Reveal>
            <ShopTrust
              trust={shop.trust}
              vehicleCount={shop.vehicleCount}
              noCollateralCount={shop.vehicleFilterCounts.noCollateral}
            />
          </Reveal>
        ) : null}
        {isShop ? (
          <Reveal>
            <ShopBranches branches={shop.branches} />
          </Reveal>
        ) : null}
        <ShopVehicles
          slug={slug}
          vehicleCount={shop.vehicleCount}
          metrics={shop.metrics}
          provinces={shop.serviceProvinces}
          filterCounts={shop.vehicleFilterCounts}
        />
        <Reveal>
          <ShopReviews slug={slug} />
        </Reveal>
      </div>
    </div>
  );
}
