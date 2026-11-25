'use client';

import {
  CheckOutlined,
  CloseOutlined,
  ExclamationCircleOutlined,
  LinkOutlined,
  LockOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  RollbackOutlined,
  StopOutlined,
  UserOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import { App, Button, Pagination, Select, Skeleton } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DRIVER_LICENCE_CHECK_FILTER,
  DRIVER_LICENCE_STATE,
  DRIVER_LINK_OPEN_STATUSES,
  DRIVER_LINK_STATUS,
  DRIVER_LINK_STATUS_FILTER_ANY,
  DRIVER_LINK_STATUS_FILTER_CLOSED,
  DRIVER_LINK_STATUS_VALUES,
  DRIVER_LIST_SORT,
  DRIVER_LIST_SORT_VALUES,
  DRIVER_OPERATION_FILTER,
  DRIVER_OPERATION_FILTER_VALUES,
  DRIVER_ROSTER_KIND,
  DRIVER_ROSTER_TYPE_FILTER_VALUES,
  DRIVER_TYPE_FILTER_INTERNAL,
  DRIVER_TYPE_VALUES,
  PERMISSION,
  type DriverLinkStatus,
  type DriverListSort,
} from '@xeprime/types';
import type { RowAction } from '@/components/data-display/RowActions';
import { SummaryStrip, type SummaryStripItem } from '@/components/data-display/SummaryStrip';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ALL_FILTER } from '@/constants/filters';
import { driverPath } from '@/constants/routes';
import { useAvailableHref } from '@/features/tenant-support/support-session';
import { usePermissions } from '@/hooks/use-permissions';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { dayjs, nowInAppTz } from '@/lib/datetime';
import { DRIVERS_DEFAULT_LIMIT } from '../api';
import {
  useDriverRoster,
  useDriverRosterSummary,
  useEndDriver,
  useResumeDriver,
  useSetDriverLicenceChecked,
  useSuspendDriver,
} from '../hooks/use-drivers';
import { holderNameDiffers } from '@xeprime/domain';
import { useArchiveInternalDriver, useRestoreInternalDriver } from '../hooks/use-internal-drivers';
import {
  DRIVER_DETAIL_TAB,
  DRIVER_DETAIL_TABS,
  type Driver,
  type DriverFilters,
  type InternalDriver,
} from '../types';
import type { InviteDriverFormValues } from '../schema';
import { AddDriverModal } from './AddDriverModal';
import { DriverCard, InternalDriverCard } from './DriverCard';
import { DRIVER_MONTH_FORMAT, DRIVER_MONTH_PATTERN, DriverMonthPicker } from './DriverMonthPicker';
import { DriverWageSettingsButton } from './DriverWageSettingsButton';
import styles from './DriversPage.module.css';

type ToastKey =
  | 'toast.suspended'
  | 'toast.resumed'
  | 'toast.ended'
  | 'toast.revoked'
  | 'internal.toast.archived'
  | 'internal.toast.restored'
  | 'toast.licenceChecked';

const LINK_STATUS_FILTERS: readonly string[] = [
  ...DRIVER_LINK_STATUS_VALUES,
  DRIVER_LINK_STATUS_FILTER_ANY,
  DRIVER_LINK_STATUS_FILTER_CLOSED,
];

/** Số khung chờ — đúng một hàng đầy của lưới 4 cột. */
const SKELETON_COUNT = 4;
const CARD_MONTH_FORMAT = 'MM/YYYY';
/** Tham số của danh sách nội bộ RIÊNG trước 25/11/2026 — link cũ thành lọc "Hình thức = nội bộ". */
const LEGACY_VIEW_INTERNAL = 'internal';

/** Ô của dải số đếm — mỗi ô là một lối lọc nhanh ghi CÙNG tham số với ô "Trạng thái". */
const SUMMARY_CHIP = {
  ALL: 'all',
  ACTIVE: 'active',
  INVITED: 'invited',
  LICENCE_CHECK: 'licenceCheck',
  SUSPENDED: 'suspended',
  CLOSED: 'closed',
} as const;
type SummaryChip = (typeof SUMMARY_CHIP)[keyof typeof SUMMARY_CHIP];

const CHIP_FILTER: Readonly<Record<SummaryChip, Pick<DriverFilters, 'linkStatus' | 'licenceCheck'>>> =
  {
    [SUMMARY_CHIP.ALL]: { linkStatus: undefined, licenceCheck: undefined },
    [SUMMARY_CHIP.ACTIVE]: { linkStatus: DRIVER_LINK_STATUS.ACTIVE, licenceCheck: undefined },
    [SUMMARY_CHIP.INVITED]: { linkStatus: DRIVER_LINK_STATUS.INVITED, licenceCheck: undefined },
    [SUMMARY_CHIP.LICENCE_CHECK]: {
      linkStatus: undefined,
      licenceCheck: DRIVER_LICENCE_CHECK_FILTER,
    },
    [SUMMARY_CHIP.SUSPENDED]: { linkStatus: DRIVER_LINK_STATUS.SUSPENDED, licenceCheck: undefined },
    [SUMMARY_CHIP.CLOSED]: {
      linkStatus: DRIVER_LINK_STATUS_FILTER_CLOSED,
      licenceCheck: undefined,
    },
  };

function activeChip(filters: DriverFilters): SummaryChip | null {
  if (filters.licenceCheck) return SUMMARY_CHIP.LICENCE_CHECK;
  switch (filters.linkStatus) {
    case undefined:
      return SUMMARY_CHIP.ALL;
    case DRIVER_LINK_STATUS.ACTIVE:
      return SUMMARY_CHIP.ACTIVE;
    case DRIVER_LINK_STATUS.INVITED:
      return SUMMARY_CHIP.INVITED;
    case DRIVER_LINK_STATUS.SUSPENDED:
      return SUMMARY_CHIP.SUSPENDED;
    case DRIVER_LINK_STATUS_FILTER_CLOSED:
      return SUMMARY_CHIP.CLOSED;
    default:
      return null;
  }
}

function parseFilters(params: URLSearchParams): DriverFilters {
  const linkStatus = params.get('linkStatus') ?? '';
  const legacyInternal = params.get('view') === LEGACY_VIEW_INTERNAL;
  const driverType = legacyInternal ? DRIVER_TYPE_FILTER_INTERNAL : (params.get('driverType') ?? '');
  const operation = params.get('operation') ?? '';
  const sort = params.get('sort') ?? '';
  const page = Number(params.get('page'));
  return {
    q: params.get('q') ?? undefined,
    linkStatus: LINK_STATUS_FILTERS.includes(linkStatus) ? linkStatus : undefined,
    licenceCheck:
      params.get('licenceCheck') === DRIVER_LICENCE_CHECK_FILTER
        ? DRIVER_LICENCE_CHECK_FILTER
        : undefined,
    driverType: DRIVER_ROSTER_TYPE_FILTER_VALUES.includes(driverType) ? driverType : undefined,
    operation: (DRIVER_OPERATION_FILTER_VALUES as string[]).includes(operation)
      ? operation
      : undefined,
    sort: (DRIVER_LIST_SORT_VALUES as string[]).includes(sort) ? sort : undefined,
    month: DRIVER_MONTH_PATTERN.test(params.get('month') ?? '')
      ? (params.get('month') as string)
      : undefined,
    page: page > 1 ? page : undefined,
    limit: Number(params.get('limit')) || undefined,
  };
}

/**
 * Quản lý tài xế — Figma Partner-XePrime `23737:41945` (cập nhật 25/11/2026). MỘT lưới cho cả tài xế
 * LIÊN KẾT (tài khoản khách, ADR 0063) và tài xế NỘI BỘ (danh bạ không tài khoản, ADR 0108); một nút
 * "Thêm tài xế mới" mở hộp hai tab. Mở cho cả gian hàng tuyến gói lẫn chủ xe tuyến hoa hồng.
 *
 * Bộ lọc, sắp xếp, trang và tháng thống kê sống trên URL (ADR 0004); danh sách gộp phân trang ở
 * server (`GET /drivers/roster`). Chi tiết một tài xế là trang riêng (`driverPath`) — link cũ
 * `?open=<id>&tab=` được chuyển tiếp tới đó.
 */
export function DriversPage() {
  const t = useTranslations('Drivers.page');
  // `useUrlFilters` đọc `useSearchParams` — Next bắt buộc một ranh giới Suspense.
  return (
    <Suspense fallback={<Skeleton active aria-label={t('loading')} />}>
      <DriversPageInner />
    </Suspense>
  );
}

function DriversPageInner() {
  const t = useTranslations('Drivers');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const { has } = usePermissions();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const availableHref = useAvailableHref();

  const { filters, setFilters } = useUrlFilters(parseFilters);
  const [addOpen, setAddOpen] = useState(false);
  // "Mời lại" mở cùng hộp thêm, chỉ tab mời, điền sẵn từ thẻ cũ.
  const [reinviteFrom, setReinviteFrom] = useState<InviteDriverFormValues | null>(null);

  const canView = has(PERMISSION.DRIVER_VIEW);
  const canManage = has(PERMISSION.DRIVER_MANAGE);

  // Link cũ của ngăn chi tiết (`?open=<id>&tab=`) — chuyển tới trang chi tiết thật.
  const legacyOpen = searchParams.get('open');
  const legacyTab = searchParams.get('tab');
  useEffect(() => {
    if (!legacyOpen) return;
    const tab = (DRIVER_DETAIL_TABS as readonly string[]).includes(legacyTab ?? '')
      ? (legacyTab as string)
      : undefined;
    const target = availableHref(driverPath.detail(legacyOpen, tab));
    if (target) router.replace(target);
  }, [legacyOpen, legacyTab, availableHref, router]);

  const roster = useDriverRoster(filters, canView && !legacyOpen);
  const summary = useDriverRosterSummary(filters, canView && !legacyOpen);
  const suspend = useSuspendDriver();
  const resume = useResumeDriver();
  const end = useEndDriver();
  const licenceCheck = useSetDriverLicenceChecked();
  const archive = useArchiveInternalDriver();
  const restore = useRestoreInternalDriver();

  const items = roster.data?.items ?? [];
  const meta = roster.data?.meta ?? {
    page: 1,
    limit: DRIVERS_DEFAULT_LIMIT,
    total: 0,
    hasNext: false,
  };
  // "11/2026" — dạng số, đọc như nhau ở hai ngôn ngữ; bản chữ ("Tháng 11 năm 2026") làm dòng thẻ quá dài.
  const monthLabel = (
    filters.month ? dayjs(filters.month, DRIVER_MONTH_FORMAT) : nowInAppTz()
  ).format(CARD_MONTH_FORMAT);
  const hasFilters = Boolean(
    filters.q || filters.driverType || filters.operation || filters.linkStatus || filters.licenceCheck,
  );

  const changeMonth = (month: string) => setFilters({ month }, { resetPage: false });
  const clearFilters = () =>
    setFilters({
      q: undefined,
      driverType: undefined,
      operation: undefined,
      linkStatus: undefined,
      licenceCheck: undefined,
      view: undefined,
    } as Record<string, undefined>);

  const feedback = (successKey: ToastKey) => ({
    onSuccess: () => message.success(t(successKey)),
    onError: (err: unknown) => message.error(errorMessage(err)),
  });

  const reinvite = (row: Driver) => {
    setReinviteFrom({
      phone: row.phone,
      name: row.name,
      driverType: row.driverType,
      note: row.note ?? '',
    });
    setAddOpen(true);
  };

  // Thiếu quyền xem → thay TOÀN BỘ nội dung; chặn thật là guard backend.
  if (!canView) {
    return <PermissionState kind="forbidden" missingPermissions={[PERMISSION.DRIVER_VIEW]} />;
  }

  const filterFields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('filters.search'),
      placeholder: t('filters.searchPlaceholder'),
    },
    {
      kind: 'select',
      key: 'driverType',
      label: t('filters.type'),
      options: [
        { value: ALL_FILTER, label: t('filters.allTypes') },
        ...DRIVER_TYPE_VALUES.map((value) => ({ value, label: domainLabel('driverType', value) })),
        { value: DRIVER_TYPE_FILTER_INTERNAL, label: t('roster.typeInternal') },
      ],
    },
    {
      kind: 'select',
      key: 'operation',
      label: t('filters.operation'),
      options: [
        { value: ALL_FILTER, label: t('filters.allOperations') },
        { value: DRIVER_OPERATION_FILTER.ON_TRIP, label: t('filters.onTrip') },
        { value: DRIVER_OPERATION_FILTER.IDLE, label: t('filters.idle') },
      ],
    },
    {
      kind: 'select',
      key: 'linkStatus',
      label: t('filters.status'),
      // Không tham số = liên kết CÒN MỞ + nội bộ đang dùng (mặc định của server) — `all` chỉ là
      // "xoá tham số"; `any` = mọi trạng thái; `closed` = đã đóng + nội bộ đã lưu trữ.
      options: [
        { value: ALL_FILTER, label: t('filters.openLinks') },
        { value: DRIVER_LINK_STATUS_FILTER_ANY, label: t('filters.allStatuses') },
        ...DRIVER_LINK_STATUS_VALUES.map((value) => ({
          value,
          label: domainLabel('driverLinkStatus', value),
        })),
        { value: DRIVER_LINK_STATUS_FILTER_CLOSED, label: t('filters.closed') },
      ],
      allowClear: false,
    },
  ];

  const summaryItems: SummaryStripItem[] = [
    {
      key: SUMMARY_CHIP.ALL,
      icon: UserOutlined,
      tone: 'neutral',
      value: summary.data?.open ?? 0,
      label: t('summary.all'),
    },
    {
      key: SUMMARY_CHIP.ACTIVE,
      icon: LinkOutlined,
      tone: 'info',
      value: summary.data?.active ?? 0,
      label: t('summary.active'),
    },
    {
      key: SUMMARY_CHIP.INVITED,
      icon: UserSwitchOutlined,
      tone: 'purple',
      value: summary.data?.invited ?? 0,
      label: t('summary.invited'),
    },
    {
      key: SUMMARY_CHIP.LICENCE_CHECK,
      icon: ExclamationCircleOutlined,
      tone: 'warning',
      value: summary.data?.licenceCheck ?? 0,
      label: t('summary.licenceCheck'),
    },
    {
      key: SUMMARY_CHIP.SUSPENDED,
      icon: LockOutlined,
      tone: 'danger',
      value: summary.data?.suspended ?? 0,
      label: t('summary.suspended'),
    },
    {
      key: SUMMARY_CHIP.CLOSED,
      icon: CloseOutlined,
      tone: 'danger',
      value: summary.data?.closed ?? 0,
      label: t('summary.closed'),
    },
  ];

  /** Menu "…" của thẻ liên kết — Figma: Thu hồi lời mời / Ngừng hợp tác / Tạm khoá (+ Mở khoá). */
  const linkedMenu = (row: Driver): RowAction[] => {
    const open = DRIVER_LINK_OPEN_STATUSES.includes(row.linkStatus as DriverLinkStatus);
    const invited = row.linkStatus === DRIVER_LINK_STATUS.INVITED;
    // Tên trên bằng lệch tên đã đặt, chưa ai đối chiếu ⇒ cho đánh dấu ngay từ thẻ.
    const needsCheck =
      row.licence.state === DRIVER_LICENCE_STATE.VERIFIED &&
      !row.licenceCheck &&
      holderNameDiffers(row.licence.fullName, row.name);
    return [
      {
        key: 'licenceCheck',
        label: t('licenceCheck.menu'),
        icon: <CheckOutlined />,
        hidden: !canManage || !open || !needsCheck,
        loading: licenceCheck.isPending && licenceCheck.variables?.id === row.id,
        onClick: () =>
          licenceCheck.mutate({ id: row.id, checked: true }, feedback('toast.licenceChecked')),
      },
      {
        key: 'end',
        label: invited ? t('actions.revoke') : t('actions.end'),
        icon: <StopOutlined />,
        danger: !invited,
        hidden: !canManage || !open,
        loading: end.isPending && end.variables === row.id,
        confirm: {
          title: invited
            ? t('actions.revokeConfirm')
            : row.activeBookingCount > 0
              ? t('actions.endConfirmWithTrips', { count: row.activeBookingCount })
              : t('actions.endConfirm'),
          okText: invited ? t('actions.revoke') : t('actions.end'),
          cancelText: tCommon('actions.close'),
        },
        onClick: () => end.mutate(row.id, feedback(invited ? 'toast.revoked' : 'toast.ended')),
      },
      {
        key: 'suspend',
        label: t('actions.suspend'),
        icon: <PauseCircleOutlined />,
        hidden: !canManage || row.linkStatus !== DRIVER_LINK_STATUS.ACTIVE,
        loading: suspend.isPending && suspend.variables === row.id,
        confirm: {
          title: t('actions.suspendConfirm'),
          okText: t('actions.suspend'),
          cancelText: tCommon('actions.close'),
        },
        onClick: () => suspend.mutate(row.id, feedback('toast.suspended')),
      },
      {
        key: 'resume',
        label: t('actions.resume'),
        icon: <PlayCircleOutlined />,
        hidden: !canManage || row.linkStatus !== DRIVER_LINK_STATUS.SUSPENDED,
        loading: resume.isPending && resume.variables === row.id,
        onClick: () => resume.mutate(row.id, feedback('toast.resumed')),
      },
    ];
  };

  /** Menu "…" của thẻ nội bộ — "Ngừng hợp tác" là LƯU TRỮ (đơn đã gán giữ nguyên người này). */
  const internalMenu = (row: InternalDriver): RowAction[] => [
    {
      key: 'archive',
      label: t('actions.end'),
      icon: <StopOutlined />,
      danger: true,
      hidden: !canManage || row.archivedAt !== null,
      loading: archive.isPending && archive.variables === row.id,
      confirm: {
        title: t('internal.actions.archiveConfirm', { name: row.name }),
        description:
          row.activeTripCount > 0
            ? t('internal.actions.archiveHasTrips', { count: row.activeTripCount })
            : undefined,
        okText: t('actions.end'),
        cancelText: tCommon('actions.close'),
      },
      onClick: () => archive.mutate(row.id, feedback('internal.toast.archived')),
    },
    {
      key: 'restore',
      label: t('internal.actions.restore'),
      icon: <RollbackOutlined />,
      hidden: !canManage || row.archivedAt === null,
      loading: restore.isPending && restore.variables === row.id,
      onClick: () => restore.mutate(row.id, feedback('internal.toast.restored')),
    },
  ];

  const addButton = canManage ? (
    <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
      {t('roster.addDriver')}
    </Button>
  ) : null;

  function renderBody() {
    if (roster.isError && !roster.data) {
      return (
        <div className={styles.state}>
          <EmptyState
            variant="error"
            title={t('page.loadError')}
            description={t('page.loadErrorHint')}
            onRetry={() => void roster.refetch()}
          />
        </div>
      );
    }
    if ((roster.isFetching || legacyOpen) && items.length === 0) {
      return (
        <div className={styles.grid} role="status" aria-busy="true" aria-label={t('page.loading')}>
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <div key={index} className={styles.skeletonCard}>
              <Skeleton active avatar paragraph={{ rows: 5 }} />
            </div>
          ))}
        </div>
      );
    }
    if (items.length === 0) {
      return (
        <div className={styles.state}>
          {hasFilters ? (
            <EmptyState
              variant="no-results"
              title={t('page.noResults')}
              description={t('page.noResultsHint')}
              action={<Button onClick={clearFilters}>{tCommon('actions.clear')}</Button>}
            />
          ) : (
            <EmptyState
              variant="empty"
              title={t('page.empty')}
              description={t('page.emptyHint')}
              action={addButton ?? undefined}
            />
          )}
        </div>
      );
    }
    return (
      <ul
        className={styles.grid}
        aria-label={t('page.gridLabel')}
        aria-busy={roster.isFetching || undefined}
      >
        {items.map((row) => {
          const internal = row.kind === DRIVER_ROSTER_KIND.INTERNAL ? row.internal : null;
          const linked = row.kind === DRIVER_ROSTER_KIND.LINKED ? row.linked : null;
          if (internal) {
            return (
              <li key={`internal-${internal.id}`} className={styles.cell}>
                <InternalDriverCard
                  driver={internal}
                  menu={internalMenu(internal)}
                  detailHref={availableHref(driverPath.internal(internal.id))}
                />
              </li>
            );
          }
          if (!linked) return null;
          return (
            <li key={`linked-${linked.id}`} className={styles.cell}>
              <DriverCard
                driver={linked}
                monthLabel={monthLabel}
                canManage={canManage}
                menu={linkedMenu(linked)}
                detailHref={availableHref(driverPath.detail(linked.id))}
                tripsHref={availableHref(driverPath.detail(linked.id, DRIVER_DETAIL_TAB.TRIPS))}
                onReinvite={() => reinvite(linked)}
              />
            </li>
          );
        })}
      </ul>
    );
  }

  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className={styles.page}>
      <ManagePageHeader
        title={t('page.heading')}
        subtitle={t('page.subtitle')}
        extra={
          <div className={styles.headerActions}>
            <DriverWageSettingsButton />
            {addButton}
          </div>
        }
      />

      <FilterBar
        fields={filterFields}
        values={{
          q: filters.q,
          driverType: filters.driverType ?? ALL_FILTER,
          operation: filters.operation ?? ALL_FILTER,
          linkStatus: filters.linkStatus ?? ALL_FILTER,
        }}
        onChange={(patch) =>
          setFilters({
            ...(patch as Partial<DriverFilters>),
            // Ô "Trạng thái" và ô "Cần đối chiếu" của dải số đếm là cùng một câu hỏi — chọn ô này
            // thì bỏ ô kia, để danh sách không âm thầm lọc giao của hai.
            ...('linkStatus' in patch ? { licenceCheck: undefined } : {}),
            // `view=internal` cũ nằm trên URL tới khi người dùng chọn lại "Hình thức".
            ...('driverType' in patch ? { view: undefined } : {}),
          } as Partial<DriverFilters>)
        }
        onClear={hasFilters ? clearFilters : undefined}
        actions={
          <div className={styles.toolbar}>
            <Select<DriverListSort>
              className={styles.sort}
              size="large"
              aria-label={t('filters.sort.label')}
              labelRender={(item) => t('filters.sort.value', { label: String(item.label) })}
              value={(filters.sort as DriverListSort | undefined) ?? DRIVER_LIST_SORT.NEWEST}
              options={[DRIVER_LIST_SORT.NEWEST, DRIVER_LIST_SORT.NAME_ASC, DRIVER_LIST_SORT.STATUS].map(
                (value) => ({ value, label: t(`filters.sort.${value}`) }),
              )}
              onChange={(value) =>
                setFilters({ sort: value === DRIVER_LIST_SORT.NEWEST ? undefined : value })
              }
            />
            <DriverMonthPicker month={filters.month} onChange={changeMonth} size="large" />
          </div>
        }
      />

      {summary.isError ? null : (
        <SummaryStrip
          items={summaryItems}
          loading={summary.isLoading}
          ariaLabel={t('summary.ariaLabel')}
          active={activeChip(filters)}
          onSelect={(key) => setFilters(CHIP_FILTER[key as SummaryChip])}
        />
      )}

      {renderBody()}

      {/* Chân danh sách chỉ có nghĩa khi đang có dữ liệu — trang rỗng không cần "Hiển thị 0-0". */}
      {items.length > 0 ? (
        <div className={styles.footer}>
          <p className={styles.showing}>
            {t('page.showing', { from, to, total: meta.total })}
          </p>
          <Pagination
            current={meta.page}
            pageSize={meta.limit}
            total={meta.total}
            size="small"
            onChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
          />
        </div>
      ) : null}

      <AddDriverModal
        open={addOpen}
        prefill={reinviteFrom}
        onClose={() => {
          setAddOpen(false);
          setReinviteFrom(null);
        }}
      />
    </div>
  );
}
