import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/JsonLd';
import { listingPath } from '@/constants/routes';
import { fetchCatalogServer } from '@/features/catalog/api';
import { fetchListingDetail } from '@/features/marketplace/api';
import { parseDateTimeParam } from '@/features/marketplace/filter-params';
import { ListingDetailView } from '@/features/marketplace/components/ListingDetailView';
import { listingJsonLd } from '@/features/marketplace/listing-seo';
import { metaDescription, openGraphFor } from '@/lib/seo';
import { getLocale, getTranslations } from 'next-intl/server';
import { resolveAppLocale } from '@/i18n/config';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    pickupAt?: string;
    returnAt?: string;
    /** Ngữ cảnh dịch vụ/lộ trình từ tab tìm kiếm — prefill luồng đặt (17/08). */
    serviceType?: string;
    routeType?: string;
    /** Tỉnh đang lọc ở trang tìm xe — prefill ô địa chỉ giao xe (ADR 0035). */
    provinceCode?: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const [listing, t] = await Promise.all([
    fetchListingDetail(id),
    getTranslations('Marketplace.meta.listing'),
  ]);
  if (!listing) return { title: t('notFound') };
  const title = t('title', { name: listing.name });
  const description = metaDescription(
    listing.description || t('description', { name: listing.name, shop: listing.shopName }),
  );
  // Canonical KHÔNG mang query: `?pickupAt=&serviceType=` chỉ prefill luồng đặt, cùng một chiếc
  // xe không được thành hàng trăm URL trùng nội dung trong mắt công cụ tìm kiếm.
  const path = listingPath.detail(listing.id);
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: openGraphFor({
      title,
      description,
      path,
      images: [listing.mainImageUrl, listing.images[0]],
    }),
  };
}

export default async function ListingDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { pickupAt, returnAt, serviceType, routeType, provinceCode } = await searchParams;
  // Trang này render trên server cho SEO nên không dùng được `useCatalog`; danh mục lấy song
  // song với chi tiết xe để tra nhãn hãng/kiểu dáng/nhiên liệu/tiện ích từ key đã lưu.
  const [listing, catalog, tBreadcrumb] = await Promise.all([
    fetchListingDetail(id),
    fetchCatalogServer(resolveAppLocale(await getLocale())),
    getTranslations('Listings.detail.breadcrumb'),
  ]);
  if (!listing) notFound();
  return (
    <>
      {listingJsonLd(listing, { home: tBreadcrumb('home'), search: tBreadcrumb('search') }).map(
        (data, index) => (
          <JsonLd key={index} data={data} />
        ),
      )}
      <ListingDetailView
        listing={listing}
        catalog={catalog}
        // URL mang giờ VN (`2026-10-26T21:00`), component và API nói ISO UTC.
        pickupAt={parseDateTimeParam(pickupAt)}
        returnAt={parseDateTimeParam(returnAt)}
        serviceType={serviceType}
        routeType={routeType}
        searchProvinceCode={provinceCode}
      />
    </>
  );
}
