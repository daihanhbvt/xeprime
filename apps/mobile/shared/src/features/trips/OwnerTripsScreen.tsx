import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, type ListRenderItemInfo } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  CUSTOMER_TRIP_FILTER,
  CUSTOMER_TRIP_FILTER_DEFAULT,
  CUSTOMER_TRIP_FILTER_VALUES,
  PERMISSION,
  TRIP_ROLE,
  type CustomerTripFilter,
  type CustomerTripStage,
} from '@xeprime/types';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { TripCardSkeleton } from '@/components/ui/Skeleton';
import { STAGE_FILTER_MIN_ROWS, TripFilterTabs } from './TripsScreen';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { bookingRequestsApi } from '@/features/booking-requests/api';
import { BookingRequestDetailScreen } from '@/features/booking-requests/BookingRequestDetailScreen';
import { useBookingRequestDecisions } from '@/features/booking-requests/hooks/use-booking-request-decisions';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManagePageTitle } from '@/features/shell/ManagePageTitle';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useDomainLabel } from '@/i18n/domain';
import { queryKeys } from '@/queries/query-keys';
import { ROUTES } from '@/navigation/routes';
import { useListParam, useListParamChange } from '@/navigation/list-params';
import { layout } from '@/theme/layout';
import { LIST_TUNING } from '@/theme/list-tuning';
import { useColors } from '@/theme/ThemeProvider';
import { TripCard } from './components/TripCard';
import { tripToDecisionTarget } from './decision-target';
import { useTripsInfinite } from './hooks/use-trips';
import type { CustomerTrip } from './api';

const SKELETON_ROWS = 4;
const tripKey = (trip: CustomerTrip) => trip.id;

/**
 * "Chuyến cho thuê" — CHỦ xe tuyến hoa hồng (Owner Lite) ở app Partner, bản native của
 * `OwnerTripsView` bên web (PR #158).
 *
 * Chủ xe cá nhân có một tới ba chiếc: hộp thư (nhiều tab, bộ lọc, chi nhánh) và bảng đơn dựng cho
 * đội xe hàng chục chiếc. Màn này là MỘT danh sách gộp yêu cầu + đơn, hai tab hiện tại / lịch sử,
 * duyệt hoặc từ chối ngay trên thẻ. Chỉ dành cho CHỦ — `GET /trips` dựng phía chủ xe cho chủ gian
 * hàng; thành viên được `partnerPathRedirect` giữ ở hộp thư + bảng đơn.
 *
 * Không có nguồn sự thật thứ hai:
 *  - Danh sách đọc `GET /trips?role=host` — server khoá vai, lọc và phân trang (tải thêm khi cuộn).
 *  - Duyệt/từ chối/huỷ đi qua `useBookingRequestDecisions` — cùng mutation và tấm trượt với hộp thư.
 *  - Chạm thẻ: có đơn (và quyền xem đơn) ⇒ màn đơn của Manage (bàn giao, trạng thái); chưa có đơn
 *    ⇒ đọc ĐÚNG dòng hộp thư (`GET /booking-requests/:id`) rồi mở màn chi tiết yêu cầu tại chỗ.
 */
export function OwnerTripsScreen() {
  const colors = useColors();
  const t = useTranslations('Trips');
  const tRequests = useTranslations('BookingRequests');
  const domainLabel = useDomainLabel();
  const permissions = usePermissions();
  const navigateOnce = useNavigateOnce();
  const decisions = useBookingRequestDecisions();
  const { openApprove, openReject, openCancel } = decisions;

  const canApprove = permissions.has(PERMISSION.BOOKING_REQUEST_APPROVE);
  const canViewBooking = permissions.has(PERMISSION.BOOKING_VIEW);

  // Tab KHỞI TẠO từ tham số route (thẻ "Đã xong" của Tổng quan, như `?filter=history` của web).
  const routeFilter = useListParam('filter', CUSTOMER_TRIP_FILTER_VALUES);
  const [filter, setFilter] = useState<CustomerTripFilter>(
    routeFilter ?? CUSTOMER_TRIP_FILTER_DEFAULT,
  );
  // Lọc theo chặng — đúng web `OwnerTripsView` (dùng chung `TripList`): chỉ chặng của tab đang mở.
  const [stage, setStage] = useState<CustomerTripStage | null>(null);
  useListParamChange('filter', routeFilter, (next) => {
    setFilter(next);
    setStage(null);
  });
  const changeFilter = useCallback((next: CustomerTripFilter) => {
    setFilter(next);
    setStage(null);
  }, []);
  const query = useTripsInfinite(filter, TRIP_ROLE.HOST);
  /*
   * Quay lại từ màn chi tiết ĐƠN (bàn giao, huỷ, phụ phí…) thì nạp lại danh sách — đúng web
   * `OwnerTripsView` làm mới `trips` khi đóng hộp thoại đơn. Lượt focus đầu bỏ qua: query vừa chạy.
   */
  const queryClient = useQueryClient();
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current)
        void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
      focusedOnce.current = true;
    }, [queryClient]),
  );
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const visibleItems = useMemo(
    () => (stage === null ? items : items.filter((trip) => trip.stage === stage)),
    [items, stage],
  );
  const counts = query.data?.pages[0]?.counts;

  /*
   * Yêu cầu đang mở — `staleTime: 0` vì trạng thái một yêu cầu đổi theo phút (khách huỷ, hết hạn
   * phản hồi): mở lại không được bày nút "Duyệt" cho một yêu cầu đã đóng. Nằm dưới tiền tố
   * `bookingRequests`, nên mọi quyết định (vốn invalidate cả tiền tố) làm mới luôn bản đang mở.
   */
  const router = useRouter();
  const { request: requestParam } = useLocalSearchParams<{ request?: string }>();
  const [requestId, setRequestId] = useState<string | null>(
    typeof requestParam === 'string' && requestParam ? requestParam : null,
  );
  /*
   * `?request=<id>` — đích của thông báo yêu cầu (`ROUTES.manage.tripRequest`): mở sẵn yêu cầu đó.
   * Đóng chi tiết thì gỡ tham số, để bấm lại CÙNG thông báo vẫn mở được lần nữa.
   */
  // Tham số mới ⇒ mở yêu cầu đó, điều chỉnh NGAY trong render (không setState trong effect).
  const [seenRequestParam, setSeenRequestParam] = useState(requestParam);
  if (requestParam !== seenRequestParam) {
    setSeenRequestParam(requestParam);
    if (typeof requestParam === 'string' && requestParam) setRequestId(requestParam);
  }
  const request = useQuery({
    queryKey: queryKeys.bookingRequests.detail(requestId ?? ''),
    queryFn: () => bookingRequestsApi.detail(requestId ?? ''),
    enabled: requestId !== null,
    staleTime: 0,
  });

  const openTrip = useCallback(
    (trip: CustomerTrip) => {
      if (trip.bookingId && canViewBooking) {
        navigateOnce(ROUTES.manage.bookingDetail(trip.bookingId));
        return;
      }
      setRequestId(trip.id);
    },
    [canViewBooking, navigateOnce],
  );

  const tripDecisions = useMemo(
    () =>
      canApprove
        ? {
            onApprove: (trip: CustomerTrip) => openApprove(tripToDecisionTarget(trip)),
            onReject: (trip: CustomerTrip) => openReject(tripToDecisionTarget(trip)),
            onCancel: (trip: CustomerTrip) => openCancel(tripToDecisionTarget(trip)),
          }
        : undefined,
    [canApprove, openApprove, openReject, openCancel],
  );

  /*
   * `decisionActionFor` (useCallback trong hook) chỉ đổi danh tính khi một mutation đổi trạng thái ⇒
   * `renderTrip` đổi theo đúng lúc đó và FlatList vẽ lại, nên thẻ đang chạy quyết định khoá nút.
   */
  const { decisionActionFor } = decisions;
  const renderTrip = useCallback(
    ({ item }: ListRenderItemInfo<CustomerTrip>) => (
      <TripCard
        trip={item}
        onPress={openTrip}
        {...(tripDecisions
          ? { decisions: { ...tripDecisions, pending: decisionActionFor(item.id) } }
          : {})}
      />
    ),
    [openTrip, tripDecisions, decisionActionFor],
  );

  const { hasNextPage, isFetchingNextPage, fetchNextPage, isRefetching, refetch } = query;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);
  // Bộ lọc chặng gạt gần hết trang đang có thì tự kéo tiếp — cùng luật `TripsScreen`.
  useEffect(() => {
    if (stage === null) return;
    if (!hasNextPage || isFetchingNextPage) return;
    if (visibleItems.length >= STAGE_FILTER_MIN_ROWS) return;
    void fetchNextPage();
  }, [stage, hasNextPage, isFetchingNextPage, fetchNextPage, visibleItems.length]);

  const closeRequest = () => {
    setRequestId(null);
    if (requestParam) router.setParams({ request: undefined });
  };

  // Chi tiết yêu cầu THAY nội dung danh sách — đóng lại là về đúng tab và vị trí đang đứng.
  if (requestId !== null) {
    const detail = request.data?.id === requestId ? request.data : null;
    if (detail) {
      return (
        <>
          <BookingRequestDetailScreen
            request={detail}
            onApprove={decisions.openApprove}
            onReject={decisions.openReject}
            onCancel={decisions.openCancel}
            onClose={closeRequest}
          />
          {decisions.sheets}
        </>
      );
    }
    return (
      <>
        <AppHeader title={tRequests('detail.title')} onBack={closeRequest} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          {request.isError ? (
            <ScreenError
              error={request.error}
              title={t('hostList.requestErrorTitle')}
              onRetry={() => void request.refetch()}
            />
          ) : (
            <ScreenLoading />
          )}
        </Screen>
      </>
    );
  }

  const history = filter === CUSTOMER_TRIP_FILTER.HISTORY;

  return (
    <>
      <ManageHeader />
      <Screen edges={['left', 'right', 'bottom']} scroll={false} padded={false}>
        <ManagePageTitle title={t('hostList.heading')} subtitle={t('hostList.sub')} />
        <TripFilterTabs
          value={filter}
          counts={counts}
          onChange={changeFilter}
          domainLabel={domainLabel}
          stage={stage}
          onStageChange={setStage}
        />

        {query.isPending ? (
          <YStack p={layout.screenX} gap={layout.inline}>
            {Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <TripCardSkeleton key={i} />
            ))}
          </YStack>
        ) : query.isError ? (
          <ScreenError
            error={query.error}
            title={t('list.errorTitle')}
            onRetry={() => void refetch()}
          />
        ) : visibleItems.length === 0 && stage !== null ? (
          <ScreenMessage
            icon="filter-outline"
            title={t('list.stageEmptyTitle')}
            description={t('list.stageEmptyFiltered', {
              stage: domainLabel('customerTripStage', stage),
            })}
            actionLabel={t('list.stageClear')}
            actionIcon="close-circle-outline"
            onAction={() => setStage(null)}
          />
        ) : items.length === 0 ? (
          /*
            Hai tab trống, hai lối thoát: chưa có chuyến đang chạy thì việc có ích là xem lại xe
            (đã lên chợ chưa, giá, lịch); lịch sử trống thì quay về tab đang có chuyến.
          */
          <ScreenMessage
            icon="calendar-outline"
            title={history ? t('list.emptyHistoryTitle') : t('hostList.emptyCurrentTitle')}
            description={history ? t('list.emptyHistoryBody') : t('hostList.emptyCurrentBody')}
            actionLabel={history ? t('list.viewCurrent') : t('hostList.viewVehicles')}
            onAction={() =>
              history
                ? changeFilter(CUSTOMER_TRIP_FILTER.CURRENT)
                : navigateOnce(ROUTES.manage.vehicles())
            }
          />
        ) : (
          <FlatList
            data={visibleItems}
            keyExtractor={tripKey}
            renderItem={renderTrip}
            contentContainerStyle={styles.listContent}
            onEndReached={loadMore}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={() => void refetch()}
                tintColor={colors.primaryActive}
              />
            }
            ListFooterComponent={isFetchingNextPage ? TripCardSkeleton : null}
            {...LIST_TUNING}
          />
        )}
      </Screen>
      {decisions.sheets}
    </>
  );
}

const styles = StyleSheet.create({
  listContent: {
    gap: layout.inline,
    padding: layout.screenX,
  },
});
