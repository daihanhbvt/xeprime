import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchListingDetail } from '@/features/marketplace/api';
import { ListingDetailView } from '@/features/marketplace/components/ListingDetailView';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pickupAt?: string; returnAt?: string }>;
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
  const { pickupAt, returnAt } = await searchParams;
  const listing = await fetchListingDetail(id);
  if (!listing) notFound();
  return <ListingDetailView listing={listing} pickupAt={pickupAt} returnAt={returnAt} />;
}
