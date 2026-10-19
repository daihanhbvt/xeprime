'use client';

import { Badge, Segmented } from 'antd';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ROUTES, TRIPS_TAB, drivingTripPath, type TripsTab } from '@/constants/routes';
import { useDriverPendingCounts } from '../hooks';

/**
 * Bộ chuyển "Chuyến tôi thuê / Chuyến tôi lái" trên đầu "Chuyến của tôi" (ADR 0063).
 *
 * Chỉ hiện với tài khoản ĐANG làm tài xế (có liên kết còn mở) hoặc có chuyến chờ nhận — phần lớn
 * khách không bao giờ lái cho ai, và một tab luôn trống là nhiễu. Đổi tab là đổi tập chuyến, nên
 * tham số của tab kia (lọc, trang) rơi lại.
 */
export function DrivingTabSwitch({ driving }: { driving: boolean }) {
  const t = useTranslations('Driving.nav');
  const router = useRouter();
  const counts = useDriverPendingCounts();
  const pendingTrips = counts.data?.trips ?? 0;

  // Chưa từng có liên kết tài xế ⇒ không có tab "Chuyến tôi lái" (đang đứng ở tab đó thì vẫn hiện).
  if (!driving && !counts.data?.hasLinks) return null;

  return (
    <Segmented<TripsTab>
      aria-label={t('label')}
      value={driving ? TRIPS_TAB.DRIVING : TRIPS_TAB.RENTING}
      onChange={(value) =>
        router.replace(value === TRIPS_TAB.DRIVING ? drivingTripPath.list : ROUTES.TRIPS, {
          scroll: false,
        })
      }
      options={[
        { value: TRIPS_TAB.RENTING, label: t('renting') },
        {
          value: TRIPS_TAB.DRIVING,
          label: (
            <span>
              {t('driving')} <Badge count={pendingTrips} size="small" />
            </span>
          ),
        },
      ]}
    />
  );
}
