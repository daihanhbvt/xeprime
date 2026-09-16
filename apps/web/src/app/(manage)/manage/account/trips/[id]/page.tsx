'use client';

import { useParams } from 'next/navigation';

import { ROUTES } from '@/constants/routes';
import { TripDetailView } from '@/features/trips/components/TripDetailView';

/**
 * Chi tiết một chuyến ĐI THUÊ cũ, đọc từ trong cổng quản lý — xem trang danh sách cùng thư mục.
 *
 * `backHref` trỏ về lối chuyển tiếp chứ không về `/trips`: khu khách đã đóng với người đang xem,
 * nên một nút "Quay lại" trỏ ra đó sẽ bị chuyển hướng ngay và đưa họ đi chỗ khác.
 */
export default function ManageAccountTripDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <TripDetailView tripId={params?.id ?? ''} backHref={ROUTES.MANAGE.ACCOUNT_TRIPS} />
  );
}
