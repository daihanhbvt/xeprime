'use client';

import { Alert, Button, Pagination, Select, Skeleton, Tabs } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CUSTOMER_TRIP_FILTER,
  CUSTOMER_TRIP_FILTER_DEFAULT,
  CUSTOMER_TRIP_FILTER_VALUES,
  CUSTOMER_TRIP_STAGE_VALUES,
  PERMISSION,
  TRIP_ROLE,
  isTripRole,
  type TripRole,
  isCustomerTripFilter,
  type CustomerTripFilter,
  type CustomerTripStage,
} from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ROUTES, tripPath } from '@/constants/routes';
import { BookingDetailDialog } from '@/features/bookings/components/BookingDetailDialog';
import { useBookingRequestDecisions } from '@/features/booking-requests/hooks/use-booking-request-decisions';
import { usePermissions } from '@/hooks/use-permissions';
import { tripToDecisionTarget } from '../decision-target';
import { useAuthModal, useNextFromCurrentPath } from '@/features/auth/components/AuthModalProvider';
import { AUTH_MODE } from '@/features/auth/post-auth-destination';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { isUnauthenticated } from '@/services/api-client';
import { TRIPS_DEFAULT_LIMIT } from '../api';
import { useTrips } from '../hooks';
import type { CustomerTripCounts } from '../types';
import type { CustomerTrip } from '../types';
import { TripCard } from './TripCard';
import styles from './TripsView.module.css';

export interface TripsViewProps {
  /**
   * KHOÁ vai — bỏ qua `?role=` trên URL và giấu bộ chọn vai.
   *
   * Lối chuyển tiếp trong Manage (`/manage/account/trips`) truyền `renter`: thành viên gian
   * hàng tuyến gói chỉ còn lý do vào đây vì chuyến họ ĐI THUÊ chưa khép. Chuyến họ CHO THUÊ có
   * nơi riêng là `/manage/bookings`, và trộn hai phía lại chính là thứ tách tuyến vừa gỡ bỏ.
   *
   * Đây là quyết định ĐIỀU HƯỚNG, không phải rào bảo mật: server vẫn nhận `role` như một chiều
   * truy vấn và vẫn chỉ trả chuyến của chính người gọi (`scopeWhere`). Rào thật nằm ở chỗ khác.
   */
  lockedRole?: TripRole;
  /** KHU chứa danh sách — mặc định `/trips`. Xem `TripCardProps.basePath`. */
  basePath?: string;
}

/**
 * `Chuyến của tôi` — danh sách duy nhất cho khách.
 *
 * Bộ lọc và trang sống ở **URL searchParams** (ADR 0004): tab đang mở gửi link được, F5 không
 * mất, và nút Back của trình duyệt quay đúng tab trước đó. Không có bản sao state nào ở
 * component.
 *
 * Lọc, phân trang và ĐẾM đều ở server. Đếm ở client chỉ đúng với đúng trang đang tải — tab sẽ
 * nói `Lịch sử chuyến (3)` khi khách có 30 chuyến đã khép.
 *
 * ĐÚNG HAI TAB (`Chuyến hiện tại` / `Lịch sử chuyến`). Chi tiết chặng — chờ duyệt, chờ chuyển
 * giữ chỗ, sắp tới, đang thuê — do nhãn trên từng thẻ nói; dựng thêm tab cho mỗi chặng là bắt
 * khách mở bốn tab mới biết mình có bao nhiêu chuyến.
 *
 * **Một danh sách, HAI PHÍA** (08/09/2026). Chủ xe thấy ở đây cả chuyến mình cho thuê lẫn chuyến
 * mình đi thuê — server trộn chúng trong CÙNG một truy vấn phân trang (ADR 0014: một con người,
 * nhiều vai), nên hai tab và hai con số vẫn đúng mà không có phép gộp nào ở client. Thẻ tự nói
 * mình thuộc phía nào, và chuyến cho thuê còn chờ trả lời mang thêm hai quyết định.
 *
 * ## Vì sao KHÔNG có hàng chọn vai (16/09/2026)
 *
 * Bản 15/09 thêm một `Segmented` "Tất cả · Tôi đi thuê · Tôi cho thuê" trên hai tab. Hai hàng
 * điều khiển chồng nhau buộc người đọc phải hiểu cái nào lồng trong cái nào trước khi đọc được
 * chuyến nào — trong khi mỗi thẻ đã mang sẵn nhãn vai của nó, và phần lớn chủ xe có vài chuyến
 * chứ không phải vài trăm.
 *
 * Chiều VAI vẫn còn nguyên ở SERVER: `?role=` trên URL vẫn được tôn trọng (deep link, thông báo),
 * và `lockedRole` khoá nó cho lối chuyển tiếp trong Manage. Bỏ phần giao diện không đụng tới phép
 * lọc, nên số đếm trên tab và phân trang vẫn khớp với tập đang xem.
 *
 * Duyệt/từ chối đi qua `useBookingRequestDecisions` — CÙNG hook với hộp thư
 * `/manage/booking-requests`, nên quy tắc thuê dài hạn, hạn phản hồi và lỗi trùng lịch không thể
 * trôi khỏi nhau giữa hai màn.
 *
 * **Một vai, một khu** (15/09/2026). `lockedRole` + `basePath` cho phép cùng danh sách này đứng ở
 * lối chuyển tiếp `/manage/account/trips` với đúng chuyến ĐI THUÊ. Hai prop luôn đi cùng nhau:
 * khoá vai mà quên đổi khu thì mọi liên kết trong danh sách vẫn trỏ về `/trips`.
 */
export function TripsView({ lockedRole, basePath = ROUTES.TRIPS }: TripsViewProps = {}) {
  const t = useTranslations('Trips');
  const dl = useDomainLabel();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const params = useSearchParams();
  const { open } = useAuthModal();
  const nextFromHere = useNextFromCurrentPath();

  const { has } = usePermissions();
  const canApprove = has(PERMISSION.BOOKING_REQUEST_APPROVE);
  const decisions = useBookingRequestDecisions();
  /*
   * Đơn của CHỦ XE mở ngay tại chỗ bằng modal chi tiết đơn của feature bookings — cùng nội
   * dung, cùng mutation, cùng khoá theo gói với `/manage/bookings/[id]`. Chuyến mình ĐI THUÊ
   * vẫn đi tới `/trips/[id]` như cũ: hai phía đọc hai bộ thông tin khác nhau về cùng một chuyến.
   */
  const [hostBookingId, setHostBookingId] = useState<string | null>(null);

  const rawFilter = params?.get('filter');
  const filter: CustomerTripFilter = isCustomerTripFilter(rawFilter)
    ? rawFilter
    : CUSTOMER_TRIP_FILTER_DEFAULT;
  const page = Math.max(1, Number(params?.get('page') ?? 1) || 1);
  /*
   * Lọc theo CHẶNG, chỉ ở client và chỉ trong trang đang xem — cố ý.
   *
   * Đây là một bộ lọc THU HẸP tầm nhìn của người dùng trên thứ họ đang đọc, không phải một
   * chiều truy vấn mới: hai tab đã chia sẵn theo "còn chạy / đã khép", và server chưa nhận tham
   * số chặng. Đẩy nó lên URL sẽ hứa một phạm vi (toàn bộ kết quả) mà nó không giữ được.
   */
  const [stageFilter, setStageFilter] = useState<CustomerTripStage | undefined>(undefined);

  /*
   * VAI — chiều thứ ba, và KHÁC HẲN `stageFilter` ngay trên.
   *
   * Trước 15/09/2026 màn này trộn hai việc vào một danh sách: chuyến tôi ĐI THUÊ nằm lẫn với
   * yêu cầu khách gửi tới xe tôi CHO THUÊ, và số trên tab cộng gộp cả hai. Hai việc đó có nhịp
   * khác nhau, nút bấm khác nhau, và người dùng đọc chúng ở hai tâm thế khác nhau.
   *
   * Vai đi lên URL (ADR 0004) và lên SERVER, không lọc ở client: nó là một chiều TRUY VẤN, nên
   * lọc một trang kết quả sẽ cho ra những trang dài ngắn khác nhau và số đếm không khớp. Đây
   * chính là điều `stageFilter` cố ý KHÔNG làm, vì nó chỉ thu hẹp tầm nhìn trong trang đang đọc.
   */
  const rawRole = params?.get('role');
  /*
   * `lockedRole` THẮNG tham số URL — không chỉ đặt giá trị mặc định.
   *
   * Nếu chỉ dùng làm mặc định thì `?role=host` trên chính URL đó lại mở ra tập chuyến cho thuê,
   * và cả màn hình quay về đúng cái nó sinh ra để tránh. Bookmark cũ mang sẵn tham số ấy.
   */
  const role: TripRole | undefined =
    lockedRole ?? (isTripRole(rawRole) ? rawRole : undefined);

  const { data, isLoading, isError, error, refetch, isFetching } = useTrips(filter, page, role);

  /**
   * Ghi tab/trang lên URL.
   *
   * `role` KHÔNG phải tham số của hàm này (16/09/2026): màn hình không còn nút nào đổi vai. Nó
   * vẫn SỐNG SÓT qua mọi lần đổi tab vì `search` dựng lại từ chính query hiện tại — một deep link
   * `?role=host` giữ nguyên phạm vi của nó khi người dùng chuyển sang tab Lịch sử.
   */
  function navigate(next: { filter?: CustomerTripFilter; page?: number }) {
    const search = new URLSearchParams(params?.toString() ?? '');
    const nextFilter = next.filter ?? filter;
    // Đổi tab luôn về trang 1: giữ `page=4` khi sang tab chỉ có 1 trang là một trang trống.
    const nextPage = next.page ?? (next.filter !== undefined ? 1 : page);

    // Tab mặc định không cần tham số: `/trips` trần đã là `Chuyến hiện tại`.
    if (nextFilter === CUSTOMER_TRIP_FILTER_DEFAULT) search.delete('filter');
    else search.set('filter', nextFilter);
    if (nextPage <= 1) search.delete('page');
    else search.set('page', String(nextPage));

    const qs = search.toString();
    router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
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

  const counts = data?.counts;
  const pageItems = data?.items ?? [];
  const items = stageFilter
    ? pageItems.filter((trip) => trip.stage === stageFilter)
    : pageItems;
  const meta = data?.meta;

  /** Mở chi tiết một chuyến của CHỦ XE: có đơn thì vào đơn, chưa có thì vào hồ sơ chuyến. */
  function openHostDetail(trip: CustomerTrip) {
    if (trip.bookingId) setHostBookingId(trip.bookingId);
    else router.push(tripPath.detail(trip.id, basePath));
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.heading}>{t('list.heading')}</h1>
        <p className={styles.sub}>{t('list.sub')}</p>
      </header>

      <Tabs
        activeKey={filter}
        onChange={(key) => {
          // Đổi tab là đổi tập chuyến — một chặng chỉ có ở tab kia sẽ cho ra danh sách trống
          // mà không ai giải thích được, nên bộ lọc chặng rơi lại.
          setStageFilter(undefined);
          navigate({ filter: key as CustomerTripFilter });
        }}
        items={CUSTOMER_TRIP_FILTER_VALUES.map((key) => ({
          key,
          label: counts
            ? t('list.tabLabel', {
                label: dl('customerTripFilter', key),
                count: countOf(counts, key),
              })
            : dl('customerTripFilter', key),
        }))}
        tabBarExtraContent={{
          right: (
            <Select<CustomerTripStage>
              className={styles.stageFilter}
              aria-label={t('list.stageFilterLabel')}
              placeholder={t('list.stageAll')}
              allowClear
              value={stageFilter}
              onChange={(value) => setStageFilter(value)}
              options={CUSTOMER_TRIP_STAGE_VALUES.map((stage) => ({
                value: stage,
                label: dl('customerTripStage', stage),
              }))}
            />
          ),
        }}
      />

      {isLoading ? (
        <div className={styles.list} aria-busy="true">
          {[0, 1, 2].map((row) => (
            <div key={row} className={styles.skeleton}>
              <Skeleton active avatar={{ shape: 'square', size: 64 }} paragraph={{ rows: 2 }} />
            </div>
          ))}
        </div>
      ) : items.length === 0 && stageFilter ? (
        /* Lọc chặng không khớp gì: lối ra là XOÁ bộ lọc, không phải đi tìm xe. */
        <EmptyState
          variant="no-results"
          title={t('list.stageEmptyTitle')}
          description={t('list.stageEmptyBody')}
          action={<Button onClick={() => setStageFilter(undefined)}>{t('list.stageClear')}</Button>}
        />
      ) : items.length === 0 ? (
        /*
         * Hai tab trống là hai tình huống khác nhau, nên hai lối thoát khác nhau: chưa có chuyến
         * nào đang chạy thì việc cần làm là đi tìm xe; lịch sử trống thì mời tìm xe là lạc đề —
         * đường ra là quay về tab đang có chuyến.
         */
        <EmptyState
          variant="empty"
          title={
            filter === CUSTOMER_TRIP_FILTER.HISTORY
              ? t('list.emptyHistoryTitle')
              : lockedRole
                ? t('list.emptyTransitionalTitle')
                : t('list.emptyCurrentTitle')
          }
          description={
            filter === CUSTOMER_TRIP_FILTER.HISTORY
              ? t('list.emptyHistoryBody')
              : lockedRole
                ? t('list.emptyTransitionalBody')
                : t('list.emptyCurrentBody')
          }
          /*
           * "Đi tìm xe" chỉ đúng với người ĐƯỢC đặt xe. Ở lối chuyển tiếp, người xem là thành
           * viên gian hàng tuyến gói — họ không gửi được yêu cầu thuê (ADR 0038 điều 6), nên một
           * nút mời họ tìm xe là lời mời tới đúng một thông báo từ chối.
           */
          action={
            filter === CUSTOMER_TRIP_FILTER.HISTORY ? (
              <Button onClick={() => navigate({ filter: CUSTOMER_TRIP_FILTER.CURRENT })}>
                {t('list.viewCurrent')}
              </Button>
            ) : lockedRole ? null : (
              <Button type="primary" onClick={() => router.push(ROUTES.SEARCH)}>
                {t('list.findVehicle')}
              </Button>
            )
          }
        />
      ) : (
        <>
          {/* `aria-busy` khi đang nạp trang/tab mới: nội dung cũ còn đó nhưng đã lỗi thời. */}
          <div className={styles.list} aria-busy={isFetching}>
            {items.map((trip) => {
              const isHost = trip.role === TRIP_ROLE.HOST;
              return (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  basePath={basePath}
                  onOpenDetail={isHost ? openHostDetail : undefined}
                  decisions={
                    isHost && canApprove
                      ? {
                          onApprove: (row) => decisions.openApprove(tripToDecisionTarget(row)),
                          onReject: (row) => decisions.openReject(tripToDecisionTarget(row)),
                          pending: decisions.decisionActionFor(trip.id),
                        }
                      : undefined
                  }
                />
              );
            })}
          </div>

          {meta && meta.total > TRIPS_DEFAULT_LIMIT ? (
            <div className={styles.pager}>
              <Pagination
                current={meta.page}
                pageSize={meta.limit}
                total={meta.total}
                onChange={(next) => navigate({ page: next })}
                showSizeChanger={false}
              />
            </div>
          ) : null}
        </>
      )}

      {/* Dữ liệu cũ vẫn hiển thị trong lúc nạp lại; chỉ báo nhẹ thay vì chớp sang skeleton. */}
      {!isLoading && isFetching ? (
        <Alert type="info" showIcon title={t('list.refreshing')} className={styles.refreshing} />
      ) : null}

      {hostBookingId ? (
        <BookingDetailDialog
          bookingId={hostBookingId}
          open
          onClose={() => setHostBookingId(null)}
        />
      ) : null}

      {decisions.dialogs}
    </div>
  );
}

function countOf(counts: CustomerTripCounts, filter: CustomerTripFilter): number {
  return counts[filter];
}
