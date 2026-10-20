import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DrivingTripDetailView } from '@/features/driving/components/DrivingTripDetailView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Driving.nav');
  return { title: t('driving'), robots: { index: false, follow: false } };
}

/**
 * Chi tiết một chuyến tôi lái (ADR 0063) — `id` là id ĐƠN THUÊ. Đoạn tĩnh `driving` thắng
 * `[id]` của chuyến đi thuê, nên hai loại chuyến không giẫm lên nhau.
 */
export default async function DrivingTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DrivingTripDetailView bookingId={id} />;
}
