'use client';

import { useParams } from 'next/navigation';
import { CustomerDetailView } from '@/features/customers/components/CustomerDetailView';

/**
 * Hồ sơ một khách của gian hàng — route THẬT để gửi link được và F5 không mất chỗ.
 *
 * Toàn bộ nội dung nằm ở `CustomerDetailView`; trang chỉ lấy id từ URL. Cùng hình thái với
 * `/manage/bookings/[id]` (Wave 10).
 */
export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  return <CustomerDetailView customerId={params?.id ?? ''} />;
}
