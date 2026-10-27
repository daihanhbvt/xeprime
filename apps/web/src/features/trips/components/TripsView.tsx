'use client';

import { useEffect } from 'react';
import { Button } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CUSTOMER_TRIP_FILTER, TRIP_ROLE } from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ROUTES, TRIPS_TAB, TRIPS_TAB_PARAM, drivingTripPath } from '@/constants/routes';
import { useAuthModal, useNextFromCurrentPath } from '@/features/auth/components/AuthModalProvider';
import { AUTH_MODE } from '@/features/auth/post-auth-destination';
import { useErrorMessage } from '@/i18n/use-error-message';
import { isUnauthenticated } from '@/services/api-client';
import { useTrips } from '../hooks';
import { useTripListUrl } from '../use-trip-list-url';
import { CustomerTripCard } from './CustomerTripCard';
import { TripFilterTabs } from './TripFilterTabs';
import { TripHistoryFilters } from './TripHistoryFilters';
import { TripList } from './TripList';
import { UnpaidHoldsReminder } from './UnpaidHoldsReminder';
import { AccountPanel } from '@/features/account/components/AccountPanel';

/**
 * `Chuyến của tôi` — danh sách duy nhất cho khách. Design Account / My Trip (Figma `19879:69348`,
 * `19879:71810`): MỘT thẻ `AccountPanel` trong vỏ tài khoản — tiêu đề `h1` + mô tả, bộ chuyển
 * "Chuyến hiện tại / Lịch sử chuyến" ở góc phải (`TripFilterTabs`), rồi các thẻ chuyến.
 *
 * Tab lịch sử có ô "Tìm kiếm chuyến đi" + "Chọn khoảng thời gian" (`TripHistoryFilters`) — lọc ở
 * server qua `GET /trips?q=&dateFrom=&dateTo=`; số trên tab vẫn là tổng của tab.
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
  /*
   * "Chuyến tôi lái" (ADR 0063) đã chuyển sang trang "Nơi tôi làm tài xế". Link cũ `?tab=driving`
   * (thông báo đã gửi, dấu trang) vẫn phải tới đúng chỗ.
   */
  const driving = searchParams?.get(TRIPS_TAB_PARAM) === TRIPS_TAB.DRIVING;
  useEffect(() => {
    if (driving) router.replace(drivingTripPath.list);
  }, [driving, router]);

  const { filter, page, narrow, navigate } = useTripListUrl(ROUTES.TRIPS);
  const history = filter === CUSTOMER_TRIP_FILTER.HISTORY;
  // Ô tìm / khoảng ngày chỉ có ở tab lịch sử (Figma `19879:71810`) — tab hiện tại không gửi chúng.
  const activeNarrow = history ? narrow : undefined;
  const narrowed = Boolean(activeNarrow?.q || activeNarrow?.from || activeNarrow?.to);
  const { data, isLoading, isError, error, refetch, isFetching } = useTrips(
    filter,
    page,
    TRIP_ROLE.RENTER,
    true,
    activeNarrow,
  );

  function renderContent() {
    if (isError) {
      // Hết phiên là chuyện của đăng nhập, không phải lỗi tải dữ liệu — hai thứ cần hai lối thoát
      // khác nhau, và "Thử lại" cho phiên hết hạn chỉ lặp lại đúng lỗi đó.
      if (isUnauthenticated(error)) {
        return (
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
        );
      }
      return (
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
      );
    }

    return (
      <>
        {/* Chuyến đang giữ chưa trả — việc phải làm NGAY, nên đứng trên mọi tab. */}
        <UnpaidHoldsReminder />

        {history ? (
          <TripHistoryFilters narrow={narrow} onChange={(next) => navigate({ narrow: next })} />
        ) : null}

        <TripList
          /* Dựng lại theo tab: bộ lọc chặng của tab kia không mang sang (xem `TripList.tabs`). */
          key={filter}
          tabs="external"
          filter={filter}
          data={data}
          isLoading={isLoading}
          isFetching={isFetching}
          onNavigate={navigate}
          renderTrip={(trip) => <CustomerTripCard trip={trip} />}
          /*
           * Hai tab trống là hai tình huống khác nhau, nên hai lối thoát khác nhau: chưa có chuyến
           * nào đang chạy thì việc cần làm là đi tìm xe; lịch sử trống thì mời tìm xe là lạc đề —
           * đường ra là quay về tab đang có chuyến.
           */
          empty={
            narrowed ? (
              /* Bộ lọc không khớp gì: lối ra là XOÁ bộ lọc, không phải lối thoát của tab trống. */
              <EmptyState
                variant="no-results"
                title={t('list.narrowEmptyTitle')}
                description={t('list.narrowEmptyBody')}
                action={
                  <Button onClick={() => navigate({ narrow: {} })}>{t('list.narrowClear')}</Button>
                }
              />
            ) : (
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
            )
          }
        />
      </>
    );
  }

  return (
    <AccountPanel
      as="h1"
      title={t('list.heading')}
      subtitle={t('list.sub')}
      extra={
        <TripFilterTabs
          filter={filter}
          counts={data?.counts}
          onChange={(next) => navigate({ filter: next })}
        />
      }
    >
      {renderContent()}
    </AccountPanel>
  );
}
