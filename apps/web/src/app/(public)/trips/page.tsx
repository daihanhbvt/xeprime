import type { Metadata } from 'next';
import { MyTripsView } from '@/features/reviews/components/MyTripsView';

export const metadata: Metadata = {
  title: 'Đơn thuê của tôi',
};

/** Khu khách hàng — chuyến thuê + đánh giá. Dữ liệu cá nhân nên không cần SEO; client island. */
export default function TripsPage() {
  return <MyTripsView />;
}
