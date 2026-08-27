'use client';

import { useParams } from 'next/navigation';
import { TripDetailView } from '@/features/trips/components/TripDetailView';

/**
 * Chi tiết một chuyến của khách.
 *
 * `id` nhận cả id yêu cầu thuê lẫn id đơn thuê — thông báo phát ra từ nhiều wave trỏ vào cả hai
 * loại và backend phân giải chúng về cùng một chuyến. Không có metadata/SEO: đây là dữ liệu cá
 * nhân, và tiêu đề tĩnh còn an toàn hơn một tiêu đề rò mã đơn ra lịch sử trình duyệt chung.
 */
export default function TripDetailPage() {
  const params = useParams<{ id: string }>();
  return <TripDetailView tripId={params?.id ?? ''} />;
}
