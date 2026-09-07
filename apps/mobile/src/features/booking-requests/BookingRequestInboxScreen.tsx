import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { FlatList, RefreshControl, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BOOKING_REQUEST_STATUS, PERMISSION, SERVICE_TYPE_VALUES } from '@xeprime/types';
import { Screen } from '@/components/layout/Screen';
import { Chip } from '@/components/ui/Chip';
import { RecordCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManageListShell } from '@/features/shell/ManageListShell';
import type { FilterGroup } from '@/features/shell/ManageFilterSheet';
import { ManageStateScroll } from '@/features/shell/ManageStateScroll';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { FIRST_PAGE, useClampedPage } from '@/queries/use-clamped-page';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { ROUTES } from '@/navigation/routes';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { layout } from '@/theme/layout';
import { LIST_TUNING } from '@/theme/list-tuning';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { scrollThrottle } from '@/theme/motion';
import { BookingRequestDetailScreen } from './BookingRequestDetailScreen';
import { BookingRequestCard } from './components/BookingRequestCard';
import { ApproveRequestSheet } from './components/ApproveRequestSheet';
import { ApproveSuccessSheet } from './components/ApproveSuccessSheet';
import { RejectRequestSheet } from './components/RejectRequestSheet';
import {
  DEFAULT_REQUEST_TAB,
  REQUEST_INBOX_TABS,
  statusCountOf,
  useApproveBookingRequest,
  useBookingRequestsPage,
  useRejectBookingRequest,
} from './hooks/use-booking-requests';
import { useStickyStatusCounts, type StatusCounts } from './hooks/use-status-counts';
import type { BookingRequestItem } from './api';

/** Sentinel "mọi loại dịch vụ" của giao diện — API nhận `serviceType` vắng, không nhận `all`. */
const SERVICE_ALL = 'all';

const SKELETON_ROWS = 3;
const SEARCH_DEBOUNCE_MS = 350;

// Ở module scope, không inline: FlatList coi `keyExtractor` mới là prop đổi và dựng lại cả cây con.
const keyOf = (request: BookingRequestItem) => request.id;
const tabKeyOf = (tab: { value: string }) => tab.value;

/**
 * Hộp thư yêu cầu thuê (BKG-02 → 05).
 *
 * Tab theo VIỆC PHẢI LÀM, mặc định là `pending_host_approval` — mở màn ra là thấy đúng thứ cần
 * xử lý, không phải một danh sách trộn lẫn mọi thứ đã xong.
 *
 * `all` là giá trị THẬT của tab, không phải "không lọc": bỏ tham số đi thì màn rơi về mặc định
 * `pending_host_approval` và "Tất cả" không bao giờ giữ được. Nó chỉ được dịch thành "không gửi
 * `status`" ở lớp gọi API.
 *
 * Lọc và phân trang đều ở SERVER. Không có chỗ nào kéo cả kho về rồi cắt tại chỗ.
 */
export function BookingRequestInboxScreen() {
  const t = useTranslations('BookingRequests');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const permissions = usePermissions();
  const tLabels = useTranslations('Common.labels');
  const domainLabel = useDomainLabel();
  const navigateOnce = useNavigateOnce();

  const [status, setStatus] = useState<string>(DEFAULT_REQUEST_TAB);
  const [search, setSearch] = useState('');
  const [serviceType, setServiceType] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  const [approving, setApproving] = useState<BookingRequestItem | null>(null);
  const [rejecting, setRejecting] = useState<BookingRequestItem | null>(null);
  /** Yêu cầu vừa duyệt xong — mở hộp kết quả kèm lối sang đơn vừa tạo. */
  const [approved, setApproved] = useState<BookingRequestItem | null>(null);
  /** Yêu cầu đang xem chi tiết — CHƯA thành đơn (đã thành đơn thì sang màn đơn). */
  const [detail, setDetail] = useState<BookingRequestItem | null>(null);

  const [page, setPage] = useState(FIRST_PAGE);

  const query = useBookingRequestsPage({
    status,
    ...(debouncedSearch.trim() ? { q: debouncedSearch.trim() } : {}),
    ...(serviceType ? { serviceType } : {}),
    page,
  });

  const approve = useApproveBookingRequest();
  const reject = useRejectBookingRequest();

  const items = query.data?.items ?? [];
  const meta = query.data?.meta;

  /*
   * Duyệt / từ chối / huỷ làm danh sách ngắn đi, và trang đang đứng có thể biến mất theo —
   * xem `useClampedPage`. Không có nó thì một thao tác THÀNH CÔNG lại kết thúc bằng màn rỗng.
   */
  useClampedPage(meta, setPage);

  // KHÔNG đọc thẳng `query.data`: đổi tab là đổi khoá truy vấn nên `data` rỗng một nhịp, và cả
  // dải tab sẽ về 0 rồi mới nhảy lại.
  const statusCounts = useStickyStatusCounts(query.data);

  // Đổi bộ lọc là VỀ TRANG ĐẦU: đứng ở trang 7 rồi lọc còn 12 bản ghi thì trang 7 không tồn tại,
  // server trả rỗng và màn trông như "không có kết quả".
  const changeStatus = useCallback((next: string) => {
    setStatus(next);
    setPage(FIRST_PAGE);
  }, []);

  const changeServiceType = useCallback((next: string | null) => {
    setServiceType(next);
    setPage(FIRST_PAGE);
  }, []);

  /*
   * MỘT chiều lọc duy nhất nên là SELECT chứ không phải nút "Bộ lọc" mở tấm trượt — giá trị đang
   * chọn phải nhìn thấy ngay. Trạng thái ở lại dải tab vì tab mang SỐ ĐẾM.
   */
  /*
   * Bộ lọc đi qua TẤM TRƯỢT dùng chung, không phải một ô chọn riêng nằm cạnh ô tìm kiếm.
   *
   * Ô chọn riêng chỉ đủ cho ĐÚNG một chiều lọc, và nó đã ăn mất một mảng bề ngang của hàng tìm
   * kiếm để đổi lấy một chiều duy nhất. Tấm trượt cho màn này giống hệt màn Đơn thuê — cùng một
   * nút, cùng một cách đọc "đang lọc gì", và thêm chiều thứ hai sau này không phải đụng bố cục.
   *
   * Trạng thái KHÔNG vào đây: nó đã là dải tab ngay trên, và để ở cả hai chỗ thì người dùng đổi
   * một nơi rồi ngồi tìm xem vì sao nơi kia không khớp.
   */
  const groups = useMemo<readonly FilterGroup[]>(
    () => [
      {
        key: 'serviceType',
        label: t('filters.serviceType'),
        value: serviceType ?? SERVICE_ALL,
        resetValue: SERVICE_ALL,
        options: [
          { value: SERVICE_ALL, label: tLabels('all') },
          ...SERVICE_TYPE_VALUES.map((value) => ({
            value,
            label: domainLabel('serviceType', value),
          })),
        ],
      },
    ],
    [t, tLabels, domainLabel, serviceType],
  );

  const changeFilter = useCallback(
    (_groupKey: string, value: string) => changeServiceType(value === SERVICE_ALL ? null : value),
    [changeServiceType],
  );

  const changeSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(FIRST_PAGE);
  }, []);

  // "Đang lọc" gồm CẢ ô tìm kiếm lẫn bộ chọn dịch vụ: chỉ xét từ khoá thì màn rỗng sẽ đổ lỗi cho
  // tab trong khi thủ phạm là bộ lọc, và người dùng không được mời gỡ nó.
  const hasFilters = debouncedSearch.trim().length > 0 || serviceType !== null;

  // "Xem chi tiết" dẫn tới ĐÂU là quyết định của màn này, không phải của thẻ: đã thành đơn thì mở
  // chi tiết ĐƠN, chưa có thì mở chi tiết YÊU CẦU.
  const openDetail = useCallback(
    (request: BookingRequestItem) => {
      if (request.bookingId && permissions.has(PERMISSION.BOOKING_VIEW)) {
        navigateOnce(ROUTES.manage.bookingDetail(request.bookingId));
        return;
      }
      setDetail(request);
    },
    [permissions, navigateOnce],
  );

  const renderItem = useCallback<ListRenderItem<BookingRequestItem>>(
    ({ item }) => (
      <BookingRequestCard
        request={item}
        onApprove={setApproving}
        onReject={setRejecting}
        onOpenDetail={openDetail}
      />
    ),
    [openDetail],
  );

  function confirmApprove(body?: Parameters<typeof approve.mutate>[0]['body']) {
    if (!approving) return;
    approve.mutate(
      { id: approving.id, ...(body ? { body } : {}) },
      {
        onSuccess: () => {
          toast.showSuccess(
            approving.longTermPackageMonths ? t('approve.successLongTerm') : t('approve.success'),
          );
          setApproving(null);
        },
        onError: (error) => toast.showError(errorMessage(error)),
      },
    );
  }

  function confirmReject(reason: string) {
    if (!rejecting) return;
    reject.mutate(
      { id: rejecting.id, reason },
      {
        onSuccess: () => {
          toast.showSuccess(t('reject.success'));
          setRejecting(null);
          setDetail(null);
        },
        onError: (error) => toast.showError(errorMessage(error)),
      },
    );
  }

  // Không có quyền xem thì đây là 403 của chính màn này — hiện trạng thái lỗi của nó, KHÔNG đá
  // về đăng nhập (`ScopeGuard` lo phần mất quyền gian hàng).
  if (!permissions.isLoading && !permissions.has(PERMISSION.BOOKING_REQUEST_VIEW)) {
    return (
      <>
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage icon="lock-closed-outline" title={t('page.title')} />
        </Screen>
      </>
    );
  }

  /*
   * Ba tấm trượt quyết định dựng MỘT lần rồi dùng ở cả hai nhánh render.
   *
   * Chúng mở được từ thẻ trong hộp thư LẪN từ màn chi tiết. Để chúng nằm riêng ở nhánh hộp thư
   * thì bấm "Duyệt & giữ xe" trong màn chi tiết chỉ đổi state mà không có gì hiện ra.
   */
  const decisionSheets = (
    <>
      {approving ? (
        <ApproveRequestSheet
          open
          onClose={() => setApproving(null)}
          request={approving}
          onConfirm={confirmApprove}
          loading={approve.isPending}
        />
      ) : null}

      {approved ? (
        <ApproveSuccessSheet request={approved} onClose={() => setApproved(null)} />
      ) : null}

      {rejecting ? (
        <RejectRequestSheet
          open
          onClose={() => setRejecting(null)}
          request={rejecting}
          onConfirm={confirmReject}
          loading={reject.isPending}
        />
      ) : null}
    </>
  );

  /*
   * Chi tiết THAY nội dung hộp thư thay vì push một route mới — đúng vai modal của web: đóng
   * lại là về đúng trang, bộ lọc và vị trí cuộn đang đứng, không tốn request nào đọc lại.
   */
  if (detail) {
    return (
      <>
        <BookingRequestDetailScreen
          request={detail}
          onApprove={setApproving}
          onReject={setRejecting}
          onClose={() => setDetail(null)}
        />
        {decisionSheets}
      </>
    );
  }

  return (
    <>
      <ManageHeader />
      <Screen edges={['left', 'right', 'bottom']} scroll={false} padded={false}>
        <ManageListShell
          title={t('page.title')}
          {...(meta === undefined ? {} : { total: t('page.totalLabel', { count: meta.total }) })}
          summary={<RequestStats counts={statusCounts} />}
          tabs={<StatusTabs value={status} onChange={changeStatus} counts={statusCounts} />}
          searchValue={search}
          searchLabel={t('filters.searchLabel')}
          searchPlaceholder={t('filters.searchPlaceholder')}
          onSearchChange={changeSearch}
          groups={groups}
          onFilterChange={changeFilter}
          {...(meta === undefined ? {} : { meta })}
          onPageChange={setPage}
        >
          {({ onScroll, headerHeight, contentContainerStyle }) => {
            // Khung xương, lỗi và rỗng đều đi qua MỘT vùng cuộn có kéo-làm-mới: đúng lúc cần làm
            // mới nhất (rỗng, hoặc vừa mất sóng) mà là khối tĩnh thì không kéo được gì.
            // Là HÀM trả JSX chứ không phải component khai trong render — component mới mỗi lần
            // render là React tháo vùng cuộn ra gắn lại đúng lúc `isRefetching` đổi.
            const inStateScroll = (children: ReactNode) => (
              <ManageStateScroll
                onScroll={onScroll}
                headerHeight={headerHeight}
                refreshing={query.isRefetching}
                onRefresh={() => void query.refetch()}
              >
                {children}
              </ManageStateScroll>
            );

            return query.isPending ? (
              inStateScroll(
                <YStack px={layout.screenX} gap={layout.inline}>
                  {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                    <RecordCardSkeleton key={i} />
                  ))}
                </YStack>,
              )
            ) : query.isError ? (
              inStateScroll(
                <ScreenError
                  error={query.error}
                  title={t('states.errorTitle')}
                  onRetry={() => void query.refetch()}
                />,
              )
            ) : items.length === 0 ? (
              /*
                BA nguyên nhân rỗng, ba màn khác nhau — gương đúng `EmptyState` của web. Nói sai
                nguyên nhân là dẫn người dùng đi sai đường:

                  · đang lọc/tìm  → không có kết quả khớp, lối ra là mở lại tấm lọc;
                  · tab Cần xử lý → tin VUI: hộp thư sạch, không có gì phải làm;
                  · tab khác      → tab đó chưa có yêu cầu nào, lối ra là đổi tab.
              */
              inStateScroll(
                hasFilters ? (
                  <ScreenMessage
                    icon="search-outline"
                    title={t('states.emptySearchTitle')}
                    description={t('states.emptySearchBody')}
                  />
                ) : status === DEFAULT_REQUEST_TAB ? (
                  <ScreenMessage
                    icon="checkmark-done-outline"
                    title={t('states.emptyPendingTitle')}
                    description={t('states.emptyPendingBody')}
                  />
                ) : (
                  <ScreenMessage
                    icon="mail-open-outline"
                    title={t('states.emptyFilteredTitle')}
                    description={t('states.emptyFilteredBody')}
                  />
                ),
              )
            ) : (
              <Animated.FlatList
                data={items}
                keyExtractor={keyOf}
                {...LIST_TUNING}
                renderItem={renderItem}
                contentContainerStyle={contentContainerStyle}
                onScroll={onScroll}
                scrollEventThrottle={scrollThrottle.frame}
                refreshControl={
                  /*
                    `progressViewOffset` BẮT BUỘC: khối đầu trang nằm `position: absolute` ĐÈ lên
                    danh sách, không có offset thì vòng xoay vẽ ở mép trên vùng cuộn và NẤP TRỌN
                    sau khối đó — kéo vẫn gọi API nhưng người dùng không thấy gì.
                  */
                  <RefreshControl
                    refreshing={query.isRefetching}
                    onRefresh={() => void query.refetch()}
                    tintColor={colors.primaryActive}
                    progressViewOffset={headerHeight}
                  />
                }
              />
            );
          }}
        </ManageListShell>
      </Screen>

      {decisionSheets}
    </>
  );
}

/**
 * Hai con số quan trọng nhất của hộp thư, tách khỏi dải tab: **còn bao nhiêu việc** và **đã chốt
 * được bao nhiêu**. Gương `headerStats` của web.
 *
 * Lấy từ CÙNG bảng đếm mà tab dùng, nên không có đường nào để hai chỗ nói hai con số khác nhau.
 */
function RequestStats({ counts }: { counts: StatusCounts }) {
  const t = useTranslations('BookingRequests.stats');

  return (
    <XStack
      mx={layout.screenX}
      mb={space.sm}
      px={space.md}
      py={space.sm}
      br={radius.md}
      borderWidth={1}
      borderColor={colors.border}
      bg={colors.surface}
    >
      <StatCell
        label={t('pending')}
        count={statusCountOf(counts, BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL)}
      />
      {/* Đường kẻ dọc dựng bằng viền của ô sau, không thêm một phần tử rỗng — như web. */}
      <StatCell
        label={t('converted')}
        count={statusCountOf(counts, BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING)}
        divided
      />
    </XStack>
  );
}

function StatCell({
  label,
  count,
  divided = false,
}: {
  label: string;
  count: number;
  divided?: boolean;
}) {
  const fmt = useAppFormat();

  return (
    <YStack
      f={1}
      ai="center"
      gap={2}
      {...(divided ? { pl: space.md, borderLeftWidth: 1, borderColor: colors.border } : {})}
    >
      <Text col={colors.textMuted} fos={fontSize.label} fow={fontWeight.semibold}>
        {label.toUpperCase()}
      </Text>
      <Text col={colors.primaryActive} fos={fontSize.h3} fow={fontWeight.bold}>
        {fmt.count(count)}
      </Text>
    </YStack>
  );
}

function StatusTabs({
  value,
  onChange,
  counts,
}: {
  value: string;
  onChange: (next: string) => void;
  counts: StatusCounts;
}) {
  const t = useTranslations('BookingRequests.tabs');

  return (
    <FlatList
      horizontal
      data={REQUEST_INBOX_TABS}
      keyExtractor={tabKeyOf}
      /*
        KHÔNG dùng `LIST_TUNING` ở đây: hằng đó tính cho danh sách THẺ cuộn dọc dài. Dải tab chỉ
        có vài mục và cuộn ngang — `initialNumToRender: 6` sẽ giấu tab thứ bảy trở đi ở khung hình
        đầu, còn `removeClippedSubviews` trên danh sách ngang là nguồn lỗi ô trắng.
      */
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: layout.screenX, gap: space.xs }}
      // `flexGrow: 0`: một FlatList ngang trong cột dọc sẽ nuốt hết chiều cao còn lại.
      style={{ flexGrow: 0, paddingVertical: space.sm }}
      accessibilityLabel={t('ariaLabel')}
      renderItem={({ item }) => {
        const count = statusCountOf(counts, item.value);
        /*
         * Con số đi SAU nhãn, không phải "(2)" trong ngoặc: ngoặc đọc thành chú thích phụ, còn ở
         * đây con số là dữ liệu chính. Hiện cả khi bằng 0 — tab nhảy có/không con số làm cả dải
         * đổi bề rộng mỗi lần dữ liệu về.
         */
        return (
          <Chip
            label={`${t(item.labelKey)}  ${count}`}
            selected={value === item.value}
            size="sm"
            onPress={() => onChange(item.value)}
          />
        );
      }}
    />
  );
}
