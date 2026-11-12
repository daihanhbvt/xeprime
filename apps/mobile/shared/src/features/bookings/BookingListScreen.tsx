import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { FlatList, RefreshControl, StyleSheet, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BOOKING_LIST_PRESET,
  BOOKING_STATUS_SELECTABLE_VALUES,
  PERMISSION,
  type BookingListPreset,
  SERVICE_TYPE_VALUES,
} from '@xeprime/types';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/layout/Screen';
import { RecordCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManageListShell } from '@/features/shell/ManageListShell';
import { withBranchReturn } from '@/features/branches/branch-link';
import {
  BranchFilterField,
  useBranchEmptyCopy,
} from '@/features/branches/components/BranchFilterField';
import { useScreenBranchFilter } from '@/features/branches/hooks/use-branch-filter';
import { ManageStateScroll } from '@/features/shell/ManageStateScroll';
import type { FilterGroup } from '@/features/shell/ManageFilterSheet';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { FIRST_PAGE, useClampedPage } from '@/queries/use-clamped-page';
import { useDomainLabel } from '@/i18n/domain';
import { ROUTES } from '@/navigation/routes';
import { useListParam, useListParamChange } from '@/navigation/list-params';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { layout } from '@/theme/layout';
import { LIST_TUNING } from '@/theme/list-tuning';
import { useColors } from '@/theme/ThemeProvider';
import { scrollThrottle } from '@/theme/motion';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import { BookingCard } from './components/BookingCard';
import { ExtendBookingSheet } from './components/ExtendBookingSheet';
import { useBookingsPage } from './hooks/use-bookings';
import { usePaymentArrivalToast } from './hooks/use-payment-arrival-toast';
import { useCanCreateBooking } from './hooks/use-can-create-booking';
import type { BookingListItem, BookingListMeta, BookingSort } from './api';

/** Khớp `BOOKING_SORT` ở DTO backend — bốn giá trị, không nhiều hơn. */
const BOOKING_SORT_VALUES: readonly BookingSort[] = [
  'newest',
  'pickup_asc',
  'pickup_desc',
  'return_asc',
];

const DEFAULT_SORT: BookingSort = 'newest';

const SKELETON_ROWS = 3;
const SEARCH_DEBOUNCE_MS = 350;

/** Sentinel "mọi trạng thái" của giao diện — không endpoint nào nhận `status=all`. */
const STATUS_ALL = 'all';

/** Ngăn "Tất cả" xem trước chừng này đơn mỗi chặng — đúng `ALL_VIEW_GROUP_LIMIT` của web. */
const ALL_VIEW_GROUP_LIMIT = 3;

/*
 * Hai chặng ĐƠN đang chạy. Hai ngăn đã kết thúc (Hoàn thành / Đã huỷ) rời màn này sang "Đơn đã kết
 * thúc" (05/11/2026, web `bookingsGroupPath`) — "Tất cả" chỉ gồm hai chặng này.
 */
const PRESET_ORDER = [BOOKING_LIST_PRESET.AWAITING_PICKUP, BOOKING_LIST_PRESET.RENTING] as const;
type ActivePreset = (typeof PRESET_ORDER)[number];

/** Dòng của danh sách: đầu chặng · thẻ đơn · nút "Xem tất cả" của chặng (chỉ ở ngăn "Tất cả"). */
type ListRow =
  | { kind: 'head'; preset: ActivePreset; count: number }
  | { kind: 'booking'; preset: ActivePreset | undefined; booking: BookingListItem }
  | { kind: 'more'; preset: ActivePreset; count: number };

// Ở module scope, không inline: FlatList coi `keyExtractor` mới là prop đổi và dựng lại cả cây con.
const keyOf = (row: ListRow) =>
  row.kind === 'booking' ? row.booking.id : `${row.kind}:${row.preset}`;

/**
 * Danh sách đơn thuê (BKG-07).
 *
 * Lọc, sắp xếp và cắt trang đều ở SERVER (`q`, `status`, `sort`, `page`) — không có chỗ nào kéo
 * cả kho về rồi lọc tại chỗ. Bộ lọc sống ở state màn hình: mobile không có URL để chia sẻ, và bộ
 * lọc này chết theo màn (ADR 0004).
 */
export function BookingListScreen({
  vehicleId,
  preset,
}: {
  vehicleId?: string;
  /**
   * Nhóm việc dựng sẵn gửi thẳng lên server. Bỏ trống = danh sách đầy đủ.
   *
   * Hai MÀN dùng chung component này và cả hai gọi cùng một endpoint: nhóm việc chỉ thêm một
   * tham số vào truy vấn, nó không phải một màn thứ hai với dữ liệu riêng.
   */
  preset?: BookingListPreset;
}) {
  const colors = useColors();
  const t = useTranslations('Bookings.list');
  const tRoot = useTranslations('Bookings');
  const tActions = useTranslations('Common.actions');
  const navigateOnce = useNavigateOnce();
  const permissions = usePermissions();
  // Lập đơn tay: quyền + tuyến gói (web `useCanCreateBooking`).
  const canCreate = useCanCreateBooking();
  const domainLabel = useDomainLabel();
  // Toast "Ghi nhận thanh toán" khi khách trả đủ tiền giữ chỗ lúc màn đang mở (web 05/11/2026).
  usePaymentArrivalToast({
    enabled: permissions.has(PERMISSION.BOOKING_REQUEST_VIEW),
    canOpenBooking: permissions.has(PERMISSION.BOOKING_VIEW),
  });

  /*
   * Ngăn của "Quản lý đơn thuê xe" (02/11/2026, web `?preset=`): bốn ngăn phủ kín mọi đơn, số đếm
   * do server trả cùng trang (`meta.presetCounts`). Màn mở bằng route nhóm việc thì ngăn CỐ ĐỊNH
   * theo route — không có dải chọn.
   */
  const [view, setView] = useState<BookingListPreset | undefined>(undefined);
  const activePreset = preset ?? view;
  const awaitingPickup = activePreset === BOOKING_LIST_PRESET.AWAITING_PICKUP;
  // Gia hạn ngay từ thẻ (ADR 0077) — cùng cổng quyền với web `canExtend`.
  const canExtend = permissions.has(PERMISSION.BOOKING_UPDATE);
  const [extending, setExtending] = useState<BookingListItem | null>(null);

  /*
   * Bộ lọc KHỞI TẠO từ tham số route — thẻ Tổng quan mở sẵn "Đang thuê, trả sớm nhất trước" như
   * `?status=active&sort=return_asc` của web. Giá trị lạ bị bỏ qua; người dùng vẫn đổi được.
   */
  const routeStatus = useListParam(
    'status',
    awaitingPickup ? [] : BOOKING_STATUS_SELECTABLE_VALUES,
  );
  const routeSort = useListParam('sort', BOOKING_SORT_VALUES);
  const [status, setStatus] = useState<string>(routeStatus ?? STATUS_ALL);
  /*
   * Nhóm việc quyết cách sắp xếp MẶC ĐỊNH: một ca trực đọc theo giờ hẹn, không theo ngày tạo.
   * Server cũng mặc định đúng như vậy — đặt tường minh ở đây chỉ để ô "Sắp xếp" trên màn không
   * nói một đằng còn dữ liệu một nẻo.
   */
  const [sort, setSort] = useState<BookingSort>(
    routeSort ?? (awaitingPickup ? 'pickup_asc' : DEFAULT_SORT),
  );
  const [search, setSearch] = useState('');
  const [serviceType, setServiceType] = useState<string>(STATUS_ALL);
  const [page, setPage] = useState(FIRST_PAGE);
  useListParamChange('status', routeStatus, (next) => {
    setStatus(next);
    setPage(FIRST_PAGE);
  });
  useListParamChange('sort', routeSort, (next) => {
    setSort(next);
    setPage(FIRST_PAGE);
  });
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  /* Ô "Chi nhánh" (ADR 0052) — cả "Tất cả đơn thuê" lẫn hàng đợi "Chờ giao xe". */
  const { branchId, filter: branchFilter } = useScreenBranchFilter(() => setPage(FIRST_PAGE));
  const branchEmpty = useBranchEmptyCopy(branchFilter, branchId);

  /*
   * Ngăn "Tất cả" của web (05/11/2026) là các chặng ĐANG CHẠY, mỗi chặng xem trước vài đơn kèm
   * "Xem tất cả (n)" — KHÔNG gồm đơn đã hoàn thành/huỷ (chúng ở "Đơn đã kết thúc"). Không endpoint
   * nào nhận nhiều nhóm việc, nên ngăn này là hai truy vấn nhỏ cùng phạm vi lọc. Lối từ Tổng quan
   * mang sẵn `?status=` thì giữ danh sách phẳng theo trạng thái đó để còn gỡ được.
   */
  const grouped = !activePreset && status === STATUS_ALL;
  const scope = {
    ...(branchId ? { branchId } : {}),
    ...(serviceType === STATUS_ALL ? {} : { serviceType }),
    // Lọc theo xe đến từ ĐƯỜNG DẪN, không phải tấm lọc: nó là ngữ cảnh của lối đi từ hồ sơ xe,
    // giống hệt `?vehicleId=` bên web.
    ...(vehicleId ? { vehicleId } : {}),
    ...(debouncedSearch.trim() ? { q: debouncedSearch.trim() } : {}),
    sort,
  };
  const query = useBookingsPage(
    grouped
      ? {
          ...scope,
          preset: BOOKING_LIST_PRESET.AWAITING_PICKUP,
          page: FIRST_PAGE,
          limit: ALL_VIEW_GROUP_LIMIT,
        }
      : {
          ...scope,
          ...(status === STATUS_ALL ? {} : { status }),
          ...(activePreset ? { preset: activePreset } : {}),
          page,
        },
  );
  const rentingPreview = useBookingsPage(
    {
      ...scope,
      preset: BOOKING_LIST_PRESET.RENTING,
      page: FIRST_PAGE,
      limit: ALL_VIEW_GROUP_LIMIT,
    },
    { enabled: grouped },
  );

  const items = query.data?.items;
  const meta = query.data?.meta;
  const rentingItems = rentingPreview.data?.items;
  const groupedTotal = meta
    ? meta.presetCounts
        .filter((c) => (PRESET_ORDER as readonly string[]).includes(c.preset))
        .reduce((sum, c) => sum + c.count, 0)
    : 0;

  const rows = useMemo<ListRow[]>(() => {
    if (!grouped) {
      return (items ?? []).map((booking) => ({ kind: 'booking' as const, preset: undefined, booking }));
    }
    const previews: Record<ActivePreset, readonly BookingListItem[]> = {
      [BOOKING_LIST_PRESET.AWAITING_PICKUP]: items ?? [],
      [BOOKING_LIST_PRESET.RENTING]: rentingItems ?? [],
    };
    const out: ListRow[] = [];
    for (const preset of PRESET_ORDER) {
      const groupItems = previews[preset];
      if (groupItems.length === 0) continue;
      const count =
        meta?.presetCounts.find((c) => c.preset === preset)?.count ?? groupItems.length;
      out.push({ kind: 'head', preset, count });
      for (const booking of groupItems) out.push({ kind: 'booking', preset, booking });
      if (count > groupItems.length) out.push({ kind: 'more', preset, count });
    }
    return out;
  }, [grouped, items, rentingItems, meta]);

  /*
   * Duyệt / từ chối / huỷ làm danh sách ngắn đi, và trang đang đứng có thể biến mất theo —
   * xem `useClampedPage`. Không có nó thì một thao tác THÀNH CÔNG lại kết thúc bằng màn rỗng.
   */
  useClampedPage(meta, setPage);

  /*
   * Mọi thay đổi bộ lọc đều VỀ TRANG 1.
   *
   * Đứng ở trang 7 rồi lọc còn 12 bản ghi thì trang 7 không tồn tại — server trả rỗng và màn
   * hình trông như "không có kết quả", trong khi thật ra có 12 cái ở trang 1.
   */
  const changeSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(FIRST_PAGE);
  }, []);

  const changeFilter = useCallback((groupKey: string, value: string) => {
    if (groupKey === 'status') setStatus(value);
    else if (groupKey === 'serviceType') setServiceType(value);
    else setSort(value as BookingSort);
    setPage(FIRST_PAGE);
  }, []);

  /**
   * Hai chiều của màn này: LỌC theo trạng thái và SẮP XẾP.
   *
   * Gộp chung một tấm trượt dù khác ngữ nghĩa — vì với người dùng thì cả hai đều là "chỉnh cách
   * danh sách hiện ra", và tách làm hai nút là hai lối vào cho một ý định. Nhãn khối bên trong
   * giữ hai thứ không lẫn nhau.
   */
  const groups = useMemo<readonly FilterGroup[]>(
    () => [
      /*
       * ADR 0047: "Chờ giao xe" đã LÀ một nhóm việc lọc sẵn — ô lọc trạng thái ở đó là thừa, và
       * sau khi `confirmed` rời khỏi luồng thật thì giá trị khả dĩ duy nhất của nhóm này chỉ còn
       * đúng MỘT (`reserved`). Một ô lọc một lựa chọn không phải bộ lọc, nó là trang trí — bỏ
       * hẳn chiều lọc thay vì chỉ thu hẹp danh sách.
       *
       * "Tất cả đơn thuê" giữ ô lọc, nhưng chỉ còn 5 trạng thái nghiệp vụ thật
       * (`BOOKING_STATUS_SELECTABLE_VALUES`) — loại `confirmed` (deprecated), thứ chưa từng là
       * một trạng thái nghỉ hợp lệ trong bất kỳ luồng sản phẩm nào.
       */
      // Web bỏ ô "Trạng thái" (02/11/2026) — thay bằng dải NGĂN. Chỉ còn khi đang lọc sẵn một trạng thái (lối từ Tổng quan `?status=`) để còn gỡ được.
      ...(awaitingPickup || status === STATUS_ALL
        ? []
        : [
            {
              key: 'status',
              label: t('statusLabel'),
              value: status,
              resetValue: STATUS_ALL,
              options: [
                { value: STATUS_ALL, label: t('statusAll') },
                ...BOOKING_STATUS_SELECTABLE_VALUES.map((value) => ({
                  value,
                  label: domainLabel('bookingStatus', value),
                })),
              ],
            },
          ]),
      // Loại dịch vụ của ĐƠN — có ở CẢ hai nhóm việc (19/10/2026), cùng ô lọc bên web.
      {
        key: 'serviceType',
        label: t('serviceLabel'),
        value: serviceType,
        resetValue: STATUS_ALL,
        options: [
          { value: STATUS_ALL, label: t('serviceAll') },
          ...SERVICE_TYPE_VALUES.map((value) => ({
            value,
            label: domainLabel('serviceType', value),
          })),
        ],
      },
      {
        key: 'sort',
        label: t('sortLabel'),
        value: sort,
        resetValue: awaitingPickup ? 'pickup_asc' : DEFAULT_SORT,
        options: BOOKING_SORT_VALUES.map((value) => ({ value, label: sortLabel(t, value) })),
      },
    ],
    [t, domainLabel, status, serviceType, sort, awaitingPickup],
  );

  const openBooking = useCallback(
    (booking: BookingListItem) => navigateOnce(ROUTES.manage.bookingDetail(booking.id)),
    [navigateOnce],
  );

  const showPreset = useCallback((next: ActivePreset) => {
    setView(next);
    setPage(FIRST_PAGE);
  }, []);

  const renderItem = useCallback<ListRenderItem<ListRow>>(
    ({ item }) =>
      item.kind === 'head' ? (
        <StageHeading preset={item.preset} count={item.count} />
      ) : item.kind === 'more' ? (
        <XStack px={layout.screenX} pb={layout.inline}>
          <Button
            label={tRoot('board.viewAll', { count: item.count })}
            variant="ghost"
            size="sm"
            onPress={() => showPreset(item.preset)}
          />
        </XStack>
      ) : (
        <BookingCard
          booking={item.booking}
          onPress={openBooking}
          awaitingPickup={
            item.preset ? item.preset === BOOKING_LIST_PRESET.AWAITING_PICKUP : awaitingPickup
          }
          {...(canExtend ? { onExtend: setExtending } : {})}
        />
      ),
    [openBooking, awaitingPickup, canExtend, tRoot, showPreset],
  );

  const filtered =
    status !== STATUS_ALL || serviceType !== STATUS_ALL || debouncedSearch.trim().length > 0;

  /**
   * Gỡ hai chiều LỌC, giữ nguyên cách SẮP XẾP — cùng phạm vi `onClearFilters` của web.
   *
   * Sắp xếp không phải bộ lọc: nó không giấu bản ghi nào, nên "xoá bộ lọc" mà đổi luôn thứ tự
   * là làm một việc người dùng không yêu cầu.
   */
  const clearFilters = useCallback(() => {
    setStatus(STATUS_ALL);
    setServiceType(STATUS_ALL);
    setSearch('');
    setPage(FIRST_PAGE);
  }, []);

  const refetchAll = () => {
    void query.refetch();
    if (grouped) void rentingPreview.refetch();
  };

  // Thiếu quyền là 403 của CHÍNH màn này — hiện trạng thái lỗi của nó, không đá về đăng nhập.
  if (!permissions.isLoading && !permissions.has(PERMISSION.BOOKING_VIEW)) {
    return (
      <>
        <ManageHeader />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage icon="lock-closed-outline" title={t('title')} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <ManageHeader />
      <Screen edges={['left', 'right', 'bottom']} scroll={false} padded={false}>
        <ManageListShell
          title={awaitingPickup ? tRoot('awaitingPickup.title') : t('title')}
          {...(meta === undefined
            ? {}
            : {
                total: awaitingPickup
                  ? tRoot('awaitingPickup.totalLabel', { count: meta.total })
                  : t('totalLabel', { count: grouped ? groupedTotal : meta.total }),
              })}
          /*
           * Nhóm việc KHÔNG có nút tạo đơn: đây là hàng đợi của việc đang chạy, không phải chỗ
           * mở một chuyến mới. Lối tạo đơn nằm ở "Tất cả đơn thuê" và ở lịch — và trạng thái
           * rỗng bên dưới dẫn thẳng sang đó.
           */
          action={
            canCreate && !awaitingPickup ? (
              <IconButton
                icon="add"
                // Nút ở đầu danh sách: `Bookings.list.create` ("Tạo đơn") — đúng nút của web.
                label={t('create')}
                tone="primary"
                // Bộ chọn xe mở sẵn ở chi nhánh đang lọc — gợi ý, đổi được (ADR 0052 điều 6).
                onPress={() =>
                  navigateOnce(withBranchReturn(ROUTES.manage.bookingCreate(), branchId))
                }
              />
            ) : null
          }
          branch={<BranchFilterField filter={branchFilter} value={branchId} />}
          searchValue={search}
          searchLabel={t('searchLabel')}
          searchPlaceholder={t('searchPlaceholder')}
          onSearchChange={changeSearch}
          {...(preset ? {} : {
            tabs: (
              <PresetTabs
                value={view}
                meta={meta}
                onChange={(next) => {
                  setView(next);
                  setPage(FIRST_PAGE);
                }}
              />
            ),
          })}
          hasRows={rows.length > 0}
          groups={groups}
          onFilterChange={changeFilter}
          {...(meta === undefined || grouped ? {} : { meta })}
          onPageChange={setPage}
        >
          {({ onScroll, headerHeight, contentContainerStyle, bindList }) => {
            /*
              Khung xương, lỗi và rỗng đều đi qua MỘT vùng cuộn có kéo-làm-mới. Trước đây chúng
              là khối tĩnh, nên đúng lúc cần làm mới nhất — danh sách rỗng, hoặc vừa mất sóng —
              lại là lúc không kéo được gì.

              Là HÀM trả JSX chứ không phải component khai trong render — component mới mỗi lần
              render là React tháo vùng cuộn ra gắn lại đúng lúc `isRefetching` đổi.
            */
            const inStateScroll = (children: ReactNode) => (
              <ManageStateScroll
                onScroll={onScroll}
                headerHeight={headerHeight}
                refreshing={query.isRefetching || rentingPreview.isRefetching}
                onRefresh={refetchAll}
              >
                {children}
              </ManageStateScroll>
            );

            return query.isPending || (grouped && rentingPreview.isPending) ? (
              inStateScroll(
                <YStack px={layout.screenX} gap={layout.inline}>
                  {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                    <RecordCardSkeleton key={i} />
                  ))}
                </YStack>,
              )
            ) : query.isError || (grouped && rentingPreview.isError) ? (
              inStateScroll(
                <ScreenError
                  error={query.error ?? rentingPreview.error}
                  title={t('errorTitle')}
                  onRetry={refetchAll}
                />,
              )
            ) : rows.length === 0 ? (
              /*
                Đang lọc mà rỗng thì lối ra là GỠ bộ lọc — nút phải nằm ngay đó. Không có nút,
                người dùng đứng trước một màn trắng và cách duy nhất là tự nhớ mình đã lọc gì.
              */
              inStateScroll(
                branchEmpty && !filtered ? (
                  <ScreenMessage
                    icon="location-outline"
                    title={branchEmpty.title}
                    description={branchEmpty.hint}
                  />
                ) : filtered ? (
                  <ScreenMessage
                    icon="search-outline"
                    title={
                      awaitingPickup
                        ? tRoot('awaitingPickup.emptyFilteredTitle')
                        : t('emptyFilteredTitle')
                    }
                    description={
                      awaitingPickup
                        ? tRoot('awaitingPickup.emptyFilteredBody')
                        : t('emptyFilteredBody')
                    }
                    /* Đúng `onClearFilters` của web: gỡ từ khoá + trạng thái, GIỮ cách sắp xếp. */
                    actionLabel={tActions('clear')}
                    onAction={clearFilters}
                  />
                ) : awaitingPickup ? (
                  /*
                    Rỗng ở hàng đợi là tin TỐT (không còn xe nào phải giao), nên nó không dùng
                    hình "chưa có gì" mà dẫn thẳng sang danh sách đầy đủ — đúng `goToAll` của web.
                  */
                  <ScreenMessage
                    icon="checkmark-done-outline"
                    title={tRoot('awaitingPickup.emptyTitle')}
                    description={tRoot('awaitingPickup.emptyBody')}
                    // Màn trống dữ liệu chỉ mô tả, không nút chuyển (người dùng chốt 27/10/2026).
                  />
                ) : (
                  <ScreenMessage
                    icon="document-text-outline"
                    title={t('emptyTitle')}
                    description={t('emptyBody')}
                    // Màn trống dữ liệu chỉ mô tả, không nút tạo đơn (người dùng chốt 27/10/2026) —
                    // tạo đơn vẫn có ở nút đầu màn.
                  />
                ),
              )
            ) : (
              <Animated.FlatList
                ref={bindList}
                data={rows}
                keyExtractor={keyOf}
                {...LIST_TUNING}
                renderItem={renderItem}
                contentContainerStyle={contentContainerStyle}
                onScroll={onScroll}
                scrollEventThrottle={scrollThrottle.frame}
                refreshControl={
                  /*
                    `progressViewOffset` BẮT BUỘC ở đây.

                    Khối đầu trang (tiêu đề, chỉ số, dải tab, ô tìm kiếm) nằm `position: absolute`
                    ĐÈ lên danh sách. Không có offset thì vòng xoay vẽ ở mép trên của vùng cuộn —
                    tức là NẤP TRỌN sau khối đó. Kéo xuống vẫn gọi API thật, nhưng người dùng
                    không thấy gì nên kết luận là màn này không có kéo-làm-mới.

                    Đẩy xuống đúng chiều cao khối là vòng xoay rơi vào khoảng trống ngay dưới nó.
                    `ManageStateScroll` đã làm vậy từ đầu; hai danh sách này thì bị sót.
                  */
                  <RefreshControl
                    refreshing={query.isRefetching || rentingPreview.isRefetching}
                    onRefresh={refetchAll}
                    tintColor={colors.primaryActive}
                    progressViewOffset={headerHeight}
                  />
                }
              />
            );
          }}
        </ManageListShell>
      </Screen>
      {extending ? (
        <ExtendBookingSheet booking={extending} onClose={() => setExtending(null)} />
      ) : null}
    </>
  );
}

/** Liệt kê tường minh — khoá i18n ghép động lọt qua typecheck của `use-intl`. */
function sortLabel(
  t: ReturnType<typeof useTranslations<'Bookings.list'>>,
  sort: BookingSort,
): string {
  switch (sort) {
    case 'pickup_asc':
      return t('sort.pickup_asc');
    case 'pickup_desc':
      return t('sort.pickup_desc');
    case 'return_asc':
      return t('sort.return_asc');
    default:
      return t('sort.newest');
  }
}

/* Dải ngăn giữ việc ĐANG chạy; chip cuối là lối sang màn "Đơn đã kết thúc". */
const ENDED_TAB = 'ended';
type PresetTab = BookingListPreset | 'all' | typeof ENDED_TAB;
const presetKeyOf = (item: PresetTab) => item;

/** Dải ngăn "Tất cả · Chờ giao xe · Đang thuê · Hoàn thành · Đã hủy" — bản native của `StatusRail` web. */
function PresetTabs({
  value,
  meta,
  onChange,
}: {
  value: BookingListPreset | undefined;
  meta: BookingListMeta | undefined;
  onChange: (next: BookingListPreset | undefined) => void;
}) {
  const t = useTranslations('Bookings.board');
  const navigateOnce = useNavigateOnce();
  const counts = meta?.presetCounts ?? null;
  const countOf = (item: PresetTab): number | null =>
    counts === null
      ? null
      : item === 'all'
        ? // Như `allCount` của web: tổng các chặng ĐANG CHẠY, không gồm hoàn thành/huỷ.
          counts
            .filter((c) => (PRESET_ORDER as readonly string[]).includes(c.preset))
            .reduce((sum, c) => sum + c.count, 0)
        : (counts.find((c) => c.preset === item)?.count ?? 0);

  return (
    <FlatList
      horizontal
      data={['all', ...PRESET_ORDER, ENDED_TAB] as PresetTab[]}
      keyExtractor={presetKeyOf}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={presetStyles.content}
      style={presetStyles.tabs}
      accessibilityLabel={t('railLabel')}
      renderItem={({ item }) => {
        if (item === ENDED_TAB) {
          return (
            <Chip
              label={t('ended')}
              selected={false}
              size="sm"
              onPress={() => navigateOnce(ROUTES.manage.bookingsEnded())}
            />
          );
        }
        const count = countOf(item);
        const label =
          item === BOOKING_LIST_PRESET.AWAITING_PICKUP
            ? t('stage.awaiting_pickup')
            : item === BOOKING_LIST_PRESET.RENTING
              ? t('stage.renting')
              : t('all');
        return (
          <Chip
            label={count === null ? label : `${label}  ${count}`}
            selected={(value ?? 'all') === item}
            size="sm"
            onPress={() => onChange(item === 'all' ? undefined : item)}
          />
        );
      }}
    />
  );
}

const presetStyles = StyleSheet.create({
  tabs: { flexGrow: 0, paddingVertical: space.sm },
  content: { paddingHorizontal: layout.screenX, gap: space.xs },
});

/** Đầu một chặng trong ngăn "Tất cả" — bản native của `RentalStageHeading` web. */
function StageHeading({ preset, count }: { preset: ActivePreset; count: number }) {
  const colors = useColors();
  const t = useTranslations('Bookings.board');
  return (
    <XStack px={layout.screenX} pt={space.sm} pb={space.xs} gap={space.xs} alignItems="center">
      <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
        {preset === BOOKING_LIST_PRESET.AWAITING_PICKUP
          ? t('stage.awaiting_pickup')
          : t('stage.renting')}
      </Text>
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {count}
      </Text>
    </XStack>
  );
}
