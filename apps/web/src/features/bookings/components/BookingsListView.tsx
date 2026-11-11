'use client';

import { HistoryOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Pagination } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BOOKING_LIST_PRESET,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  isBookingRequestPastDue,
  PERMISSION,
  SERVICE_TYPE_VALUES,
  type BookingListPreset,
} from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { FilterBar, type FilterField, type FilterValues } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { StatusRail, type StatusRailItem } from '@/components/navigation/StatusRail';
import { ALL_FILTER } from '@/constants/filters';
import {
  isRequestStage,
  REQUEST_STAGE_STATUS,
  RENTAL_STAGE,
  RENTAL_STAGE_ORDER,
  RENTAL_VIEW,
  type BookingStage,
  type RentalStage,
  type RentalView,
  type RequestStage,
} from '@/constants/rental-stages';
import { BOOKING_REQUEST_OPEN_PARAM, bookingHistoryPath, ROUTES } from '@/constants/routes';
import { fetchBookingRequest } from '@/features/booking-requests/api';
import { chatThreadHref } from '@/features/chat/chat-links';
import { PARTNER_TRACK, resolvePartnerTrack } from '@/features/auth/post-auth-destination';
import { currentPathWithQuery } from '@/features/auth/safe-next';
import { useBranchFilter } from '@/features/branches/hooks/use-branch-filter';
import { BookingRequestCard } from '@/features/booking-requests/components/BookingRequestCard';
import { BookingRequestDetailDialog } from '@/features/booking-requests/components/BookingRequestDetailDialog';
import { StaffBookingDialog } from '@/features/booking-requests/components/StaffBookingDialog';
import { BOOKING_REQUEST_CLOSED_STATUSES } from '@/features/booking-requests/constants';
import { useBookingRequestDecisions } from '@/features/booking-requests/hooks/use-booking-request-decisions';
import {
  useRemindBookingRequestPayment,
  useStartBookingRequestConversation,
} from '@/features/booking-requests/hooks/use-booking-request-mutations';
import {
  useBookingRequests,
  useBookingRequestsInfinite,
} from '@/features/booking-requests/hooks/use-booking-requests';
import type { BookingRequestItem } from '@/features/booking-requests/types';
import { useCanCreateBooking } from '@/features/bookings/hooks/use-can-create-booking';
import { useBookings, useBookingsInfinite } from '@/features/bookings/hooks/use-bookings';
import { usePaymentArrivalToast } from '@/features/bookings/hooks/use-payment-arrival-toast';
import {
  useRentalsFilters,
  type RentalsFilters,
} from '@/features/bookings/hooks/use-rentals-filters';
import { useRentalsView } from '@/features/bookings/hooks/use-rentals-view';
import type { BookingListItem, BookingSort } from '@/features/bookings/types';
import { CustomerDetailDialog } from '@/features/customers/components/CustomerDetailDialog';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { VehicleDetailDialog } from '@/features/vehicles/components/VehicleDetailDialog';
import { queryKeys } from '@/services/query-keys';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useMediaQuery } from '@/hooks/use-media-query';
import { usePermissions } from '@/hooks/use-permissions';
import { useWorkspace } from '@/hooks/use-workspace';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { rememberRentalsView } from '@/lib/rentals-view-memory';
import { XP_BREAKPOINTS } from '@/styles/theme';
import { BookingCard, bookingCardDetailHref } from './BookingCard';
import { BookingDetailDialog } from './BookingDetailDialog';
import { RentalStageHeading, STAGE_TONE } from './RentalStageHeading';
import { RentalsBoard, type BoardColumn } from './board/RentalsBoard';
import { RentalsViewToggle } from './board/RentalsViewToggle';
import type { RentalCardLayout } from './rental-card/RentalCard';
import { ConfirmReturnDialog } from '@/features/handovers/components/ConfirmReturnDialog';
import { BookingStatusTransitionDialog } from './BookingStatusTransitionDialog';
import { ExtendBookingDialog } from './ExtendBookingDialog';
import styles from './BookingsListView.module.css';

/** Cách sắp xếp của hai nhóm ĐƠN — khớp `BOOKING_SORT` ở DTO backend. */
const SORT_VALUES = ['newest', 'pickup_asc', 'pickup_desc', 'return_asc'] as const;

/** Giá trị cột trái cho ô "Tất cả" — không phải mã nghiệp vụ, không bao giờ lên API. */
const ALL_VIEW = 'all';
type RailValue = RentalStage | typeof ALL_VIEW;

/** Mỗi nhóm ở ô "Tất cả" hiện chừng này chuyến gần nhất. */
const ALL_VIEW_GROUP_LIMIT = 3;

/** Mỗi lần một cột Kanban tải thêm chừng này thẻ. */
const BOARD_PAGE_SIZE = 10;

/**
 * Sắp xếp MẶC ĐỊNH của hai nhóm đơn — trùng với mặc định của server, chỉ để ô "Sắp xếp" nói đúng
 * thứ tự đang hiện: chờ giao theo giờ hẹn, đang thuê theo giờ phải về.
 */
const DEFAULT_BOOKING_SORT: Readonly<Record<BookingStage, BookingSort>> = {
  [RENTAL_STAGE.AWAITING_PICKUP]: 'pickup_asc',
  [RENTAL_STAGE.RENTING]: 'return_asc',
};

type RequestsQuery = ReturnType<typeof useBookingRequests>;
type BookingsQuery = ReturnType<typeof useBookings>;

/** Một nhóm trên màn — dữ liệu đã chuẩn hoá về MỘT hình (thẻ + tổng + trạng thái tải). */
interface StageData {
  stage: RentalStage;
  items: readonly (BookingRequestItem | BookingListItem)[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  /** Đang hiện dữ liệu CŨ trong lúc tải bộ lọc mới — mờ đi; làm mới nền thì không. */
  stale: boolean;
  error: boolean;
  refetch: () => void;
}

function fromRequests(stage: RequestStage, query: RequestsQuery): StageData {
  return {
    stage,
    items: query.data?.items ?? [],
    total: query.data?.meta.total ?? 0,
    page: query.data?.meta.page ?? 1,
    limit: query.data?.meta.limit ?? ALL_VIEW_GROUP_LIMIT,
    loading: query.isFetching && !query.data,
    stale: query.isPlaceholderData,
    error: query.isError && !query.data,
    refetch: () => void query.refetch(),
  };
}

function fromBookings(stage: BookingStage, query: BookingsQuery): StageData {
  return {
    stage,
    items: query.data?.items ?? [],
    total: query.data?.meta.total ?? 0,
    page: query.data?.meta.page ?? 1,
    limit: query.data?.meta.limit ?? ALL_VIEW_GROUP_LIMIT,
    loading: query.isFetching && !query.data,
    stale: query.isPlaceholderData,
    error: query.isError && !query.data,
    refetch: () => void query.refetch(),
  };
}

type BoardQuery =
  ReturnType<typeof useBookingRequestsInfinite> | ReturnType<typeof useBookingsInfinite>;

/**
 * Một cột Kanban từ truy vấn cuộn vô hạn — gộp các trang, BỎ TRÙNG (làm mới nền tải lại từng trang
 * theo số trang, một thẻ có thể dời qua ranh hai trang giữa hai lượt).
 */
function boardColumnOf(
  stage: RentalStage,
  query: BoardQuery,
  count: number | undefined,
): BoardColumn {
  const seen = new Set<string>();
  const items: (BookingRequestItem | BookingListItem)[] = [];
  for (const page of query.data?.pages ?? []) {
    for (const item of page.items as readonly (BookingRequestItem | BookingListItem)[]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  }
  return {
    stage,
    items,
    count,
    loading: query.isFetching && !query.data,
    error: query.isError && !query.data,
    stale: query.isPlaceholderData,
    hasNext: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMoreError: query.isFetchNextPageError,
    loadMore: () => void query.fetchNextPage(),
    refetch: () => void query.refetch(),
  };
}

/**
 * "Đơn thuê xe" — MỘT màn cho cả chuyến (05/11/2026, Figma Partner-XePrime "Rental Request - List"
 * `23973:51952`): gộp hộp thư "Yêu cầu đặt xe" và "Quản lý đơn thuê xe" để một chuyến đi qua bốn
 * nhóm Cần xử lý → Chờ khách thanh toán → Chờ giao xe → Đang thuê trên cùng một chỗ. Chuyến đã kết
 * thúc ở màn riêng "Đơn đã kết thúc" (nút ở đầu trang).
 *
 * Hai nhóm đầu là YÊU CẦU, hai nhóm sau là ĐƠN — hai thực thể, hai endpoint; màn chỉ chuẩn hoá chúng
 * về một khuôn thẻ (`RentalCard`). Ranh giới giữa nhóm 2 và 3 là lượt đối soát đủ tiền, không ai bấm
 * qua được (ADR 0044 điều 2) — danh sách tự làm mới nền để thẻ tự sang nhóm khi tiền về.
 *
 * Mọi lọc/sắp xếp/phân trang SERVER-SIDE; ô "Tất cả" là bốn truy vấn nhỏ có giới hạn. Quyết định của
 * người dùng: sổ cái `docs/design/09_PARTNER_REDESIGN.md` §3.2.
 */
export function BookingsListView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('Bookings');
  const tBoard = useTranslations('Bookings.board');
  const tRequests = useTranslations('BookingRequests');
  const label = useDomainLabel();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const { has } = usePermissions();
  const { isManage: isManageWorkspace } = useWorkspace();
  const { data: user } = useCurrentUser();
  // Tuyến hoa hồng không lập đơn tay (`useCanCreateBooking`) — chuyến chỉ đến từ chợ.
  const marketOnly = resolvePartnerTrack(user) === PARTNER_TRACK.COMMISSION;
  const { filters, setFilters } = useRentalsFilters();
  // Kanban / List — `null` trong lượt hydrate đầu (chưa đọc được lựa chọn đã nhớ của trình duyệt).
  const { view: mode, boardAvailable } = useRentalsView(filters.view);
  const isBoard = mode === RENTAL_VIEW.BOARD;
  const isList = mode === RENTAL_VIEW.LIST;
  // Điện thoại + tablet: danh sách dùng thẻ GỌN của Kanban (Figma "Rental Request - MB" `24117:65745`,
  // 10/11/2026) — trên tablet & mobile khi xem dạng List, thẻ gọn mở/thu giúp quét nhanh hơn.
  const isCompactList = useMediaQuery(`(max-width: ${XP_BREAKPOINTS.tablet}px)`);
  /** Đang cầm một thẻ trên Kanban — tạm dừng làm mới nền để thẻ không biến mất dưới tay. */
  const [dragging, setDragging] = useState(false);
  const branch = useBranchFilter({
    value: filters.branchId,
    onChange: (branchId) => setFilters({ branchId }),
  });

  /*
   * Quyền theo THỰC THỂ: hai nhóm yêu cầu cần `booking_requests.view`, hai nhóm đơn cần
   * `bookings.view`. Thiếu quyền nào thì nhóm đó vắng hẳn (server cũng chặn).
   */
  const canViewRequests = has(PERMISSION.BOOKING_REQUEST_VIEW);
  const canViewBookings = has(PERMISSION.BOOKING_VIEW);
  const visibleStages = RENTAL_STAGE_ORDER.filter((stage) =>
    isRequestStage(stage) ? canViewRequests : canViewBookings,
  );
  const rail: RailValue =
    filters.preset && visibleStages.includes(filters.preset) ? filters.preset : ALL_VIEW;
  const isAll = rail === ALL_VIEW;

  const canApprove = has(PERMISSION.BOOKING_REQUEST_APPROVE);
  const canViewVehicle = has(PERMISSION.VEHICLE_VIEW);
  // Sổ khách là năng lực của GÓI (ADR 0027 điều 1) — thành viên gian hàng tuyến hoa hồng không có.
  const canViewCustomer = has(PERMISSION.CUSTOMER_VIEW) && isManageWorkspace;
  const canCreate = useCanCreateBooking();
  // Phiên hỗ trợ không xác nhận bàn giao, không nhắn tin, không gửi lời nhắc thay gian hàng (ADR 0050).
  const hidesHandover = useSupportHides(SUPPORT_HIDDEN_AREA.HANDOVER_ACTIONS);
  const chatHidden = useSupportHides(SUPPORT_HIDDEN_AREA.CHAT);
  const settlementHidden = useSupportHides(SUPPORT_HIDDEN_AREA.SETTLEMENT);
  const canHandle = has(PERMISSION.HANDOVER_CONFIRM) && !hidesHandover;
  const canMessage = canViewRequests && !chatHidden;
  // Gia hạn (ADR 0077) là tiền của chuyến — phiên hỗ trợ không mở.
  const canExtend = has(PERMISSION.BOOKING_UPDATE) && !settlementHidden;
  // "Khách không đến" là một kết cục bàn giao — phiên hỗ trợ không ghi thay gian hàng.
  const canNoShow = has(PERMISSION.BOOKING_UPDATE) && !hidesHandover;
  const canRemind = canApprove && !chatHidden;

  /** Chỗ đang đứng kèm nhóm + trang — link "Xem lịch xe" quay về đúng đây. */
  const backHref = currentPathWithQuery(pathname, searchParams.toString());

  // ── Truy vấn ────────────────────────────────────────────────────────────
  const requestScope = {
    q: filters.q,
    branchId: filters.branchId,
    serviceType: filters.serviceType,
    vehicleId: filters.vehicleId,
  };
  const bookingScope = { ...requestScope, ...(filters.sort ? { sort: filters.sort } : {}) };
  const singlePage = { page: filters.page, limit: filters.limit };
  const previewPage = { page: 1, limit: ALL_VIEW_GROUP_LIMIT };

  const requestQuery = (stage: RequestStage) =>
    ({
      ...requestScope,
      status: REQUEST_STAGE_STATUS[stage],
      sort: 'urgent' as const,
      ...(isAll ? previewPage : singlePage),
    }) as const;
  const bookingQuery = (stage: BookingStage) => ({
    ...bookingScope,
    preset: stage as BookingListPreset,
    ...(isAll ? previewPage : singlePage),
  });

  const needsAction = useBookingRequests(requestQuery(RENTAL_STAGE.NEEDS_ACTION), {
    enabled: isList && canViewRequests && (isAll || rail === RENTAL_STAGE.NEEDS_ACTION),
    live: true,
  });
  const awaitingPayment = useBookingRequests(requestQuery(RENTAL_STAGE.AWAITING_PAYMENT), {
    enabled: isList && canViewRequests && (isAll || rail === RENTAL_STAGE.AWAITING_PAYMENT),
    live: true,
  });
  const awaitingPickup = useBookings(bookingQuery(RENTAL_STAGE.AWAITING_PICKUP), {
    enabled: isList && canViewBookings && (isAll || rail === RENTAL_STAGE.AWAITING_PICKUP),
    live: true,
  });
  const renting = useBookings(bookingQuery(RENTAL_STAGE.RENTING), {
    enabled: isList && canViewBookings && (isAll || rail === RENTAL_STAGE.RENTING),
    live: true,
  });

  /*
   * Số đếm của cột trái cần CẢ HAI thực thể kể cả khi đang xem một nhóm của thực thể kia. Khi
   * truy vấn của thực thể đó đang tắt, bật một truy vấn một-dòng chỉ để đọc `meta` (số đếm theo
   * trạng thái/ngăn trả CÙNG phạm vi lọc).
   */
  const requestMetaNeeded =
    isList && canViewRequests && !isAll && !isRequestStage(rail as RentalStage);
  const bookingMetaNeeded =
    isList && canViewBookings && !isAll && isRequestStage(rail as RentalStage);
  const requestMeta = useBookingRequests(
    { ...requestScope, status: REQUEST_STAGE_STATUS[RENTAL_STAGE.NEEDS_ACTION], page: 1, limit: 1 },
    { enabled: requestMetaNeeded, live: true },
  );
  const bookingMeta = useBookings(
    { ...bookingScope, preset: BOOKING_LIST_PRESET.AWAITING_PICKUP, page: 1, limit: 1 },
    { enabled: bookingMetaNeeded, live: true },
  );

  /*
   * KANBAN: mỗi cột một truy vấn cuộn vô hạn, CÙNG phạm vi lọc, thứ tự tự nhiên của server (hạn
   * đang chạy cho hai cột yêu cầu, giờ hẹn giao / giờ phải về cho hai cột đơn). Tạm dừng làm mới nền
   * trong lúc đang cầm thẻ.
   */
  const boardLive = !dragging;
  const boardRequests = (stage: RequestStage) => ({
    ...requestScope,
    status: REQUEST_STAGE_STATUS[stage],
    sort: 'urgent' as const,
    limit: BOARD_PAGE_SIZE,
  });
  const boardBookings = (stage: BookingStage) => ({
    ...requestScope,
    preset: stage as BookingListPreset,
    limit: BOARD_PAGE_SIZE,
  });
  const boardNeedsAction = useBookingRequestsInfinite(boardRequests(RENTAL_STAGE.NEEDS_ACTION), {
    enabled: isBoard && canViewRequests,
    live: boardLive,
  });
  const boardAwaitingPayment = useBookingRequestsInfinite(
    boardRequests(RENTAL_STAGE.AWAITING_PAYMENT),
    { enabled: isBoard && canViewRequests, live: boardLive },
  );
  const boardAwaitingPickup = useBookingsInfinite(boardBookings(RENTAL_STAGE.AWAITING_PICKUP), {
    enabled: isBoard && canViewBookings,
    live: boardLive,
  });
  const boardRenting = useBookingsInfinite(boardBookings(RENTAL_STAGE.RENTING), {
    enabled: isBoard && canViewBookings,
    live: boardLive,
  });

  const stageData: Record<RentalStage, StageData> = {
    [RENTAL_STAGE.NEEDS_ACTION]: fromRequests(RENTAL_STAGE.NEEDS_ACTION, needsAction),
    [RENTAL_STAGE.AWAITING_PAYMENT]: fromRequests(RENTAL_STAGE.AWAITING_PAYMENT, awaitingPayment),
    [RENTAL_STAGE.AWAITING_PICKUP]: fromBookings(RENTAL_STAGE.AWAITING_PICKUP, awaitingPickup),
    [RENTAL_STAGE.RENTING]: fromBookings(RENTAL_STAGE.RENTING, renting),
  };

  const statusCounts = (
    needsAction.data ??
    awaitingPayment.data ??
    requestMeta.data ??
    boardNeedsAction.data?.pages[0] ??
    boardAwaitingPayment.data?.pages[0]
  )?.meta.statusCounts;
  const presetCounts = (
    awaitingPickup.data ??
    renting.data ??
    bookingMeta.data ??
    boardAwaitingPickup.data?.pages[0] ??
    boardRenting.data?.pages[0]
  )?.meta.presetCounts;
  const requestCount = (statuses: readonly string[]) =>
    statusCounts
      ? statusCounts
          .filter((entry) => statuses.includes(entry.status))
          .reduce((sum, entry) => sum + entry.count, 0)
      : undefined;
  const bookingCount = (presets: readonly string[]) =>
    presetCounts
      ? presetCounts
          .filter((entry) => presets.includes(entry.preset))
          .reduce((sum, entry) => sum + entry.count, 0)
      : undefined;

  const countOf = (stage: RentalStage): number | undefined =>
    isRequestStage(stage) ? requestCount([REQUEST_STAGE_STATUS[stage]]) : bookingCount([stage]);
  const stageCounts = visibleStages.map(countOf);
  const allCount = stageCounts.every((count) => count !== undefined)
    ? stageCounts.reduce<number>((sum, count) => sum + (count ?? 0), 0)
    : undefined;
  // Nút "Đơn đã kết thúc (n)": đơn đã đóng + yêu cầu không thành đơn, cùng phạm vi lọc.
  const endedBookings = canViewBookings
    ? bookingCount([BOOKING_LIST_PRESET.COMPLETED, BOOKING_LIST_PRESET.CANCELLED])
    : 0;
  const endedRequests = canViewRequests ? requestCount(BOOKING_REQUEST_CLOSED_STATUSES) : 0;
  const endedCount =
    endedBookings !== undefined && endedRequests !== undefined
      ? endedBookings + endedRequests
      : undefined;

  // "Ghi nhận thanh toán" khi khách trả đủ tiền giữ chỗ — cả hai dạng xem.
  usePaymentArrivalToast({ enabled: canViewRequests, canOpenBooking: canViewBookings });

  // ── Quyết định trên yêu cầu ─────────────────────────────────────────────
  const decisions = useBookingRequestDecisions();
  const startConversation = useStartBookingRequestConversation();
  const remind = useRemindBookingRequestPayment();

  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [detailRequest, setDetailRequest] = useState<BookingRequestItem | null>(null);
  const [vehicleDetailId, setVehicleDetailId] = useState<string | null>(null);
  const [customerDetail, setCustomerDetail] = useState<{ id: string; name: string } | null>(null);
  const [extending, setExtending] = useState<BookingListItem | null>(null);
  const [noShowFor, setNoShowFor] = useState<BookingListItem | null>(null);
  const [receiving, setReceiving] = useState<BookingListItem | null>(null);

  function openConversation(requestId: string) {
    startConversation.mutate(requestId, {
      onSuccess: (conversation) =>
        router.push(chatThreadHref(ROUTES.MANAGE.CHAT, conversation.id, { tripId: requestId })),
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  function remindCustomer(request: BookingRequestItem) {
    if (remind.isPending) return;
    remind.mutate(request.id, {
      onSuccess: (result) =>
        message.success(
          tRequests('remind.success', {
            name: request.customerName,
            time: fmt.time(result.nextAvailableAt),
          }),
        ),
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  function pendingRequestAction(id: string) {
    if (startConversation.isPending && startConversation.variables === id)
      return 'message' as const;
    if (remind.isPending && remind.variables === id) return 'remind' as const;
    return decisions.decisionActionFor(id);
  }

  /** Đã thành đơn ⇒ chi tiết ĐƠN; chưa ⇒ chi tiết YÊU CẦU (duyệt/từ chối được ngay trong đó). */
  function openRequestDetail(row: BookingRequestItem) {
    if (row.bookingId && canViewBookings) setDetailBookingId(row.bookingId);
    else setDetailRequest(row);
  }

  /*
   * `?request=<id>` — link từ nơi khác (thẻ chuyến trong tin nhắn) mở sẵn MỘT yêu cầu. Yêu cầu không
   * có trang riêng nên tham số là một Ý ĐỊNH: hộp chi tiết dựng từ dữ liệu server (cùng quy tắc với
   * `openRequestDetail` — đã thành đơn thì mở ĐƠN), đóng hộp là gỡ tham số. Yêu cầu không đọc được
   * (sai id, của gian hàng khác) thì báo lỗi và gỡ tham số, không treo một hộp rỗng.
   */
  const requestIntentId = searchParams.get(BOOKING_REQUEST_OPEN_PARAM);
  const requestIntent = useQuery({
    queryKey: queryKeys.bookingRequests.detail(requestIntentId ?? ''),
    queryFn: () => fetchBookingRequest(requestIntentId as string),
    enabled: Boolean(requestIntentId) && canViewRequests,
  });
  const intentRequest =
    requestIntentId && requestIntent.data?.id === requestIntentId ? requestIntent.data : null;
  const intentBookingId =
    intentRequest?.bookingId && canViewBookings ? intentRequest.bookingId : null;
  const shownRequest = detailRequest ?? (intentRequest && !intentBookingId ? intentRequest : null);
  const shownBookingId = detailBookingId ?? intentBookingId;

  function clearRequestIntent() {
    if (!requestIntentId) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete(BOOKING_REQUEST_OPEN_PARAM);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const intentFailed = Boolean(requestIntentId) && requestIntent.isError;
  useEffect(() => {
    if (!intentFailed) return;
    message.error(errorMessage(requestIntent.error));
    clearRequestIntent();
    // Chỉ phản ứng lúc truy vấn ý định vừa hỏng — các hàm trên đổi danh tính mỗi lượt render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentFailed]);

  function closeRequestDetail() {
    setDetailRequest(null);
    clearRequestIntent();
  }

  /** Thẻ của một chuyến — CÙNG component, cùng hành động ở cả List lẫn Kanban (khác bố cục). */
  function cardFor(
    stage: RentalStage,
    item: BookingRequestItem | BookingListItem,
    layout: RentalCardLayout,
    dragHandle?: React.ReactNode,
  ) {
    if (isRequestStage(stage)) {
      const request = item as BookingRequestItem;
      return (
        <BookingRequestCard
          request={request}
          canApprove={canApprove}
          canViewVehicle={canViewVehicle}
          canViewCustomer={canViewCustomer}
          canViewBooking={canViewBookings}
          pendingAction={pendingRequestAction(request.id)}
          onApprove={decisions.openApprove}
          onReject={decisions.openReject}
          onCancel={decisions.openCancel}
          onRemind={canRemind ? remindCustomer : undefined}
          onMessage={(row) => openConversation(row.id)}
          onOpenDetail={openRequestDetail}
          onOpenVehicle={(row) => setVehicleDetailId(row.vehicleId)}
          onOpenCustomer={(row) =>
            row.tenantCustomerId &&
            setCustomerDetail({ id: row.tenantCustomerId, name: row.customerName })
          }
          backHref={backHref}
          layout={layout}
          dragHandle={dragHandle}
        />
      );
    }
    const booking = item as BookingListItem;
    const requestId = booking.bookingRequestId;
    const pending = startConversation.isPending && startConversation.variables === requestId;
    return (
      <BookingCard
        booking={booking}
        group={stage as BookingListPreset}
        branchId={filters.branchId}
        canHandle={canHandle}
        onMessage={canMessage && requestId ? () => openConversation(requestId) : undefined}
        onExtend={canExtend ? () => setExtending(booking) : undefined}
        onNoShow={canNoShow ? () => setNoShowFor(booking) : undefined}
        onReceive={canHandle ? () => setReceiving(booking) : undefined}
        messagePending={pending}
        busy={pending}
        backHref={backHref}
        layout={layout}
        dragHandle={dragHandle}
      />
    );
  }

  function renderCard(stage: RentalStage, item: BookingRequestItem | BookingListItem) {
    return <li key={item.id}>{cardFor(stage, item, isCompactList ? 'board' : 'list')}</li>;
  }

  // ── Kanban: cột + kéo thả ───────────────────────────────────────────────
  const boardQueries: Record<RentalStage, BoardQuery> = {
    [RENTAL_STAGE.NEEDS_ACTION]: boardNeedsAction,
    [RENTAL_STAGE.AWAITING_PAYMENT]: boardAwaitingPayment,
    [RENTAL_STAGE.AWAITING_PICKUP]: boardAwaitingPickup,
    [RENTAL_STAGE.RENTING]: boardRenting,
  };
  const boardColumns = visibleStages.map((stage) =>
    boardColumnOf(stage, boardQueries[stage], countOf(stage)),
  );

  /**
   * Tay nắm chỉ ở thẻ CÓ bước kế mà người xem làm được — cùng điều kiện với nút trên thẻ: duyệt
   * (yêu cầu còn trong hạn phản hồi), giao xe (quyền bàn giao, ngoài phiên hỗ trợ). Thẻ "Chờ khách
   * thanh toán" kéo được để thấy cột kế bị khoá và vì sao; thẻ "Đang thuê" là cột cuối, không kéo.
   */
  function canDrag(stage: RentalStage, item: BookingRequestItem | BookingListItem): boolean {
    if (stage === RENTAL_STAGE.NEEDS_ACTION) {
      const request = item as BookingRequestItem;
      return (
        canApprove &&
        request.status === BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL &&
        !isBookingRequestPastDue(request.respondBy) &&
        decisions.decisionActionFor(request.id) === null
      );
    }
    if (stage === RENTAL_STAGE.AWAITING_PAYMENT) return canApprove;
    if (stage === RENTAL_STAGE.AWAITING_PICKUP) return canHandle;
    return false;
  }

  /** Lượt thả hợp lệ = bấm ĐÚNG nút của thẻ: không đổi trạng thái nào ở đây. */
  function dropOnNextStage(
    from: RentalStage,
    _to: RentalStage,
    item: BookingRequestItem | BookingListItem,
  ) {
    if (from === RENTAL_STAGE.NEEDS_ACTION) decisions.openApprove(item as BookingRequestItem);
    else if (from === RENTAL_STAGE.AWAITING_PICKUP) {
      router.push(bookingCardDetailHref(item.id, filters.branchId));
    }
  }

  function chooseView(next: RentalView) {
    rememberRentalsView(next);
    setFilters({ view: next });
  }

  // ── "Tạo đơn thuê" từ hồ sơ khách (`?create=1`) ───────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const createIntent = searchParams.get('create') === '1';
  const intentCustomerName = createIntent ? searchParams.get('customerName') : null;
  const intentCustomerPhone = createIntent ? searchParams.get('customerPhone') : null;

  function closeForm() {
    setFormOpen(false);
    if (!createIntent) return;
    const next = new URLSearchParams(searchParams.toString());
    for (const key of ['create', 'customerName', 'customerPhone']) next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function selectView(value: RailValue) {
    // Đổi nhóm: bỏ trang + sắp xếp của nhóm cũ, gỡ `?status=` của link cũ.
    setFilters({
      preset: value === ALL_VIEW ? undefined : value,
      sort: undefined,
      page: undefined,
      status: undefined,
    });
  }

  // ── Thanh lọc ───────────────────────────────────────────────────────────
  const bookingStageView = isList && !isAll && !isRequestStage(rail as RentalStage);
  const fields: readonly FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('list.searchLabel'),
      placeholder: t('list.searchPlaceholder'),
    },
    ...(branch.field ? [branch.field] : []),
    {
      kind: 'select',
      key: 'serviceType',
      label: t('list.serviceLabel'),
      allowClear: false,
      options: [
        { value: ALL_FILTER, label: t('list.serviceAll') },
        ...SERVICE_TYPE_VALUES.map((value) => ({ value, label: label('serviceType', value) })),
      ],
    },
    /*
     * Sắp xếp chỉ ở hai nhóm ĐƠN khi xem một nhóm: hai nhóm yêu cầu luôn xếp theo hạn đang chạy
     * (ca trực), và ô "Tất cả" là bản xem trước của từng nhóm theo thứ tự tự nhiên của nó.
     */
    ...(bookingStageView
      ? [
          {
            kind: 'select' as const,
            key: 'sort',
            label: t('list.sortLabel'),
            allowClear: false,
            options: SORT_VALUES.map((value) => ({ value, label: t(`list.sort.${value}`) })),
          },
        ]
      : []),
  ];

  function changeFilters(patch: FilterValues) {
    const next: Partial<RentalsFilters> = {};
    if ('q' in patch) next.q = patch.q;
    if ('sort' in patch) next.sort = patch.sort as BookingSort | undefined;
    if ('branchId' in patch)
      next.branchId = patch.branchId === ALL_FILTER ? undefined : patch.branchId;
    if ('serviceType' in patch) {
      next.serviceType = patch.serviceType === ALL_FILTER ? undefined : patch.serviceType;
    }
    setFilters(next);
  }

  const filtered = Boolean(
    filters.q || filters.branchId || filters.serviceType || filters.vehicleId,
  );
  function clearFilters() {
    setFilters({ q: undefined, branchId: undefined, serviceType: undefined, vehicleId: undefined });
  }

  const railItem = (stage: RentalStage): StatusRailItem<RailValue> => ({
    value: stage,
    label: tBoard(`stage.${stage}`),
    tone: STAGE_TONE[stage],
    count: countOf(stage),
  });

  // Link sang "Đơn đã kết thúc" mang theo bộ lọc chung — cùng câu hỏi, khác chặng.
  const endedHref = (() => {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.branchId) params.set('branchId', filters.branchId);
    if (filters.serviceType) params.set('serviceType', filters.serviceType);
    const qs = params.toString();
    const base = bookingHistoryPath();
    return qs ? `${base}?${qs}` : base;
  })();

  const createButton = canCreate ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
      {tBoard('create')}
    </Button>
  ) : null;
  /*
   * Màn trống: gian hàng mời lập đơn tay. Chủ xe tuyến hoa hồng không lập đơn tay — chuyến chỉ đến
   * từ chợ — nên lối có ích là xem lại xe (đã lên chợ chưa, giá, lịch).
   */
  const emptyAction =
    createButton ??
    (marketOnly && canViewVehicle ? (
      <Button type="primary" onClick={() => router.push(ROUTES.MANAGE.VEHICLES)}>
        {tBoard('viewVehicles')}
      </Button>
    ) : null);

  return (
    <div className={styles.page}>
      <ManagePageHeader
        title={tBoard('title')}
        subtitle={tBoard('subtitle')}
        extra={
          <div className={styles.headerActions}>
            <Link href={endedHref} className={styles.endedLink}>
              <HistoryOutlined aria-hidden="true" />
              {endedCount === undefined
                ? tBoard('ended')
                : tBoard('endedWithCount', { count: endedCount })}
            </Link>
            {createButton}
          </div>
        }
      />

      <FilterBar
        fields={fields}
        values={{
          q: filters.q,
          branchId: filters.branchId ?? ALL_FILTER,
          serviceType: filters.serviceType ?? ALL_FILTER,
          sort: bookingStageView
            ? (filters.sort ?? DEFAULT_BOOKING_SORT[rail as BookingStage])
            : undefined,
        }}
        onChange={changeFilters}
        searchDebounceMs={300}
        actions={
          boardAvailable && mode ? (
            <RentalsViewToggle
              view={mode}
              onChange={chooseView}
              showDragHint={canApprove || canHandle}
            />
          ) : undefined
        }
      />

      {visibleStages.length === 0 ? (
        <EmptyState
          variant="empty"
          title={tBoard('noAccessTitle')}
          description={tBoard('noAccessBody')}
        />
      ) : mode === null ? (
        <LoadingState variant="cards" rows={4} label={tBoard('title')} />
      ) : isBoard ? (
        <RentalsBoard
          columns={boardColumns}
          renderCard={(stage, item, dragHandle) => cardFor(stage, item, 'board', dragHandle)}
          canDrag={canDrag}
          onDrop={dropOnNextStage}
          onDraggingChange={setDragging}
          filtered={filtered}
          onClearFilters={clearFilters}
        />
      ) : (
        <div className={styles.layout}>
          <StatusRail<RailValue>
            label={tBoard('railLabel')}
            head={{ value: ALL_VIEW, label: tBoard('all'), tone: 'neutral', count: allCount }}
            groups={[{ key: 'stages', items: visibleStages.map(railItem) }]}
            value={rail}
            onSelect={selectView}
          />

          <div className={styles.content}>
            {isAll ? (
              <AllGroups
                groups={visibleStages.map((stage) => stageData[stage])}
                countOf={countOf}
                renderCard={renderCard}
                onOpenGroup={selectView}
                filtered={filtered}
                onClearFilters={clearFilters}
                emptyAction={emptyAction}
                marketOnly={marketOnly}
              />
            ) : (
              <StageList
                data={stageData[rail as RentalStage]}
                count={countOf(rail as RentalStage)}
                renderCard={renderCard}
                filtered={filtered}
                onClearFilters={clearFilters}
                onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
              />
            )}
          </div>
        </div>
      )}

      {/* Chi tiết đơn của một yêu cầu đã thành đơn — CHÍNH modal của trang đơn. */}
      {shownBookingId ? (
        <BookingDetailDialog
          bookingId={shownBookingId}
          open
          onClose={() => {
            setDetailBookingId(null);
            clearRequestIntent();
          }}
        />
      ) : null}

      <BookingRequestDetailDialog
        request={shownRequest}
        canApprove={canApprove}
        pendingAction={shownRequest ? decisions.decisionActionFor(shownRequest.id) : null}
        onClose={closeRequestDetail}
        onApprove={(row) => {
          closeRequestDetail();
          decisions.openApprove(row);
        }}
        onReject={(row) => {
          closeRequestDetail();
          decisions.openReject(row);
        }}
        onCancel={(row) => {
          closeRequestDetail();
          decisions.openCancel(row);
        }}
        onOpenVehicle={(row) => setVehicleDetailId(row.vehicleId)}
        onOpenCustomer={
          canViewCustomer
            ? (row) =>
                row.tenantCustomerId &&
                setCustomerDetail({ id: row.tenantCustomerId, name: row.customerName })
            : undefined
        }
        backHref={backHref}
      />

      {vehicleDetailId ? (
        <VehicleDetailDialog
          vehicleId={vehicleDetailId}
          open
          onClose={() => setVehicleDetailId(null)}
        />
      ) : null}

      {customerDetail ? (
        <CustomerDetailDialog
          customerId={customerDetail.id}
          customerName={customerDetail.name}
          open
          onClose={() => setCustomerDetail(null)}
        />
      ) : null}

      {decisions.dialogs}

      {/*
       * Tạo đơn dùng NGUYÊN luồng "Đặt xe cho khách" của lịch — cùng giao diện khách thuê xe (hồ sơ xe
       * + ba bước, báo giá server). Lối vào này chưa biết xe nên mở ở bước chọn xe trước.
       */}
      <StaffBookingDialog
        open={formOpen || createIntent}
        customerName={intentCustomerName}
        customerPhone={intentCustomerPhone}
        defaultBranchId={filters.branchId}
        onClose={closeForm}
      />

      {extending ? (
        <ExtendBookingDialog booking={extending} onClose={() => setExtending(null)} />
      ) : null}

      {/* Dựng có điều kiện: mỗi lần mở là một form mới, không còn lý do của lần bấm trước. */}
      {noShowFor ? (
        <BookingStatusTransitionDialog
          booking={noShowFor}
          target={BOOKING_STATUS.NO_SHOW}
          open
          onClose={() => setNoShowFor(null)}
        />
      ) : null}

      {/* "Nhận xe" ở thẻ (List + Kanban) — cùng hộp với nút xác nhận ở trang chi tiết. */}
      {receiving ? (
        <ConfirmReturnDialog booking={receiving} onClose={() => setReceiving(null)} />
      ) : null}
    </div>
  );
}

type RenderCard = (
  stage: RentalStage,
  item: BookingRequestItem | BookingListItem,
) => React.ReactNode;

/** Một nhóm — danh sách đầy đủ, phân trang server-side. */
function StageList({
  data,
  count,
  renderCard,
  filtered,
  onClearFilters,
  onPageChange,
}: {
  data: StageData;
  count: number | undefined;
  renderCard: RenderCard;
  filtered: boolean;
  onClearFilters: () => void;
  onPageChange: (page: number, pageSize: number) => void;
}) {
  const t = useTranslations('Bookings');
  const tBoard = useTranslations('Bookings.board');
  const tCommon = useTranslations('Common');

  if (data.loading) return <LoadingState variant="cards" rows={4} label={tBoard('title')} />;
  if (data.error) {
    return (
      <EmptyState
        variant="error"
        title={t('list.errorTitle')}
        description={tCommon('states.errorHint')}
        onRetry={data.refetch}
      />
    );
  }

  return (
    <section aria-label={tBoard('listLabel', { group: tBoard(`stage.${data.stage}`) })}>
      <RentalStageHeading stage={data.stage} count={count} />
      {data.items.length === 0 ? (
        filtered ? (
          <EmptyState
            variant="no-results"
            title={t('list.emptyFilteredTitle')}
            description={t('list.emptyFilteredBody')}
            action={<Button onClick={onClearFilters}>{tCommon('actions.clear')}</Button>}
          />
        ) : (
          <EmptyState
            variant="empty"
            title={tBoard(`stageEmpty.${data.stage}.title`)}
            description={tBoard(`stageEmpty.${data.stage}.body`)}
          />
        )
      ) : (
        <>
          <ul
            className={data.stale ? styles.listBusy : styles.list}
            aria-busy={data.stale || undefined}
          >
            {data.items.map((item) => renderCard(data.stage, item))}
          </ul>
          <div className={styles.pagination}>
            <Pagination
              current={data.page}
              pageSize={data.limit}
              total={data.total}
              showSizeChanger
              onChange={onPageChange}
              showTotal={(total) => t('list.totalLabel', { count: total })}
            />
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Ô "Tất cả" — bốn nhóm theo thứ tự một chuyến đi qua, mỗi nhóm vài chuyến gần hạn nhất + đường
 * sang nhóm đầy đủ. Nhóm rỗng không vẽ; cả bốn rỗng thì một câu trống chung.
 */
function AllGroups({
  groups,
  countOf,
  renderCard,
  onOpenGroup,
  filtered,
  onClearFilters,
  emptyAction,
  marketOnly,
}: {
  groups: readonly StageData[];
  countOf: (stage: RentalStage) => number | undefined;
  renderCard: RenderCard;
  onOpenGroup: (stage: RentalStage) => void;
  filtered: boolean;
  onClearFilters: () => void;
  emptyAction?: React.ReactNode;
  /** Chuyến chỉ đến từ chợ (tuyến hoa hồng — không lập đơn tay): câu trống không nói "đơn bạn tạo". */
  marketOnly: boolean;
}) {
  const t = useTranslations('Bookings');
  const tBoard = useTranslations('Bookings.board');
  const tCommon = useTranslations('Common');

  if (groups.every((group) => group.loading)) {
    return <LoadingState variant="cards" rows={4} label={tBoard('title')} />;
  }
  if (groups.every((group) => group.error)) {
    return (
      <EmptyState
        variant="error"
        title={t('list.errorTitle')}
        description={tCommon('states.errorHint')}
        onRetry={() => groups.forEach((group) => group.refetch())}
      />
    );
  }
  const loaded = groups.every((group) => !group.loading);
  const total = groups.reduce((sum, group) => sum + group.total, 0);
  if (loaded && total === 0 && groups.every((group) => !group.error)) {
    return filtered ? (
      <EmptyState
        variant="no-results"
        title={t('list.emptyFilteredTitle')}
        description={t('list.emptyFilteredBody')}
        action={<Button onClick={onClearFilters}>{tCommon('actions.clear')}</Button>}
      />
    ) : (
      <EmptyState
        variant="empty"
        title={marketOnly ? tBoard('emptyAllMarketTitle') : tBoard('emptyAllTitle')}
        description={marketOnly ? tBoard('emptyAllMarketBody') : tBoard('emptyAllBody')}
        action={emptyAction ?? undefined}
      />
    );
  }

  return (
    <div className={styles.groups}>
      {groups.map((group) => {
        if (group.error) {
          return (
            <section key={group.stage} aria-label={tBoard(`stage.${group.stage}`)}>
              <RentalStageHeading stage={group.stage} count={countOf(group.stage)} />
              <EmptyState
                variant="error"
                title={tBoard('groupError')}
                description={tCommon('states.errorHint')}
                onRetry={group.refetch}
              />
            </section>
          );
        }
        if (group.items.length === 0) return null;
        return (
          <section
            key={group.stage}
            aria-label={tBoard('listLabel', { group: tBoard(`stage.${group.stage}`) })}
          >
            <RentalStageHeading
              stage={group.stage}
              count={countOf(group.stage)}
              extra={
                group.total > group.items.length ? (
                  <button
                    type="button"
                    className={styles.viewAll}
                    onClick={() => onOpenGroup(group.stage)}
                  >
                    {tBoard('viewAll', { count: group.total })}
                  </button>
                ) : null
              }
            />
            <ul
              className={group.stale ? styles.listBusy : styles.list}
              aria-busy={group.stale || undefined}
            >
              {group.items.map((item) => renderCard(group.stage, item))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
