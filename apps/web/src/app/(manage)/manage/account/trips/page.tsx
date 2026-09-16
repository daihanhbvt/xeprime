import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TRIP_ROLE } from '@xeprime/types';

import { ROUTES } from '@/constants/routes';
import { TripsView } from '@/features/trips/components/TripsView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Trips.transitional');
  return { title: t('title'), robots: { index: false, follow: false } };
}

/**
 * LỐI CHUYỂN TIẾP — chuyến ĐI THUÊ cũ của người đang đăng nhập, bên trong cổng quản lý.
 *
 * ## Vì sao nó tồn tại
 *
 * Một người có thể là chủ xe tuyến hoa hồng hôm nay và là gian hàng tuyến gói ngày mai. Khu
 * khách đóng lại cùng lúc với việc nâng tuyến (`AccountShell`), nhưng chuyến họ đang ĐI THUÊ của
 * một chủ xe khác thì không đóng theo: xe vẫn phải trả, khoản hoàn vẫn phải nhận, và chủ xe kia
 * vẫn cần liên lạc được. Ẩn `/trips` mà không để lại lối nào là giấu mất nghĩa vụ của chính họ.
 *
 * ## Vì sao nó KHÔNG phải một mục menu
 *
 * Nó là lối theo NGỮ CẢNH: "Tài khoản & bảo mật" dẫn tới đây đúng khi còn chuyến chưa khép. Một
 * mục "Chuyến của tôi" thường trực trong Manage sẽ dựng lại đúng thứ việc tách tuyến vừa gỡ đi,
 * và với gian hàng chưa bao giờ đi thuê thì đó là một mục rỗng vĩnh viễn.
 *
 * `lockedRole` khoá vai `renter`: chuyến gian hàng CHO THUÊ sống ở `/manage/bookings`, nơi có
 * đầy đủ công cụ vận hành. Xem `TripsViewProps.lockedRole`.
 *
 * `Suspense` bắt buộc vì `TripsView` đọc `useSearchParams`.
 */
export default function ManageAccountTripsPage() {
  return (
    <Suspense fallback={null}>
      <TripsView lockedRole={TRIP_ROLE.RENTER} basePath={ROUTES.MANAGE.ACCOUNT_TRIPS} />
    </Suspense>
  );
}
