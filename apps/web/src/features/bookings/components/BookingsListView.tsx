'use client';

import { PlusOutlined } from '@ant-design/icons';
import { App, Button, Pagination } from 'antd';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import {
  BOOKING_LIST_PRESET,
  PERMISSION,
  SERVICE_TYPE_VALUES,
  type BookingListPreset,
} from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { FilterBar, type FilterField, type FilterValues } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import {
  StatusRail,
  type StatusRailGroup,
  type StatusRailItem,
  type StatusRailTone,
} from '@/components/navigation/StatusRail';
import { ALL_FILTER } from '@/constants/filters';
import { ROUTES } from '@/constants/routes';
import { useBranchFilter } from '@/features/branches/hooks/use-branch-filter';
import { StaffBookingDialog } from '@/features/booking-requests/components/StaffBookingDialog';
import { useStartBookingRequestConversation } from '@/features/booking-requests/hooks/use-booking-request-mutations';
import { useBookingFilters } from '@/features/bookings/hooks/use-booking-filters';
import { useCanCreateBooking } from '@/features/bookings/hooks/use-can-create-booking';
import { useBookings } from '@/features/bookings/hooks/use-bookings';
import type { BookingFilters, BookingListItem, BookingSort } from '@/features/bookings/types';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { usePermissions } from '@/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { BookingCard } from './BookingCard';
import { ExtendBookingDialog } from './ExtendBookingDialog';
import styles from './BookingsListView.module.css';

/** Cách sắp xếp — khớp `BOOKING_SORT` ở DTO backend; nhãn lấy từ bó message. */
const SORT_VALUES = ['newest', 'pickup_asc', 'pickup_desc', 'return_asc'] as const;

/** Giá trị cột trái cho ô "Tất cả" — không phải một mã nghiệp vụ, không bao giờ lên API. */
const ALL_VIEW = 'all';
type RailValue = BookingListPreset | typeof ALL_VIEW;

/** Mỗi nhóm ở ô "Tất cả" hiện chừng này chuyến gần nhất ("3 chuyến gần nhất" — design). */
const ALL_VIEW_GROUP_LIMIT = 3;

/** Thứ tự bốn ngăn — cũng là thứ tự các nhóm ở ô "Tất cả". */
const GROUP_ORDER: readonly BookingListPreset[] = [
  BOOKING_LIST_PRESET.AWAITING_PICKUP,
  BOOKING_LIST_PRESET.RENTING,
  BOOKING_LIST_PRESET.COMPLETED,
  BOOKING_LIST_PRESET.CANCELLED,
];

const GROUP_TONE: Readonly<Record<BookingListPreset, StatusRailTone>> = {
  [BOOKING_LIST_PRESET.AWAITING_PICKUP]: 'warning',
  [BOOKING_LIST_PRESET.RENTING]: 'info',
  [BOOKING_LIST_PRESET.COMPLETED]: 'success',
  [BOOKING_LIST_PRESET.CANCELLED]: 'danger',
};

/**
 * Cách sắp xếp MẶC ĐỊNH của từng ngăn — trùng với mặc định của server (`orderByOf`), chỉ để ô
 * "Sắp xếp" nói đúng thứ tự đang hiện: ca trực đọc "chờ giao" theo giờ hẹn, "đang thuê" theo giờ
 * phải về, hai ngăn đã kết thúc như lịch sử.
 */
const DEFAULT_SORT: Readonly<Record<RailValue, BookingSort>> = {
  [ALL_VIEW]: 'newest',
  [BOOKING_LIST_PRESET.AWAITING_PICKUP]: 'pickup_asc',
  [BOOKING_LIST_PRESET.RENTING]: 'return_asc',
  [BOOKING_LIST_PRESET.COMPLETED]: 'pickup_desc',
  [BOOKING_LIST_PRESET.CANCELLED]: 'pickup_desc',
};

/**
 * "Quản lý đơn thuê xe" — Figma Partner-XePrime All Request (`23790:45293`) và All Request - Done
 * (`23797:49689`), 02/11/2026.
 *
 * Cột trái là bộ lọc NGĂN (`?preset=`, vắng = "Tất cả"): bốn ngăn phủ kín mọi đơn và không chồng
 * nhau, số đếm của chúng do server trả cùng trang (`meta.presetCounts`). Ô "Tất cả" nhóm theo ngăn,
 * mỗi nhóm vài chuyến gần nhất + đường sang ngăn đó; một ngăn thì là danh sách đầy đủ có phân trang.
 * Mọi lọc/sắp xếp/phân trang đều SERVER-SIDE. Quyết định của người dùng: sổ cái
 * `docs/design/09_PARTNER_REDESIGN.md` §3.2.
 */
export function BookingsListView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('Bookings');
  const tBoard = useTranslations('Bookings.board');
  const label = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const { has } = usePermissions();
  const { filters, setFilters } = useBookingFilters();
  const branch = useBranchFilter({
    value: filters.branchId,
    onChange: (branchId) => setFilters({ branchId }),
  });

  const view: RailValue = filters.preset ?? ALL_VIEW;
  const sort = filters.sort ?? DEFAULT_SORT[view];

  /*
   * Phạm vi chung của mọi truy vấn trên màn: tìm kiếm, chi nhánh, dịch vụ, xe, sắp xếp do người
   * dùng CHỌN (vắng thì mỗi ngăn tự dùng mặc định của server).
   */
  const scope: BookingFilters = {
    q: filters.q,
    branchId: filters.branchId,
    serviceType: filters.serviceType,
    vehicleId: filters.vehicleId,
    ...(filters.sort ? { sort: filters.sort } : {}),
  };

  const canCreate = useCanCreateBooking();
  // Phiên hỗ trợ không bao giờ xác nhận bàn giao, không nhắn tin thay gian hàng (ADR 0050 §10).
  const hidesHandover = useSupportHides(SUPPORT_HIDDEN_AREA.HANDOVER_ACTIONS);
  const chatHidden = useSupportHides(SUPPORT_HIDDEN_AREA.CHAT);
  const canHandle = has(PERMISSION.HANDOVER_CONFIRM) && !hidesHandover;
  // Hội thoại của đơn là hội thoại của YÊU CẦU đã sinh ra nó — cùng cổng quyền với hộp thư.
  const canMessage = has(PERMISSION.BOOKING_REQUEST_VIEW) && !chatHidden;
  // Gia hạn (ADR 0077) là tiền của chuyến — phiên hỗ trợ không mở (backend không khai @SupportAction).
  const settlementHidden = useSupportHides(SUPPORT_HIDDEN_AREA.SETTLEMENT);
  const canExtend = has(PERMISSION.BOOKING_UPDATE) && !settlementHidden;
  const [extending, setExtending] = useState<BookingListItem | null>(null);
  const startConversation = useStartBookingRequestConversation();

  function openConversation(requestId: string) {
    startConversation.mutate(requestId, {
      onSuccess: (conversation) => router.push(`${ROUTES.MANAGE.CHAT}?c=${conversation.id}`),
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  function renderCard(booking: BookingListItem, group: BookingListPreset) {
    const requestId = booking.bookingRequestId;
    const pending = startConversation.isPending && startConversation.variables === requestId;
    return (
      <li key={booking.id}>
        <BookingCard
          booking={booking}
          group={group}
          branchId={filters.branchId}
          canHandle={canHandle}
          onMessage={canMessage && requestId ? () => openConversation(requestId) : undefined}
          onExtend={canExtend ? () => setExtending(booking) : undefined}
          messagePending={pending}
          busy={pending}
        />
      </li>
    );
  }

  /*
   * Ý ĐỊNH đến từ nơi khác: hồ sơ khách mở "Tạo đơn thuê" bằng `?create=1` kèm tên + SĐT (IA §5).
   * Suy lúc render, dọn tham số lúc ĐÓNG hộp thoại — giữ lại thì F5 tự mở lại.
   */
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
    // Đổi ngăn: bỏ trang và cách sắp xếp riêng của ngăn cũ — mỗi ngăn có thứ tự tự nhiên của nó.
    setFilters({
      preset: value === ALL_VIEW ? undefined : value,
      sort: undefined,
      page: undefined,
    });
  }

  /*
   * ADR 0047 + chốt 02/11/2026: ô "Trạng thái" đã BỎ — cột trái là bộ lọc trạng thái. Thanh lọc
   * còn tìm kiếm · chi nhánh · dịch vụ · sắp xếp, đúng hàng của design.
   */
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
    {
      kind: 'select',
      key: 'sort',
      label: t('list.sortLabel'),
      allowClear: false,
      options: SORT_VALUES.map((value) => ({ value, label: t(`list.sort.${value}`) })),
    },
  ];

  function changeFilters(patch: FilterValues) {
    const next: Partial<BookingFilters> = {};
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

  /*
   * Truy vấn của màn nằm Ở ĐÂY, không ở hai khung con: ô "Tất cả" là bốn truy vấn nhỏ có giới hạn
   * (mỗi ngăn vài chuyến gần nhất), một ngăn là một truy vấn có phân trang — chỉ cái đang xem
   * được bật. Không bao giờ tải hết rồi chia ở client.
   */
  const isAll = view === ALL_VIEW;
  const preview = (group: BookingListPreset): BookingFilters => ({
    ...scope,
    preset: group,
    page: 1,
    limit: ALL_VIEW_GROUP_LIMIT,
  });
  const previews: Record<BookingListPreset, BookingsQuery> = {
    [BOOKING_LIST_PRESET.AWAITING_PICKUP]: useBookings(
      preview(BOOKING_LIST_PRESET.AWAITING_PICKUP),
      { enabled: isAll },
    ),
    [BOOKING_LIST_PRESET.RENTING]: useBookings(preview(BOOKING_LIST_PRESET.RENTING), {
      enabled: isAll,
    }),
    [BOOKING_LIST_PRESET.COMPLETED]: useBookings(preview(BOOKING_LIST_PRESET.COMPLETED), {
      enabled: isAll,
    }),
    [BOOKING_LIST_PRESET.CANCELLED]: useBookings(preview(BOOKING_LIST_PRESET.CANCELLED), {
      enabled: isAll,
    }),
  };
  const groupQuery = useBookings(
    { ...scope, preset: isAll ? undefined : view, page: filters.page, limit: filters.limit },
    { enabled: !isAll },
  );

  /*
   * Số đếm của cột trái: MỘT nguồn — `meta.presetCounts` của truy vấn đang xem (mọi truy vấn trên
   * màn cùng phạm vi lọc, nên cùng bốn con số). Ô "Tất cả" là tổng bốn ngăn.
   */
  const countMeta = isAll
    ? GROUP_ORDER.map((group) => previews[group].data?.meta).find(Boolean)
    : groupQuery.data?.meta;
  const counts = countMeta?.presetCounts ?? null;
  const countOf = (preset: BookingListPreset) =>
    counts ? (counts.find((c) => c.preset === preset)?.count ?? 0) : undefined;
  const allCount = counts ? counts.reduce((sum, c) => sum + c.count, 0) : undefined;

  const railItem = (preset: BookingListPreset): StatusRailItem<RailValue> => ({
    value: preset,
    label: tBoard(`preset.${preset}`),
    tone: GROUP_TONE[preset],
    count: countOf(preset),
  });
  const railGroups: StatusRailGroup<RailValue>[] = [
    {
      key: 'needs-action',
      label: tBoard('groupNeedsAction'),
      items: [railItem(BOOKING_LIST_PRESET.AWAITING_PICKUP), railItem(BOOKING_LIST_PRESET.RENTING)],
    },
    {
      key: 'ended',
      label: tBoard('groupEnded'),
      items: [railItem(BOOKING_LIST_PRESET.COMPLETED), railItem(BOOKING_LIST_PRESET.CANCELLED)],
    },
  ];

  return (
    <div className={styles.page}>
      <ManagePageHeader
        title={tBoard('title')}
        subtitle={tBoard('subtitle')}
        extra={
          canCreate ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              {tBoard('create')}
            </Button>
          ) : null
        }
      />

      <FilterBar
        fields={fields}
        values={{
          q: filters.q,
          branchId: filters.branchId ?? ALL_FILTER,
          serviceType: filters.serviceType ?? ALL_FILTER,
          sort,
        }}
        onChange={changeFilters}
        searchDebounceMs={300}
      />

      <div className={styles.layout}>
        <StatusRail<RailValue>
          label={tBoard('railLabel')}
          head={{ value: ALL_VIEW, label: tBoard('all'), tone: 'neutral', count: allCount }}
          groups={railGroups}
          value={view}
          onSelect={selectView}
        />

        <div className={styles.content}>
          {isAll ? (
            <AllGroups
              queries={previews}
              renderCard={renderCard}
              onOpenGroup={selectView}
              filtered={filtered}
              onClearFilters={clearFilters}
              emptyAction={
                canCreate ? (
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
                    {t('list.createFirst')}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <GroupList
              group={view}
              query={groupQuery}
              renderCard={renderCard}
              filtered={filtered}
              onClearFilters={clearFilters}
              onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
            />
          )}
        </div>
      </div>

      {/*
       * Tạo đơn dùng NGUYÊN luồng "Đặt xe cho khách" của lịch — cùng giao diện khách thuê xe (hồ
       * sơ xe + ba bước, báo giá server). Lối vào này chưa biết xe nên mở ở bước chọn xe trước.
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
    </div>
  );
}

type RenderCard = (booking: BookingListItem, group: BookingListPreset) => React.ReactNode;

type BookingsQuery = ReturnType<typeof useBookings>;

/** Một ngăn — danh sách đầy đủ, phân trang server-side (Figma All Request - Done). */
function GroupList({
  group,
  query,
  renderCard,
  filtered,
  onClearFilters,
  onPageChange,
}: {
  group: BookingListPreset;
  query: BookingsQuery;
  renderCard: RenderCard;
  filtered: boolean;
  onClearFilters: () => void;
  onPageChange: (page: number, pageSize: number) => void;
}) {
  const t = useTranslations('Bookings');
  const tBoard = useTranslations('Bookings.board');
  const tCommon = useTranslations('Common');
  const { data, isError, isFetching, refetch } = query;

  const items = data?.items ?? [];
  const meta = data?.meta;

  if (isFetching && !data) return <LoadingState variant="cards" rows={4} label={t('list.title')} />;
  if (isError && !data) {
    return (
      <EmptyState
        variant="error"
        title={t('list.errorTitle')}
        description={tCommon('states.errorHint')}
        onRetry={() => void refetch()}
      />
    );
  }
  if (items.length === 0) {
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
        title={tBoard('emptyGroupTitle')}
        description={tBoard('emptyGroupBody')}
      />
    );
  }

  return (
    <section aria-label={tBoard('listLabel', { group: tBoard(`preset.${group}`) })}>
      <GroupHeading group={group} />
      <ul
        className={isFetching ? styles.listBusy : styles.list}
        aria-busy={isFetching || undefined}
      >
        {items.map((booking) => renderCard(booking, group))}
      </ul>
      {meta ? (
        <div className={styles.pagination}>
          <Pagination
            current={meta.page}
            pageSize={meta.limit}
            total={meta.total}
            showSizeChanger
            onChange={onPageChange}
            showTotal={(total) => t('list.totalLabel', { count: total })}
          />
        </div>
      ) : null}
    </section>
  );
}

/**
 * Ô "Tất cả" — bốn nhóm theo ngăn (Figma All Request), mỗi nhóm `ALL_VIEW_GROUP_LIMIT` chuyến gần
 * nhất theo thứ tự tự nhiên của ngăn đó và một đường sang ngăn đầy đủ. Nhóm rỗng không vẽ.
 * Bốn truy vấn nhỏ có giới hạn — không bao giờ tải hết rồi chia ở client.
 */
function AllGroups({
  queries,
  renderCard,
  onOpenGroup,
  filtered,
  onClearFilters,
  emptyAction,
}: {
  queries: Record<BookingListPreset, BookingsQuery>;
  renderCard: RenderCard;
  onOpenGroup: (group: BookingListPreset) => void;
  filtered: boolean;
  onClearFilters: () => void;
  emptyAction?: React.ReactNode;
}) {
  const t = useTranslations('Bookings');
  const tBoard = useTranslations('Bookings.board');
  const tCommon = useTranslations('Common');
  const all = GROUP_ORDER.map((group) => queries[group]);
  if (all.every((q) => q.isFetching && !q.data)) {
    return <LoadingState variant="cards" rows={4} label={t('list.title')} />;
  }
  if (all.every((q) => q.isError && !q.data)) {
    return (
      <EmptyState
        variant="error"
        title={t('list.errorTitle')}
        description={tCommon('states.errorHint')}
        onRetry={() => all.forEach((q) => void q.refetch())}
      />
    );
  }
  const loaded = all.every((q) => q.data || q.isError);
  const total = all.reduce((sum, q) => sum + (q.data?.meta.total ?? 0), 0);
  if (loaded && total === 0) {
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
        title={tBoard('emptyAllTitle')}
        description={t('list.emptyBody')}
        action={emptyAction}
      />
    );
  }

  return (
    <div className={styles.groups}>
      {GROUP_ORDER.map((group) => {
        const query = queries[group];
        const items = query.data?.items ?? [];
        const groupTotal = query.data?.meta.total ?? 0;
        if (query.isError && !query.data) {
          return (
            <section key={group} aria-label={tBoard(`preset.${group}`)}>
              <GroupHeading group={group} />
              <EmptyState
                variant="error"
                title={tBoard('groupError')}
                description={tCommon('states.errorHint')}
                onRetry={() => void query.refetch()}
              />
            </section>
          );
        }
        if (items.length === 0) return null;
        return (
          <section
            key={group}
            aria-label={tBoard('listLabel', { group: tBoard(`preset.${group}`) })}
          >
            <GroupHeading
              group={group}
              extra={
                groupTotal > items.length ? (
                  <button
                    type="button"
                    className={styles.viewAll}
                    onClick={() => onOpenGroup(group)}
                  >
                    {tBoard('viewAll', { count: groupTotal })}
                  </button>
                ) : (
                  <span className={styles.recent}>{tBoard('recent', { count: items.length })}</span>
                )
              }
            />
            <ul
              className={query.isFetching ? styles.listBusy : styles.list}
              aria-busy={query.isFetching || undefined}
            >
              {items.map((booking) => renderCard(booking, group))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** "● Chờ giao xe" — chấm và chữ cùng sắc với mục ở cột trái. */
function GroupHeading({ group, extra }: { group: BookingListPreset; extra?: React.ReactNode }) {
  const tBoard = useTranslations('Bookings.board');
  return (
    <div className={styles.groupHead}>
      <h2 className={`${styles.groupTitle} ${styles[GROUP_TONE[group]]}`}>
        {tBoard(`preset.${group}`)}
      </h2>
      {extra}
    </div>
  );
}
