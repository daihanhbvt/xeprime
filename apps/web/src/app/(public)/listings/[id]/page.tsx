import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchCatalogServer } from '@/features/catalog/api';
import { fetchListingDetail } from '@/features/marketplace/api';
import { ListingDetailView } from '@/features/marketplace/components/ListingDetailView';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    pickupAt?: string;
    returnAt?: string;
    /** Ngữ cảnh dịch vụ/lộ trình từ tab tìm kiếm — prefill luồng đặt (17/08). */
    serviceType?: string;
    routeType?: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const listing = await fetchListingDetail(id);
  if (!listing) return { title: 'Không tìm thấy xe' };
  return {
    title: `${listing.name} · Thuê xe`,
    description: listing.description ?? `Thuê ${listing.name} tại ${listing.shopName}`,
  };
}

export default async function ListingDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { pickupAt, returnAt, serviceType, routeType } = await searchParams;
  // Trang này render trên server cho SEO nên không dùng được `useCatalog`; danh mục lấy song
  // song với chi tiết xe để tra nhãn hãng/kiểu dáng/nhiên liệu/tiện ích từ key đã lưu.
  const [listing, catalog] = await Promise.all([fetchListingDetail(id), fetchCatalogServer()]);
  if (!listing) notFound();
  return (
    <ListingDetailView
      listing={listing}
      catalog={catalog}
      pickupAt={pickupAt}
      returnAt={returnAt}
      serviceType={serviceType}
      routeType={routeType}
    />
  );
}
