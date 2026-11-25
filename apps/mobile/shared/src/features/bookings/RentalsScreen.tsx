import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAccumulatedPages } from '@/hooks/use-accumulated-pages';
import { RefreshControl, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BOOKING_LIST_PRESET,
  BOOKING_REQUEST_STATUS,
  HANDOVER_TYPE,
  PERMISSION,
  SERVICE_TYPE_VALUES,
} from '@xeprime/types';
import { ChipTabs, type ChipTabItem } from '@/components/ui/ChipTabs';
import { IconSquareButton } from '@/components/ui/IconSquareButton';
import { LinkArrow } from '@/components/ui/LinkArrow';
import { Pill } from '@/components/ui/Pill';
import { LineIcon } from '@/components/icons/LineIcon';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/layout/Screen';
import { RecordCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { NoResults } from '@/components/state/NoResults';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { BookingRequestDetailScreen } from '@/features/booking-requests/BookingRequestDetailScreen';
import { BookingRequestCard } from '@/features/booking-requests/components/BookingRequestCard';
import { useBookingRequestDecisions } from '@/features/booking-requests/hooks/use-booking-request-decisions';
import {
  BOOKING_REQUEST_SORT_URGENT,
  bookingRequestFiltersToParams,
  bookingRequestsApi,
  type BookingRequestFilters,
  type BookingRequestItem,
  type BookingRequestListResult,
} from '@/features/booking-requests/api';
import { statusCountOf } from '@/features/booking-requests/hooks/use-booking-requests';
import { withBranchReturn } from '@/features/branches/branch-link';
import {
  useBranchEmptyCopy,
} from '@/features/branches/components/BranchFilterField';
import { useScreenBranchFilter } from '@/features/branches/hooks/use-branch-filter';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { ManageListShell } from '@/features/shell/ManageListShell';
import { ManageStateScroll } from '@/features/shell/ManageStateScroll';
import type { FilterGroup } from '@/features/shell/ManageFilterSheet';
import { PARTNER_TRACK, resolvePartnerTrack } from '@/features/shell/partner-track';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-authenticated-user';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { ROUTES } from '@/navigation/routes';
import { keepPageData } from '@/queries/keep-page-data';
import { queryKeys } from '@/queries/query-keys';
import { FIRST_PAGE } from '@/queries/use-clamped-page';
import { layout } from '@/theme/layout';
import { LIST_TUNING } from '@/theme/list-tuning';
import { scrollThrottle } from '@/theme/motion';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, iconSize, radius, space, typeScale } from '@/theme/tokens';
import { useResponsive } from '@/theme/use-responsive';
import { BookingCard } from './components/BookingCard';
import { RentalsBoard, type BoardColumn } from './components/RentalsBoard';
import {
  readRememberedRentalsView,
  rememberRentalsView,
  RENTAL_VIEW,
  type RentalView,
} from '@/lib/rentals-view-memory';
import { useBookingHistory } from './hooks/use-booking-history';
import { useBookingsPage } from './hooks/use-bookings';
import { useCanCreateBooking } from './hooks/use-can-create-booking';
import { usePaymentArrivalToast } from './hooks/use-payment-arrival-toast';
import {
  RENTAL_STAGE,
  RENTAL_STAGE_ORDER,
  type RentalStage,
} from './rental-stages';
import type { BookingListItem, BookingSort } from './api';

/**
 * Cỡ trang của một nhóm trên điện thoại - CÙNG một số cho chip "Tất cả" (danh sách liền mọi nhóm)
 * và từng chip nhóm, nên đổi chip đọc thẳng cache (không gọi lại, không khung chờ). 50 đủ hiện hết
 * việc đang mở của một gian hàng thường; nhóm dài hơn có link "Xem tất cả" ở cuối (20/11/2026).
 */
const STAGE_PAGE_LIMIT = 50;
/** Bảng Kanban iPad: mỗi cột 10 thẻ, "Tải thêm" nới 10 một lượt (web 10/trang). */
const BOARD_PAGE_LIMIT = 10;
/** Truy vấn chỉ để lấy SỐ ĐẾM của thực thể kia (web: "một truy vấn một-dòng"). */
const COUNT_ONLY_LIMIT = 1;
const SKELETON_ROWS = 3;
const SEARCH_DEBOUNCE_MS = 300;
const ALL = 'all';
/** Làm mới nền khi màn đang mở (sổ cái §3.2b dòng 17). */
const BACKGROUND_REFRESH_MS = 30_000;

/** Sắp xếp MẶC ĐỊNH của hai nhóm đơn — `DEFAULT_BOOKING_SORT` của web. */
const DEFAULT_BOOKING_SORT: Readonly<Record<'awaiting_pickup' | 'renting', BookingSort>> = {
  [RENTAL_STAGE.AWAITING_PICKUP]: 'pickup_asc',
  [RENTAL_STAGE.RENTING]: 'return_asc',
};
const BOOKING_SORT_VALUES: readonly BookingSort[] = ['newest', 'pickup_asc', 'pickup_desc', 'return_asc'];

type Rail = typeof ALL | RentalStage;

type Row =
  | { kind: 'head'; stage: RentalStage; count: number | undefined; more: number | null }
  | { kind: 'request'; stage: RentalStage; item: BookingRequestItem }
  | { kind: 'booking'; stage: RentalStage; item: BookingListItem }
  | { kind: 'groupError'; stage: RentalStage }
  | { kind: 'stageEmpty'; stage: RentalStage }
  /** "Tất cả": nhóm còn đơn chưa tải - link mở chip của nhóm đó. */
  | { kind: 'more'; stage: RentalStage; count: number };

const keyOf = (row: Row) =>
  row.kind === 'request' || row.kind === 'booking' ? `${row.kind}:${row.item.id}` : `${row.kind}:${row.stage}`;

/** Một trang yêu cầu, có thể TẮT — hộp thư dùng chung hàm API và khoá cache với web/hộp thư cũ. */
function useRequestStage(filters: BookingRequestFilters, enabled: boolean) {
  const params = bookingRequestFiltersToParams(filters);
  return useQuery({
    queryKey: queryKeys.bookingRequests.list(params),
    queryFn: () => bookingRequestsApi.list(filters),
    placeholderData: keepPageData<BookingRequestListResult>(params),
    enabled,
    refetchInterval: enabled ? BACKGROUND_REFRESH_MS : false,
  });
}

/**
 * "Đơn thuê xe" gộp — bản native của `BookingsListView` web (Figma Partner-XePrime "Rental Request -
 * List" `23973:51952`, sổ cái §3.2b, 05/11/2026). MỘT màn cho cả chuyến: Cần xử lý · Chờ khách
 * thanh toán (đọc YÊU CẦU) → Chờ giao xe · Đang thuê (đọc ĐƠN). Kết thúc rồi thì sang "Đơn đã kết
 * thúc (n)" ở đầu màn.
 *
 * Cột trạng thái trái của web thành dải chip cuộn ngang ở đầu (web ≤1024 cũng vậy). Điện thoại
 * luôn List — web ≤640px không có Kanban (§3.2c dòng 7).
 *
 * Mọi lọc / sắp xếp / phân trang ở SERVER; nhóm thiếu quyền thì vắng hẳn.
 */
export function RentalsScreen({
  initialStage,
  vehicleId,
}: {
  /** Nhóm mở sẵn — link cũ `/manage/requests?status=`, `/bookings/awaiting-pickup`, thẻ Tổng quan. */
  initialStage?: RentalStage;
  /** Lối đi từ hồ sơ xe (`?vehicleId=`) — lọc theo MỘT xe như web. */
  vehicleId?: string;
}) {
  const colors = useColors();
  const t = useTranslations('Bookings.board');
  const tList = useTranslations('Bookings.list');
  const tApp = useTranslations('Bookings.board.kanban.partnerApp');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const permissions = usePermissions();
  const navigateOnce = useNavigateOnce();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const canCreate = useCanCreateBooking();
  const user = useAuthenticatedUser();
  /** Tuyến hoa hồng: chuyến chỉ đến từ chợ — câu trống nói khác, nút "Xem xe của tôi". */
  const marketOnly = resolvePartnerTrack(user) === PARTNER_TRACK.COMMISSION;
  const decisions = useBookingRequestDecisions();
  /*
   * Lấy RIÊNG từng hàm ổn định: object `decisions` mới sau mỗi render, đưa nó vào deps là mọi
   * callback của thẻ (và `renderItem`) đổi theo - `memo` của thẻ vô tác dụng, mỗi phím gõ ô tìm vẽ
   * lại cả danh sách. `openX` là setter của `useState`, `decisionActionFor` là `useCallback`.
   */
  const { openApprove, openReject, openCancel, decisionActionFor } = decisions;

  const canViewRequests = permissions.has(PERMISSION.BOOKING_REQUEST_VIEW);
  const canViewBookings = permissions.has(PERMISSION.BOOKING_VIEW);
  const canHandle = permissions.has(PERMISSION.HANDOVER_CONFIRM);

  usePaymentArrivalToast({ enabled: canViewRequests, canOpenBooking: canViewBookings });

  const visibleStages = useMemo(
    () =>
      RENTAL_STAGE_ORDER.filter((stage) =>
        stage === RENTAL_STAGE.NEEDS_ACTION || stage === RENTAL_STAGE.AWAITING_PAYMENT
          ? canViewRequests
          : canViewBookings,
      ),
    [canViewRequests, canViewBookings],
  );

  /*
   * Dạng xem (§3.2c dòng 7): điện thoại LUÔN List, không có nút; màn rộng (iPad) mặc định Kanban,
   * nhớ lựa chọn gần nhất. Mở bằng link mang sẵn nhóm thì vào List của nhóm đó.
   */
  const { isTablet } = useResponsive();
  const [chosenView, setChosenView] = useState<RentalView | null>(null);
  useEffect(() => {
    let alive = true;
    void readRememberedRentalsView().then((view) => {
      if (alive && view) setChosenView((current) => current ?? view);
    });
    return () => {
      alive = false;
    };
  }, []);
  const isBoard =
    isTablet && !initialStage && (chosenView ?? RENTAL_VIEW.BOARD) === RENTAL_VIEW.BOARD;
  const chooseView = useCallback((view: RentalView) => {
    setChosenView(view);
    rememberRentalsView(view);
  }, []);
  /** Số thẻ đã tải của mỗi cột Kanban — "Tải thêm" nới 10 thẻ một lượt (web 10/trang). */
  const [boardLimits, setBoardLimits] = useState<Record<RentalStage, number>>({
    needs_action: BOARD_PAGE_LIMIT,
    awaiting_payment: BOARD_PAGE_LIMIT,
    awaiting_pickup: BOARD_PAGE_LIMIT,
    renting: BOARD_PAGE_LIMIT,
  });

  const [rail, setRail] = useState<Rail>(initialStage ?? ALL);
  const [sort, setSort] = useState<BookingSort | null>(null);
  const [page, setPage] = useState(FIRST_PAGE);
  /*
   * Route mới mang nhóm khác (bấm thông báo / deep link khi màn đang mở) ⇒ đổi nhóm ngay trong
   * render, VÀ về trang 1 + bỏ sắp xếp như `selectRail`. Thiếu bước đó thì nhóm mới đọc trang cũ
   * của nhóm trước (vd trang 2 "Chờ giao xe" → "Đang thuê" 7 đơn ra rỗng - đo trên emulator 12/11).
   */
  const [seenInitial, setSeenInitial] = useState(initialStage);
  if (initialStage !== seenInitial) {
    setSeenInitial(initialStage);
    if (initialStage) {
      setRail(initialStage);
      setSort(null);
      setPage(FIRST_PAGE);
    }
  }
  const [search, setSearch] = useState('');
  const [serviceType, setServiceType] = useState<string>(ALL);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const { branchId, filter: branchFilter } = useScreenBranchFilter(() => setPage(FIRST_PAGE));
  const branchEmpty = useBranchEmptyCopy(branchFilter, branchId);

  const isAll = isBoard || rail === ALL;
  const q = debouncedSearch.trim();
  const scope = {
    ...(branchId ? { branchId } : {}),
    ...(serviceType === ALL ? {} : { serviceType }),
    ...(vehicleId ? { vehicleId } : {}),
    ...(q ? { q } : {}),
  };
  /*
   * Ô "Tất cả" tải ĐÚNG trang đầu của nhóm (10 thẻ - cùng khoá cache với khi chọn nhóm đó) rồi chỉ
   * HIỆN 3 thẻ đầu. Bấm chip nhóm đọc thẳng cache, không gọi API mới + khung chờ (người dùng báo
   * lag khi đổi chip 20/11/2026); quay về "Tất cả" cũng vậy.
   */
  // Truy vấn chỉ-để-đếm của nhóm khác cũng giữ cỡ trang này: đổi cỡ là đổi khoá, số trên chip nháy.
  const sizeFor = (stage: RentalStage, _primary: boolean) =>
    isBoard ? boardLimits[stage] : STAGE_PAGE_LIMIT;
  const pageFor = (stage: RentalStage) => (!isBoard && rail === stage ? page : FIRST_PAGE);

  /*
   * Bốn truy vấn, mỗi nhóm một. Nhóm ĐẦU của mỗi thực thể luôn chạy (ít nhất một dòng) để cột
   * chip có số đếm của cả hai thực thể — `statusCounts` / `presetCounts` đi kèm trang.
   */
  const needsQ = useRequestStage(
    {
      ...scope,
      status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
      sort: BOOKING_REQUEST_SORT_URGENT,
      page: pageFor(RENTAL_STAGE.NEEDS_ACTION),
      limit: sizeFor(RENTAL_STAGE.NEEDS_ACTION, true),
    },
    canViewRequests,
  );
  const payQ = useRequestStage(
    {
      ...scope,
      status: BOOKING_REQUEST_STATUS.AWAITING_HOLD,
      sort: BOOKING_REQUEST_SORT_URGENT,
      page: pageFor(RENTAL_STAGE.AWAITING_PAYMENT),
      limit: Math.max(sizeFor(RENTAL_STAGE.AWAITING_PAYMENT, false), COUNT_ONLY_LIMIT),
    },
    canViewRequests && (isAll || rail === RENTAL_STAGE.AWAITING_PAYMENT),
  );
  const bookingSort = (stage: 'awaiting_pickup' | 'renting') =>
    rail === stage ? (sort ?? DEFAULT_BOOKING_SORT[stage]) : DEFAULT_BOOKING_SORT[stage];
  const pickupQ = useBookingsPage(
    {
      ...scope,
      preset: BOOKING_LIST_PRESET.AWAITING_PICKUP,
      sort: bookingSort(RENTAL_STAGE.AWAITING_PICKUP),
      page: pageFor(RENTAL_STAGE.AWAITING_PICKUP),
      limit: sizeFor(RENTAL_STAGE.AWAITING_PICKUP, true),
    },
    { enabled: canViewBookings, refetchInterval: canViewBookings ? BACKGROUND_REFRESH_MS : false },
  );
  const rentingQ = useBookingsPage(
    {
      ...scope,
      preset: BOOKING_LIST_PRESET.RENTING,
      sort: bookingSort(RENTAL_STAGE.RENTING),
      page: pageFor(RENTAL_STAGE.RENTING),
      limit: Math.max(sizeFor(RENTAL_STAGE.RENTING, false), COUNT_ONLY_LIMIT),
    },
    {
      enabled: canViewBookings && (isAll || rail === RENTAL_STAGE.RENTING),
      refetchInterval: BACKGROUND_REFRESH_MS,
    },
  );
  /* "Đơn đã kết thúc (n)" — cùng bộ lọc (web: link mang theo tìm kiếm/chi nhánh/dịch vụ). */
  const ended = useBookingHistory({
    ...(branchId ? { branchId } : {}),
    ...(serviceType === ALL ? {} : { serviceType }),
    ...(q ? { q } : {}),
    page: FIRST_PAGE,
    limit: COUNT_ONLY_LIMIT,
    // `/booking-history` cần `bookings.view` - vai chỉ xem yêu cầu sẽ nhận 403.
  }, { enabled: canViewBookings });

  const statusCounts = needsQ.data?.meta.statusCounts;
  const presetCounts = pickupQ.data?.meta.presetCounts;
  const countOf = useCallback(
    (stage: RentalStage): number | undefined => {
      if (stage === RENTAL_STAGE.NEEDS_ACTION || stage === RENTAL_STAGE.AWAITING_PAYMENT) {
        if (!statusCounts) return undefined;
        return statusCountOf(
          statusCounts,
          stage === RENTAL_STAGE.NEEDS_ACTION
            ? BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL
            : BOOKING_REQUEST_STATUS.AWAITING_HOLD,
        );
      }
      if (!presetCounts) return undefined;
      return presetCounts.find((c) => c.preset === stage)?.count ?? 0;
    },
    [statusCounts, presetCounts],
  );
  const allCount = visibleStages.reduce<number | undefined>((sum, stage) => {
    const c = countOf(stage);
    return sum === undefined || c === undefined ? undefined : sum + c;
  }, 0);

  const stageQuery = (stage: RentalStage) =>
    stage === RENTAL_STAGE.NEEDS_ACTION
      ? needsQ
      : stage === RENTAL_STAGE.AWAITING_PAYMENT
        ? payQ
        : stage === RENTAL_STAGE.AWAITING_PICKUP
          ? pickupQ
          : rentingQ;

  /* ── Ý định mở sẵn MỘT yêu cầu (`?request=`, thẻ chuyến trong tin nhắn / thông báo) ─────────── */
  const [detail, setDetail] = useState<BookingRequestItem | null>(null);
  const openRequest = useCallback(
    (request: BookingRequestItem) => {
      if (request.bookingId && canViewBookings) {
        navigateOnce(ROUTES.manage.bookingDetail(request.bookingId));
        return;
      }
      setDetail(request);
    },
    [canViewBookings, navigateOnce],
  );
  const { request: requestParam } = useLocalSearchParams<{ request?: string }>();
  const [intentId, setIntentId] = useState<string | null>(
    typeof requestParam === 'string' && requestParam ? requestParam : null,
  );
  const [seenRequestParam, setSeenRequestParam] = useState(requestParam);
  if (requestParam !== seenRequestParam) {
    setSeenRequestParam(requestParam);
    if (typeof requestParam === 'string' && requestParam) setIntentId(requestParam);
  }
  const intent = useQuery({
    queryKey: queryKeys.bookingRequests.detail(intentId ?? ''),
    queryFn: () => bookingRequestsApi.detail(intentId ?? ''),
    enabled: intentId !== null && canViewRequests,
    staleTime: 0,
    retry: false,
  });
  useEffect(() => {
    if (intentId === null) return;
    if (intent.isError) {
      toast.showError(errorMessage(intent.error));
      setIntentId(null);
      return;
    }
    const data = intent.data;
    if (!data || data.id !== intentId) return;
    setIntentId(null);
    openRequest(data);
  }, [intentId, intent.data, intent.isError, intent.error, openRequest, toast, errorMessage]);

  /* Mở một quyết định thì ĐÓNG chi tiết trước — bản chụp trong state không tự cập nhật. */
  const startApprove = useCallback(
    (r: BookingRequestItem) => {
      setDetail(null);
      openApprove(r);
    },
    [openApprove],
  );
  const startReject = useCallback(
    (r: BookingRequestItem) => {
      setDetail(null);
      openReject(r);
    },
    [openReject],
  );
  const startCancel = useCallback(
    (r: BookingRequestItem) => {
      setDetail(null);
      openCancel(r);
    },
    [openCancel],
  );

  /*
   * ── Hành động trên thẻ đơn ─────────────────────────────────────────────────────────────────
   * Thẻ v2 chỉ là bản TÓM TẮT như Figma (người dùng chốt 20/11/2026): "Khách không đến" và
   * "Gia hạn" không còn trên thẻ - làm ở màn chi tiết đơn (cùng quyền, cùng tấm).
   */
  const openBooking = useCallback(
    (booking: BookingListItem) =>
      navigateOnce(
        ROUTES.manage.bookingDetail(booking.id, {
          preview: { code: booking.code, status: booking.status, createdAt: booking.createdAt },
        }),
      ),
    [navigateOnce],
  );
  const receiveBooking = useCallback(
    (booking: BookingListItem) =>
      navigateOnce(ROUTES.manage.handover(booking.id, HANDOVER_TYPE.RETURN)),
    [navigateOnce],
  );

  /* ── Bộ lọc ──────────────────────────────────────────────────────────────────────────────── */
  const bookingStageView =
    rail === RENTAL_STAGE.AWAITING_PICKUP || rail === RENTAL_STAGE.RENTING;
  const filtered =
    serviceType !== ALL || q.length > 0 || Boolean(vehicleId) || Boolean(branchId);
  const groups = useMemo<readonly FilterGroup[]>(
    () => [
      {
        key: 'serviceType',
        label: tList('serviceLabel'),
        value: serviceType,
        resetValue: ALL,
        options: [
          { value: ALL, label: tList('serviceAll') },
          ...SERVICE_TYPE_VALUES.map((value) => ({ value, label: domainLabel('serviceType', value) })),
        ],
      },
      // Ô "Sắp xếp" chỉ ở nhóm ĐƠN (web: hai nhóm yêu cầu xếp theo hạn đang chạy).
      ...(bookingStageView
        ? [
            {
              key: 'sort',
              label: tList('sortLabel'),
              value: sort ?? DEFAULT_BOOKING_SORT[rail as 'awaiting_pickup' | 'renting'],
              resetValue: DEFAULT_BOOKING_SORT[rail as 'awaiting_pickup' | 'renting'],
              display: 'prefixed' as const,
              options: BOOKING_SORT_VALUES.map((value) => ({
                value,
                label: sortLabel(tList, value),
              })),
            },
          ]
        : []),
    ],
    [tList, domainLabel, serviceType, sort, rail, bookingStageView],
  );
  const changeFilter = useCallback((key: string, value: string) => {
    if (key === 'serviceType') setServiceType(value);
    else setSort(value as BookingSort);
    setPage(FIRST_PAGE);
  }, []);
  const changeSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(FIRST_PAGE);
  }, []);
  const clearFilters = useCallback(() => {
    setSearch('');
    setServiceType(ALL);
    setPage(FIRST_PAGE);
    // Web `clearFilters` xoá cả chi nhánh.
    branchFilter.select(undefined);
    if (vehicleId) navigateOnce(ROUTES.manage.bookings());
  }, [vehicleId, navigateOnce, branchFilter]);
  const selectRail = useCallback((next: Rail) => {
    setRail(next);
    setSort(null);
    setPage(FIRST_PAGE);
  }, []);

  /* Một nhóm đang mở: cuộn vô hạn gộp các trang (mobile, 16/11/2026). */
  const singleQuery = isAll ? null : stageQuery(rail as RentalStage);
  const singleItems = useAccumulatedPages(
    singleQuery?.data?.items as readonly { id: string }[] | undefined,
    singleQuery?.data?.meta?.page,
  );

  /* ── Dòng của danh sách ─────────────────────────────────────────────────────────────────── */
  const rows = useMemo<Row[]>(() => {
    const itemsOf = (stage: RentalStage): Row[] => {
      const data = stageQuery(stage).data;
      if (!data) return [];
      return stage === RENTAL_STAGE.NEEDS_ACTION || stage === RENTAL_STAGE.AWAITING_PAYMENT
        ? (data.items as BookingRequestItem[]).map((item) => ({ kind: 'request' as const, stage, item }))
        : (data.items as BookingListItem[]).map((item) => ({ kind: 'booking' as const, stage, item }));
    };
    if (!isAll) {
      const stage = rail;
      const items: Row[] =
        stage === RENTAL_STAGE.NEEDS_ACTION || stage === RENTAL_STAGE.AWAITING_PAYMENT
          ? (singleItems as BookingRequestItem[]).map((item) => ({ kind: 'request' as const, stage, item }))
          : (singleItems as BookingListItem[]).map((item) => ({ kind: 'booking' as const, stage, item }));
      // Chip đã nói nhóm nào - không lặp dải tiêu đề nhóm (20/11/2026).
      return items.length === 0 && !filtered ? [{ kind: 'stageEmpty' as const, stage }] : items;
    }
    /*
     * "Tất cả" trên điện thoại = MỘT danh sách liền mọi đơn, theo thứ tự nhóm, KHÔNG chia dải "Cần
     * xử lý / Chờ khách thanh toán…" (người dùng chốt 20/11/2026) - lọc thì bấm chip. Nhóm lỗi vẫn
     * có dải tên để biết phần nào thiếu; nhóm dài hơn trang có link mở chip của nó ở cuối nhóm.
     */
    const out: Row[] = [];
    for (const stage of visibleStages) {
      const query = stageQuery(stage);
      if (query.isError) {
        out.push({ kind: 'head', stage, count: countOf(stage), more: null });
        out.push({ kind: 'groupError', stage });
        continue;
      }
      const items = itemsOf(stage);
      if (items.length === 0) continue;
      const total = countOf(stage) ?? items.length;
      out.push(...items);
      if (total > items.length) out.push({ kind: 'more', stage, count: total });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `stageQuery` đọc bốn truy vấn đã có trong deps.
  }, [isAll, isBoard, rail, singleItems, visibleStages, countOf, filtered, needsQ.data, payQ.data, pickupQ.data, rentingQ.data, needsQ.isError, payQ.isError, pickupQ.isError, rentingQ.isError]);

  const activeQueries = isAll ? visibleStages.map(stageQuery) : [stageQuery(rail as RentalStage)];
  const pending = activeQueries.length > 0 && activeQueries.every((query) => query.isPending);
  const allFailed = activeQueries.length > 0 && activeQueries.every((query) => query.isError);
  const refreshing = activeQueries.some((query) => query.isRefetching);
  const refetchAll = () => {
    activeQueries.forEach((query) => void query.refetch());
    void ended.refetch();
  };
  const singleMeta = isAll ? undefined : stageQuery(rail as RentalStage).data?.meta;
  const hasItems = rows.some((row) => row.kind === 'request' || row.kind === 'booking');

  const renderItem = useCallback<ListRenderItem<Row>>(
    ({ item }) => {
      switch (item.kind) {
        case 'head':
          return (
            <StageHeading stage={item.stage} count={item.count} more={item.more} onViewAll={selectRail} />
          );
        case 'more':
          return (
            <YStack ai="flex-end" pb={space.md}>
              <LinkArrow
                label={`${t(`stage.${item.stage}`)} - ${t('viewAll', { count: item.count })}`}
                onPress={() => selectRail(item.stage)}
              />
            </YStack>
          );
        case 'groupError':
          return (
            <YStack pb={space.sm}>
              <ScreenMessage
                compact
                icon="cloud-offline-outline"
                title={t('groupError')}
                description={tCommon('states.errorHint')}
                actionLabel={tCommon('actions.retry')}
                onAction={() => void stageQuery(item.stage).refetch()}
              />
            </YStack>
          );
        case 'stageEmpty':
          return (
            <ScreenMessage
              compact
              icon="checkmark-done-outline"
              title={t(`stageEmpty.${item.stage}.title`)}
              description={t(`stageEmpty.${item.stage}.body`)}
            />
          );
        case 'request':
          return (
            <YStack pb={space.md}>
              <BookingRequestCard
                request={item.item}
                onApprove={startApprove}
                onReject={startReject}
                onCancel={startCancel}
                onOpenDetail={openRequest}
                pendingAction={decisionActionFor(item.item.id)}
              />
            </YStack>
          );
        default:
          return (
            <YStack pb={space.md}>
              <BookingCard
                booking={item.item}
                group={item.stage as 'awaiting_pickup' | 'renting'}
                onPress={openBooking}
                {...(canHandle ? { onReceive: receiveBooking } : {})}
              />
            </YStack>
          );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `stageQuery` đổi mỗi render nhưng chỉ đọc truy vấn.
    [t, tCommon, selectRail, decisionActionFor, startApprove, startReject, startCancel, openRequest, openBooking, canHandle, receiveBooking],
  );

  if (!permissions.isLoading && visibleStages.length === 0) {
    return (
      <>
        <ManagePageHeader title={t('title')} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage icon="lock-closed-outline" title={t('noAccessTitle')} description={t('noAccessBody')} />
        </Screen>
      </>
    );
  }

  /* Chi tiết yêu cầu THAY nội dung màn (vai modal của web) — đóng lại là về đúng chỗ đang đứng. */
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
        {decisions.sheets}
      </>
    );
  }

  const boardColumns: BoardColumn[] = isBoard
    ? visibleStages.map((stage) => {
        const query = stageQuery(stage);
        const data = query.data;
        const requestStage =
          stage === RENTAL_STAGE.NEEDS_ACTION || stage === RENTAL_STAGE.AWAITING_PAYMENT;
        const items = (data?.items ?? []).map((item) => ({
          key: item.id,
          node: requestStage ? (
            <BookingRequestCard
              request={item as BookingRequestItem}
              onApprove={startApprove}
              onReject={startReject}
              onCancel={startCancel}
              onOpenDetail={openRequest}
              pendingAction={decisionActionFor(item.id)}
            />
          ) : (
            <BookingCard
              booking={item as BookingListItem}
              group={stage as 'awaiting_pickup' | 'renting'}
              onPress={openBooking}
              {...(canHandle ? { onReceive: receiveBooking } : {})}
            />
          ),
        }));
        const total = data?.meta.total ?? 0;
        return {
          stage,
          count: countOf(stage),
          loading: query.isPending,
          error: query.isError,
          items,
          hasMore: items.length < total,
          loadingMore: query.isFetching && !query.isPending,
          onLoadMore: () =>
            setBoardLimits((limits) => ({ ...limits, [stage]: limits[stage] + BOARD_PAGE_LIMIT })),
          onRetry: () => void query.refetch(),
        };
      })
    : [];

  const endedCount = ended.data?.meta.total;
  const openEnded = () =>
    navigateOnce(
      ROUTES.manage.bookingsEnded(undefined, {
        ...(q ? { q } : {}),
        ...(branchId ? { branchId } : {}),
        ...(serviceType !== ALL ? { serviceType } : {}),
      }),
    );
  const openCreate = () => navigateOnce(withBranchReturn(ROUTES.manage.bookingCreate(), branchId));

  return (
    <>
      {/*
        Thanh trang v2 (Figma "Header MB" `24175:59955`, người dùng chốt 13/11/2026): tiêu đề +
        "Đơn đã kết thúc" (icon, số đơn là viên ở góc và nằm trong tên nút) + "Tạo đơn thuê" (+,
        cùng cổng `useCanCreateBooking` như trước).
      */}
      <ManagePageHeader
        title={t('title')}
        actions={
          <>
            <IconSquareButton
              label={endedCount === undefined ? t('ended') : t('endedWithCount', { count: endedCount })}
              badge={endedCount}
              onPress={openEnded}
            >
              <LineIcon name="doc-right" size={iconSize.lg} color={colors.text} />
            </IconSquareButton>
            {canCreate ? (
              <IconSquareButton label={t('create')} tone="brand" onPress={openCreate}>
                <LineIcon name="plus" size={iconSize.lg} color={colors.onPrimary} />
              </IconSquareButton>
            ) : null}
          </>
        }
      />
      <Screen edges={['left', 'right', 'bottom']} scroll={false} padded={false}>
        <ManageListShell
          variant="page"
          title={t('title')}
          // Figma "Header MB" không có dòng mô tả dưới tiêu đề (người dùng 20/11/2026).
          summary={
            isTablet && !initialStage ? (
            <XStack px={layout.screenX} gap={space.sm} ai="center" flexWrap="wrap">
              {isTablet && !initialStage ? (
                <XStack gap={space.xs}>
                  <IconButton
                    icon="grid-outline"
                    label={t('view.board')}
                    tone={isBoard ? 'primary' : 'surface'}
                    onPress={() => chooseView(RENTAL_VIEW.BOARD)}
                  />
                  <IconButton
                    icon="list-outline"
                    label={t('view.list')}
                    tone={isBoard ? 'surface' : 'primary'}
                    onPress={() => chooseView(RENTAL_VIEW.LIST)}
                  />
                </XStack>
              ) : null}
            </XStack>
            ) : undefined
          }
          branchFilter={{ filter: branchFilter, value: branchId }}
          searchValue={search}
          searchLabel={tList('searchLabel')}
          // App: câu ngắn không chữ "Tìm" - ô tìm hẹp cạnh nút "Lọc" (Figma, người dùng 20/11/2026).
          searchPlaceholder={tApp('searchPlaceholder')}
          onSearchChange={changeSearch}
          {...(isBoard
            ? {}
            : {
                tabs: (
            <StageRail
              value={rail}
              stages={visibleStages}
              countOf={countOf}
              allCount={allCount}
              onChange={selectRail}
            />
                ),
              })}
          hasRows={hasItems}
          groups={groups}
          onFilterChange={changeFilter}
          {...(singleMeta ? { meta: singleMeta } : {})}
          onPageChange={setPage}
          loadingMore={Boolean(singleQuery?.isFetching) && page > 1}
        >
          {({ onScroll, headerHeight, contentContainerStyle, bindList }) => {
            const inStateScroll = (children: ReactNode) => (
              <ManageStateScroll
                onScroll={onScroll}
                headerHeight={headerHeight}
                refreshing={refreshing}
                onRefresh={refetchAll}
              >
                {children}
              </ManageStateScroll>
            );
            if (isBoard) {
              return inStateScroll(<RentalsBoard columns={boardColumns} />);
            }
            if (pending) {
              return inStateScroll(
                <YStack px={layout.screenX} gap={layout.inline}>
                  {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                    <RecordCardSkeleton key={i} />
                  ))}
                </YStack>,
              );
            }
            if (allFailed) {
              return inStateScroll(
                <ScreenError
                  error={activeQueries[0]?.error}
                  title={tList('errorTitle')}
                  onRetry={refetchAll}
                />,
              );
            }
            if (!hasItems && (isAll || filtered)) {
              return inStateScroll(
                /* Chỉ lọc theo chi nhánh: câu riêng của chi nhánh (vẫn có lối gỡ lọc). */
                branchEmpty && serviceType === ALL && q.length === 0 && !vehicleId ? (
                  <ScreenMessage
                    icon="location-outline"
                    title={branchEmpty.title}
                    description={branchEmpty.hint}
                    actionLabel={tCommon('actions.clear')}
                    onAction={clearFilters}
                  />
                ) : filtered ? (
                  <NoResults />
                ) : (
                  <ScreenMessage
                    icon="document-text-outline"
                    title={marketOnly ? t('emptyAllMarketTitle') : t('emptyAllTitle')}
                    description={marketOnly ? t('emptyAllMarketBody') : t('emptyAllBody')}
                    {...(marketOnly && permissions.has(PERMISSION.VEHICLE_VIEW)
                      ? {
                          actionLabel: t('viewVehicles'),
                          onAction: () => navigateOnce(ROUTES.manage.vehicles()),
                        }
                      : {})}
                  />
                ),
              );
            }
            return (
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
                  <RefreshControl
                    refreshing={refreshing}
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
      {decisions.sheets}
    </>
  );
}

/** Tông chấm của từng nhóm - web `STAGE_TONE` (`RentalStageHeading.tsx`). */
type StageTone = 'neutral' | 'danger' | 'warning' | 'info' | 'success';
const STAGE_TONE: Record<RentalStage, StageTone> = {
  [RENTAL_STAGE.NEEDS_ACTION]: 'danger',
  [RENTAL_STAGE.AWAITING_PAYMENT]: 'warning',
  [RENTAL_STAGE.AWAITING_PICKUP]: 'info',
  [RENTAL_STAGE.RENTING]: 'success',
};

/** Màu chấm theo tông - Figma "_Dot" (đỏ · cam · xanh dương · xanh lá; "Tất cả" xám). */
function useStageDots(): Record<StageTone, string> {
  const colors = useColors();
  return useMemo(
    () => ({
      neutral: colors.placeholder,
      danger: colors.danger,
      warning: colors.warningVivid,
      info: colors.infoStrong,
      success: colors.success,
    }),
    [colors],
  );
}

/**
 * Dải nhóm - design v2 (Figma "Horizontal tabs" `24175:57186`, `ChipTabs`): "Tất cả" rồi từng
 * chặng với chấm tông + SỐ ĐẾM từ server (web `StatusRail` có cả hai — Figma không vẽ, giữ lại).
 */
function StageRail({
  value,
  stages,
  countOf,
  allCount,
  onChange,
}: {
  value: Rail;
  stages: readonly RentalStage[];
  countOf: (stage: RentalStage) => number | undefined;
  allCount: number | undefined;
  onChange: (next: Rail) => void;
}) {
  const t = useTranslations('Bookings.board');
  const { gutter } = useResponsive();
  const dots = useStageDots();
  const items = useMemo<ChipTabItem<Rail>[]>(
    () => [
      { value: ALL, label: t('all'), dot: dots.neutral, count: allCount },
      ...stages.map((stage) => ({
        value: stage as Rail,
        label: t(`stage.${stage}`),
        dot: dots[STAGE_TONE[stage]],
        count: countOf(stage),
      })),
    ],
    [t, dots, allCount, stages, countOf],
  );
  return (
    <ChipTabs label={t('railLabel')} items={items} value={value} onSelect={onChange} gutter={gutter} />
  );
}

/**
 * Dải tiêu đề một nhóm — bản native của `RentalStageHeading` web: vạch màu trái · tên · số đếm;
 * bên phải "Xem tất cả (n)" ở ô "Tất cả". `memo` + `onViewAll` nhận NHÓM (hàm ổn định của màn) để
 * dòng tiêu đề không vẽ lại khi danh sách gọi lại `renderItem`.
 */
const StageHeading = memo(function StageHeading({
  stage,
  count,
  more,
  onViewAll,
}: {
  stage: RentalStage;
  count: number | undefined;
  more: number | null;
  onViewAll: (stage: Rail) => void;
}) {
  const viewAll = useCallback(() => onViewAll(stage as Rail), [onViewAll, stage]);
  const colors = useColors();
  const t = useTranslations('Bookings.board');
  const dots = useStageDots();
  /*
   * Ngôn ngữ v2: chấm tông 6 · tên nhóm 16/24 semibold · viên đếm "_Badge"; bên phải link vàng
   * "Xem tất cả (n) →" (`LinkArrow`) ở ô "Tất cả". Figma không vẽ dải này — web có, giữ lại.
   */
  return (
    <XStack ai="center" jc="space-between" gap={space.sm} minHeight={HEADING_MIN_HEIGHT} mb={HEADING_GAP}>
      <XStack ai="center" gap={space.sm} flexShrink={1}>
        <YStack w={DOT} h={DOT} br={radius.pill} bg={dots[STAGE_TONE[stage]]} />
        <Text
          col={colors.text}
          fos={typeScale.title.fontSize}
          lh={typeScale.title.lineHeight}
          fow={fontWeight.semibold}
          accessibilityRole="header"
          numberOfLines={1}
          flexShrink={1}
        >
          {t(`stage.${stage}`)}
        </Text>
        {count === undefined ? null : (
          <YStack>
            <Pill label={String(count)} tone="neutral" />
          </YStack>
        )}
      </XStack>
      {more !== null ? <LinkArrow label={t('viewAll', { count: more })} onPress={viewAll} /> : null}
    </XStack>
  );
});

/** Dải tên nhóm: cao theo dòng chữ 24, cách khối dưới 8; chấm 6 (gọn lại lần hai 20/11/2026). */
const HEADING_MIN_HEIGHT = 24;
const HEADING_GAP = 8;
const DOT = 6;

/** Liệt kê tường minh — khoá i18n ghép động lọt qua typecheck của `use-intl`. */
function sortLabel(t: ReturnType<typeof useTranslations<'Bookings.list'>>, sort: BookingSort): string {
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
