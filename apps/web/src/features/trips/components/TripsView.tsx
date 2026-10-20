'use client';

import { Button } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CUSTOMER_TRIP_FILTER, TRIP_ROLE } from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ROUTES, TRIPS_TAB, TRIPS_TAB_PARAM } from '@/constants/routes';
import { DrivingTabSwitch } from '@/features/driving/components/DrivingTabSwitch';
import { DrivingTripsList } from '@/features/driving/components/DrivingTripsList';
import { useAuthModal, useNextFromCurrentPath } from '@/features/auth/components/AuthModalProvider';
import { AUTH_MODE } from '@/features/auth/post-auth-destination';
import { useErrorMessage } from '@/i18n/use-error-message';
import { isUnauthenticated } from '@/services/api-client';
import { useTrips } from '../hooks';
import { useTripListUrl } from '../use-trip-list-url';
import { TripCard } from './TripCard';
import { TripList } from './TripList';
import { UnpaidHoldsReminder } from './UnpaidHoldsReminder';
import styles from './TripsView.module.css';

/**
 * `Chuyến của tôi` — danh sách duy nhất cho khách.
 *
 * Bộ lọc và trang sống ở **URL searchParams** (ADR 0004) qua `useTripListUrl`; khung tab + lọc
 * chặng + phân trang là `TripList`, dùng chung với danh sách chuyến cho thuê của chủ xe.
 *
 * **CHỈ chuyến ĐI THUÊ** (ADR 0053). Đây là site KHÁCH: tài khoản khách không có gian hàng nào, nên
 * không có phía "cho thuê" để trộn vào — chuyến cho thuê của chủ xe sống ở site partner
 * (`/trips` của chủ xe tuyến hoa hồng, `/bookings` + `/booking-requests` của gian hàng gói). Vai gửi
 * lên server luôn là `renter`; `?role=` cũ trên URL (bookmark, thông báo trước ADR 0053) bị bỏ qua.
 */
export function TripsView() {
  const t = useTranslations('Trips');
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const { open } = useAuthModal();
  const nextFromHere = useNextFromCurrentPath();

  const searchParams = useSearchParams();
  // "Chuyến tôi lái" (ADR 0063) là một tab của cùng trang — `?tab=driving`, đích thông báo dùng chuỗi này.
  const driving = searchParams?.get(TRIPS_TAB_PARAM) === TRIPS_TAB.DRIVING;

  const { filter, page, navigate } = useTripListUrl(ROUTES.TRIPS);
  const { data, isLoading, isError, error, refetch, isFetching } = useTrips(
    filter,
    page,
    TRIP_ROLE.RENTER,
  );

  if (driving) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.heading}>{t('list.heading')}</h1>
        </header>
        <DrivingTabSwitch driving />
        <DrivingTripsList />
      </div>
    );
  }

  if (isError) {
    // Hết phiên là chuyện của đăng nhập, không phải lỗi tải dữ liệu — hai thứ cần hai lối thoát
    // khác nhau, và "Thử lại" cho phiên hết hạn chỉ lặp lại đúng lỗi đó.
    if (isUnauthenticated(error)) {
      return (
        <div className={styles.page}>
          <EmptyState
            variant="empty"
            title={t('auth.expiredTitle')}
            description={t('auth.expiredList')}
            action={
              <Button
                type="primary"
                onClick={() => open({ mode: AUTH_MODE.LOGIN, next: nextFromHere() })}
              >
                {t('auth.login')}
              </Button>
            }
          />
        </div>
      );
    }
    return (
      <div className={styles.page}>
        <EmptyState
          variant="error"
          title={t('list.errorTitle')}
          description={errorMessage(error)}
          action={
            <Button type="primary" onClick={() => void refetch()}>
              {t('list.retry')}
            </Button>
          }
        />
      </div>
    );
  }

  const history = filter === CUSTOMER_TRIP_FILTER.HISTORY;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.heading}>{t('list.heading')}</h1>
        <p className={styles.sub}>{t('list.sub')}</p>
      </header>

      <DrivingTabSwitch driving={false} />

      {/* Chuyến đang giữ chưa trả — việc phải làm NGAY, nên đứng trên mọi tab. */}
      <UnpaidHoldsReminder />

      <TripList
        filter={filter}
        data={data}
        isLoading={isLoading}
        isFetching={isFetching}
        onNavigate={navigate}
        renderTrip={(trip) => <TripCard trip={trip} />}
        /*
         * Hai tab trống là hai tình huống khác nhau, nên hai lối thoát khác nhau: chưa có chuyến
         * nào đang chạy thì việc cần làm là đi tìm xe; lịch sử trống thì mời tìm xe là lạc đề —
         * đường ra là quay về tab đang có chuyến.
         */
        empty={
          <EmptyState
            variant="empty"
            title={history ? t('list.emptyHistoryTitle') : t('list.emptyCurrentTitle')}
            description={history ? t('list.emptyHistoryBody') : t('list.emptyCurrentBody')}
            action={
              history ? (
                <Button onClick={() => navigate({ filter: CUSTOMER_TRIP_FILTER.CURRENT })}>
                  {t('list.viewCurrent')}
                </Button>
              ) : (
                <Button type="primary" onClick={() => router.push(ROUTES.SEARCH)}>
                  {t('list.findVehicle')}
                </Button>
              )
            }
          />
        }
      />
    </div>
  );
}
