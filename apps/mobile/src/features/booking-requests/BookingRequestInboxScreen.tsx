import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { FlatList, RefreshControl, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PERMISSION, SERVICE_TYPE_VALUES } from '@xeprime/types';
import { Screen } from '@/components/layout/Screen';
import { Chip } from '@/components/ui/Chip';
import { RecordCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { getErrorCode } from '@/lib/api-client';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManageListShell } from '@/features/shell/ManageListShell';
import type { FilterGroup } from '@/features/shell/ManageFilterSheet';
import { ManageStateScroll } from '@/features/shell/ManageStateScroll';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { FIRST_PAGE, useClampedPage } from '@/queries/use-clamped-page';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { ROUTES } from '@/navigation/routes';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { layout } from '@/theme/layout';
import { LIST_TUNING } from '@/theme/list-tuning';
import { colors, space } from '@/theme/tokens';
import { scrollThrottle } from '@/theme/motion';
import { cancelErrorKey, decisionErrorKey } from './decision-error';
import { BookingRequestDetailScreen } from './BookingRequestDetailScreen';
import { BookingRequestCard } from './components/BookingRequestCard';
import { ApproveRequestSheet } from './components/ApproveRequestSheet';
import { ApproveSuccessSheet } from './components/ApproveSuccessSheet';
import { CancelRequestSheet } from './components/CancelRequestSheet';
import { RejectRequestSheet } from './components/RejectRequestSheet';
import {
  DEFAULT_REQUEST_TAB,
  REQUEST_INBOX_TABS,
  statusCountOf,
  useApproveBookingRequest,
  useBookingRequestsPage,
  useCancelBookingRequest,
  useRejectBookingRequest,
} from './hooks/use-booking-requests';
import { useStickyStatusCounts, type StatusCounts } from './hooks/use-status-counts';
import { type BookingRequestItem, type CancelBookingRequestInput } from './api';

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
 * ĐÚNG BA TAB (ADR 0047), mỗi tab một câu hỏi vận hành: **Cần xử lý** (gian hàng phải bấm một
 * quyết định) · **Chờ khách thanh toán** (quả bóng sang chân khách) · **Đã đóng** (mọi kết cục
 * không-thành-đơn). Mặc định mở ở tab đầu — vào màn là thấy đúng thứ cần xử lý, không phải một
 * danh sách trộn lẫn mọi thứ đã xong.
 *
 * Không còn tab "Tất cả" và không còn khối hai con số ở đầu màn: ba tab đã phủ hết 11 trạng
 * thái, và badge trên mỗi tab đã nói đúng những con số đó (xem ghi chú ở `StatusTabs`).
 *
 * Lọc và phân trang đều ở SERVER. Không có chỗ nào kéo cả kho về rồi cắt tại chỗ.
 */
export function BookingRequestInboxScreen() {
  const t = useTranslations('BookingRequests');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const permissions = usePermissions();
  const tLabels = useTranslations('Common.labels');
  const tActions = useTranslations('Common.actions');
  const domainLabel = useDomainLabel();
  const navigateOnce = useNavigateOnce();

  const [status, setStatus] = useState<string>(DEFAULT_REQUEST_TAB);
  const [search, setSearch] = useState('');
  const [serviceType, setServiceType] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  const [approving, setApproving] = useState<BookingRequestItem | null>(null);
  const [rejecting, setRejecting] = useState<BookingRequestItem | null>(null);
  /** Chuyến ĐÃ NHẬN đang chờ huỷ (ADR 0045 điều 1) — khác hẳn `rejecting` về đường tiền. */
  const [cancelling, setCancelling] = useState<BookingRequestItem | null>(null);
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
  const cancel = useCancelBookingRequest();

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

  /** Cùng phạm vi với `clearFilters` của web: gỡ `q` + `serviceType`, GIỮ tab đang mở. */
  const clearFilters = useCallback(() => {
    setSearch('');
    setServiceType(null);
    setPage(FIRST_PAGE);
  }, []);

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

  /*
   * Mở một thao tác thì ĐÓNG màn chi tiết trước — đúng thứ tự web làm ở `BookingRequestsView`.
   *
   * `detail` là một BẢN CHỤP nằm trong state, không phải một truy vấn: lượt duyệt invalidate
   * cache nhưng không đụng được vào nó. Giữ màn chi tiết mở phía sau tấm trượt nghĩa là đóng tấm
   * kết quả xong, người trực quay lại đúng bản ghi CŨ — vẫn ghi "chờ bạn duyệt", vẫn còn nút
   * Duyệt — cho một yêu cầu họ vừa duyệt xong. Bấm lần nữa là một lượt gọi chắc chắn lỗi.
   *
   * Dùng chung cho CẢ thẻ trong danh sách lẫn màn chi tiết: ở danh sách `detail` vốn đã `null`
   * nên phép đóng là vô hại, và một đường duy nhất thì không có nhánh nào để quên.
   */
  const startApprove = useCallback((request: BookingRequestItem) => {
    setDetail(null);
    setApproving(request);
  }, []);

  const startReject = useCallback((request: BookingRequestItem) => {
    setDetail(null);
    setRejecting(request);
  }, []);

  const startCancel = useCallback((request: BookingRequestItem) => {
    setDetail(null);
    setCancelling(request);
  }, []);

  const renderItem = useCallback<ListRenderItem<BookingRequestItem>>(
    ({ item }) => (
      <BookingRequestCard
        request={item}
        onApprove={startApprove}
        onReject={startReject}
        onCancel={startCancel}
        onOpenDetail={openDetail}
      />
    ),
    [openDetail, startApprove, startReject, startCancel],
  );

  /** Lỗi quyết định → câu có LỐI ĐI TIẾP; `null` thì rơi về ánh xạ chung theo MÃ. */
  function decisionError(error: unknown): string {
    const key = decisionErrorKey(getErrorCode(error));
    return key ? t(key) : errorMessage(error);
  }

  function confirmApprove(body?: Parameters<typeof approve.mutate>[0]['body']) {
    if (!approving) return;
    approve.mutate(
      { id: approving.id, ...(body ? { body } : {}) },
      {
        /*
         * Kết quả mở thành TẤM TRƯỢT, không phải toast — và tấm đó đọc `bookingId` của BẢN GHI
         * SERVER VỪA TRẢ VỀ để chọn một trong hai câu chuyện (ADR 0044 điều 2).
         *
         * Hai thứ ở đây từng sai và cả hai đều im lặng:
         *   · truyền lại `approving` (bản ghi TRƯỚC khi duyệt) — `bookingId` khi đó luôn `null`,
         *     nên mọi lượt duyệt đọc ra "chờ khách thanh toán" kể cả chuyến đã tạo đơn ngay;
         *   · toast `approve.success` ("Đã giữ xe — đã tạo đơn thuê") — một lời khẳng định SAI ở
         *     nhánh mặc định của luồng mới, đúng câu ADR 0044 sinh ra để chấm dứt. Web không có
         *     toast ở lượt duyệt, và đó là lý do.
         */
        onSuccess: (approved) => {
          setApproving(null);
          setApproved(approved);
        },
        onError: (error) => toast.showError(decisionError(error)),
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
        },
        /* Từ chối đi qua CÙNG cửa `claimPending` với duyệt ⇒ cùng bộ lỗi có lối đi tiếp. */
        onError: (error) => toast.showError(decisionError(error)),
      },
    );
  }

  function confirmCancel(body: CancelBookingRequestInput) {
    if (!cancelling) return;
    cancel.mutate(
      { id: cancelling.id, body },
      {
        onSuccess: () => {
          toast.showSuccess(t('cancel.success'));
          setCancelling(null);
        },
        /*
         * Cuộc đua với đồng tiền: khách chuyển khoản đúng lúc người trực đang mở tấm trượt ⇒
         * webhook thắng, yêu cầu đã thành đơn, lệnh huỷ không claim được gì (409). Câu chung
         * ("có lỗi xảy ra") sẽ khiến họ bấm lại vài lần rồi gọi hỗ trợ.
         */
        onError: (error) => {
          const key = cancelErrorKey(getErrorCode(error));
          toast.showError(key ? t(key) : errorMessage(error));
        },
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
   * Bốn tấm trượt quyết định dựng MỘT lần rồi dùng ở cả hai nhánh render.
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

      {cancelling ? (
        <CancelRequestSheet
          open
          onClose={() => setCancelling(null)}
          request={cancelling}
          onConfirm={confirmCancel}
          loading={cancel.isPending}
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
          onApprove={startApprove}
          onReject={startReject}
          onCancel={startCancel}
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
          tabs={<StatusTabs value={status} onChange={changeStatus} counts={statusCounts} />}
          searchValue={search}
          searchLabel={t('filters.searchLabel')}
          searchPlaceholder={t('filters.searchPlaceholder')}
          onSearchChange={changeSearch}
          hasRows={items.length > 0}
          groups={groups}
          onFilterChange={changeFilter}
          {...(meta === undefined ? {} : { meta })}
          onPageChange={setPage}
        >
          {({ onScroll, headerHeight, contentContainerStyle, bindList }) => {
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
                    /*
                      Lối ra phải nằm NGAY ĐÓ — đúng `onClear` của web. Không có nút, người dùng
                      đứng trước một màn trắng và cách duy nhất là tự nhớ mình đã lọc gì rồi mở
                      lại tấm trượt để gỡ từng chiều.

                      Xoá `q` + `serviceType`, KHÔNG xoá tab: tab là chỗ người dùng đang đứng, và
                      kéo họ về "Cần xử lý" là một lượt điều hướng không ai yêu cầu (cùng phạm vi
                      với `clearFilters` của web).
                    */
                    actionLabel={tActions('clear')}
                    onAction={clearFilters}
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
                ref={bindList}
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

/*
 * Khối HAI CON SỐ ("Chờ duyệt" / "Hoàn thành") đã bị GỠ ngày 23/09/2026 cùng lúc với bản web
 * (ADR 0047 điều 4).
 *
 * Nó đọc đúng cùng `statusCounts` mà badge trên dải tab đọc, tức là lặp lại 100% một thông tin
 * đang nằm cách nó 8dp — và nó chiếm trọn một hàng ở đầu một màn hình mà việc thật (thẻ yêu cầu
 * kèm đồng hồ đếm hạn phản hồi) mới là thứ cần nằm trên nếp gấp.
 *
 * ⚠️ Khoá `BookingRequests.stats.*` vẫn CÒN trong bó message dùng chung. Đó là chủ ý của ADR
 * 0047 điều 8: lúc viết ADR, chính màn này còn đọc chúng, nên web giữ lại để không làm vỡ biên
 * dịch mobile. Nay mobile đã thôi đọc — xoá được, nhưng việc đó thuộc về một lượt dọn message
 * chung chứ không phải một đợt đồng bộ.
 */

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
