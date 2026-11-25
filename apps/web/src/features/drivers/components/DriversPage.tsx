'use client';

import {
  CloseOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
  LinkOutlined,
  LockOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  StopOutlined,
  UserOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import { App, Button, Pagination, Segmented, Select, Skeleton } from 'antd';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  DRIVER_LICENCE_CHECK_FILTER,
  DRIVER_LINK_OPEN_STATUSES,
  DRIVER_LINK_STATUS,
  DRIVER_LINK_STATUS_FILTER_ANY,
  DRIVER_LINK_STATUS_FILTER_CLOSED,
  DRIVER_LINK_STATUS_VALUES,
  DRIVER_LIST_SORT,
  DRIVER_LIST_SORT_VALUES,
  DRIVER_OPERATION_FILTER,
  DRIVER_OPERATION_FILTER_VALUES,
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
import { usePermissions } from '@/hooks/use-permissions';
import { useOpenRecordPager } from '@/hooks/use-open-record-pager';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { dayjs, nowInAppTz } from '@/lib/datetime';
import { DRIVERS_DEFAULT_LIMIT } from '../api';
import {
  useDriverSummary,
  useDrivers,
  useEndDriver,
  useResumeDriver,
  useSuspendDriver,
} from '../hooks/use-drivers';
import {
  DRIVER_DETAIL_TABS,
  DRIVERS_VIEW,
  type DriversView,
  type Driver,
  type DriverDetailTab,
  type DriverFilters,
} from '../types';
import type { InviteDriverFormValues } from '../schema';
import { DriverCard } from './DriverCard';
import { DriverDetailDrawer } from './DriverDetailDrawer';
import { DRIVER_MONTH_FORMAT, DRIVER_MONTH_PATTERN, DriverMonthPicker } from './DriverMonthPicker';
import { DriverWageSettingsButton } from './DriverWageSettingsButton';
import { EditDriverModal } from './EditDriverModal';
import { InternalDriversView } from './InternalDriversView';
import { InviteDriverModal } from './InviteDriverModal';
import styles from './DriversPage.module.css';

type ToastKey = 'toast.suspended' | 'toast.resumed' | 'toast.ended' | 'toast.revoked';

const LINK_STATUS_FILTERS: readonly string[] = [
  ...DRIVER_LINK_STATUS_VALUES,
  DRIVER_LINK_STATUS_FILTER_ANY,
  DRIVER_LINK_STATUS_FILTER_CLOSED,
];

/** Số khung chờ — đúng một hàng đầy của lưới 4 cột. */
const SKELETON_COUNT = 4;
const CARD_MONTH_FORMAT = 'MM/YYYY';

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
  const driverType = params.get('driverType') ?? '';
  const operation = params.get('operation') ?? '';
  const sort = params.get('sort') ?? '';
  const page = Number(params.get('page'));
  const tab = params.get('tab');
  return {
    q: params.get('q') ?? undefined,
    linkStatus: LINK_STATUS_FILTERS.includes(linkStatus) ? linkStatus : undefined,
    licenceCheck:
      params.get('licenceCheck') === DRIVER_LICENCE_CHECK_FILTER
        ? DRIVER_LICENCE_CHECK_FILTER
        : undefined,
    driverType: (DRIVER_TYPE_VALUES as string[]).includes(driverType) ? driverType : undefined,
    operation: (DRIVER_OPERATION_FILTER_VALUES as string[]).includes(operation)
      ? operation
      : undefined,
    sort: (DRIVER_LIST_SORT_VALUES as string[]).includes(sort) ? sort : undefined,
    month: DRIVER_MONTH_PATTERN.test(params.get('month') ?? '')
      ? (params.get('month') as string)
      : undefined,
    open: params.get('open') || undefined,
    tab: (DRIVER_DETAIL_TABS as readonly string[]).includes(tab ?? '')
      ? (tab as DriverDetailTab)
      : undefined,
    page: page > 1 ? page : undefined,
    limit: Number(params.get('limit')) || undefined,
  };
}

/**
 * Quản lý tài xế — Figma Partner-XePrime `23737:41945` (04/11/2026). Mỗi thẻ là một LIÊN KẾT với
 * một tài khoản khách (ADR 0063): mời bằng SĐT, tài xế đồng ý ở site khách. Mở cho cả gian hàng
 * tuyến gói lẫn chủ xe tuyến hoa hồng, không sau cờ gói. Bên thuê chỉ thấy TRẠNG THÁI và phần chữ
 * của bằng lái — không ảnh, không số bằng.
 *
 * Bộ lọc, sắp xếp, trang, tài xế đang mở và tháng thống kê tiền công sống trên URL (ADR 0004).
 * Dải số đếm là lối lọc nhanh của CÙNG tham số `linkStatus` / `licenceCheck` với ô "Trạng thái".
 */
export function DriversPage() {
  const t = useTranslations('Drivers.page');
  // `useUrlFilters` đọc `useSearchParams` — Next bắt buộc một ranh giới Suspense.
  return (
    <Suspense fallback={<Skeleton active aria-label={t('loading')} />}>
      <DriversViews />
    </Suspense>
  );
}

/**
 * Hai danh sách của màn Tài xế: tài xế LIÊN KẾT (tài khoản khách, ADR 0063) và danh bạ tài xế NỘI BỘ
 * (không tài khoản, ADR 0108). Danh sách đang xem sống trên URL (`view`); đổi danh sách bỏ tìm kiếm
 * và trang của danh sách kia — hai bộ lọc không cùng nghĩa.
 */
function DriversViews() {
  const t = useTranslations('Drivers.internal');
  const searchParams = useSearchParams();
  const { setFilters } = useUrlFilters((params) => ({ view: params.get('view') ?? undefined }));
  const view: DriversView =
    searchParams.get('view') === DRIVERS_VIEW.INTERNAL ? DRIVERS_VIEW.INTERNAL : DRIVERS_VIEW.LINKED;

  const viewSwitch = (
    <Segmented<DriversView>
      size="large"
      value={view}
      aria-label={t('viewLabel')}
      options={[
        { value: DRIVERS_VIEW.LINKED, label: t('views.linked') },
        { value: DRIVERS_VIEW.INTERNAL, label: t('views.internal') },
      ]}
      onChange={(next) =>
        setFilters({
          view: next === DRIVERS_VIEW.INTERNAL ? next : undefined,
          q: undefined,
          page: undefined,
          limit: undefined,
          archived: undefined,
          linkStatus: undefined,
          licenceCheck: undefined,
          driverType: undefined,
          operation: undefined,
          open: undefined,
          tab: undefined,
        } as Record<string, undefined | string>)
      }
    />
  );

  return view === DRIVERS_VIEW.INTERNAL ? (
    <InternalDriversView viewSwitch={viewSwitch} />
  ) : (
    <DriversPageInner viewSwitch={viewSwitch} />
  );
}

function DriversPageInner({ viewSwitch }: { viewSwitch: ReactNode }) {
  const t = useTranslations('Drivers');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const { has } = usePermissions();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();

  const { filters, setFilters } = useUrlFilters(parseFilters);
  const [inviteOpen, setInviteOpen] = useState(false);
  // "Mời lại" mở cùng modal mời, điền sẵn từ thẻ cũ.
  const [reinviteFrom, setReinviteFrom] = useState<InviteDriverFormValues | null>(null);
  const [editing, setEditing] = useState<Driver | null>(null);

  const canView = has(PERMISSION.DRIVER_VIEW);
  const canManage = has(PERMISSION.DRIVER_MANAGE);
  const { data, isError, refetch, isFetching } = useDrivers(filters);
  const summary = useDriverSummary(filters);
  const suspend = useSuspendDriver();
  const resume = useResumeDriver();
  const end = useEndDriver();

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: DRIVERS_DEFAULT_LIMIT, total: 0, hasNext: false };
  // "11/2026" — dạng số, đọc như nhau ở hai ngôn ngữ; bản chữ ("Tháng 11 năm 2026") làm dòng thẻ quá dài.
  const monthLabel = (
    filters.month ? dayjs(filters.month, DRIVER_MONTH_FORMAT) : nowInAppTz()
  ).format(CARD_MONTH_FORMAT);
  const hasFilters = Boolean(
    filters.q || filters.driverType || filters.operation || filters.linkStatus || filters.licenceCheck,
  );

  // Ngăn chi tiết: tài xế + tab sống trên URL; mở/đóng chỉ đổi giao diện, giữ nguyên trang.
  const pager = useOpenRecordPager(
    items.map((row) => row.id),
    filters.open,
  );
  const openDetail = (id: string | undefined, tab?: DriverDetailTab) => {
    if (id) pager.remember();
    setFilters({ open: id, tab: id ? tab : undefined }, { resetPage: false });
  };
  const changeMonth = (month: string) => setFilters({ month }, { resetPage: false });
  const clearFilters = () =>
    setFilters({
      q: undefined,
      driverType: undefined,
      operation: undefined,
      linkStatus: undefined,
      licenceCheck: undefined,
    });

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
    setInviteOpen(true);
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
      // Không tham số = các liên kết CÒN MỞ (mặc định của server) — `all` chỉ là "xoá tham số";
      // `any` = mọi trạng thái; `closed` = hai trạng thái lịch sử.
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

  const menuFor = (row: Driver): RowAction[] => {
    const open = DRIVER_LINK_OPEN_STATUSES.includes(row.linkStatus as DriverLinkStatus);
    const invited = row.linkStatus === DRIVER_LINK_STATUS.INVITED;
    return [
      {
        key: 'view',
        label: t('actions.view'),
        icon: <EyeOutlined />,
        onClick: () => openDetail(row.id),
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
      {
        key: 'end',
        label: invited ? t('actions.revoke') : t('actions.end'),
        icon: <StopOutlined />,
        danger: true,
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
    ];
  };

  const inviteButton = canManage ? (
    <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setInviteOpen(true)}>
      {t('actions.invite')}
    </Button>
  ) : null;

  function renderBody() {
    if (isError && !data) {
      return (
        <div className={styles.state}>
          <EmptyState
            variant="error"
            title={t('page.loadError')}
            description={t('page.loadErrorHint')}
            onRetry={() => void refetch()}
          />
        </div>
      );
    }
    if (isFetching && items.length === 0) {
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
              action={inviteButton ?? undefined}
            />
          )}
        </div>
      );
    }
    return (
      <ul className={styles.grid} aria-label={t('page.gridLabel')} aria-busy={isFetching || undefined}>
        {items.map((row) => (
          <li key={row.id} className={styles.cell}>
            <DriverCard
              driver={row}
              monthLabel={monthLabel}
              canManage={canManage}
              menu={menuFor(row)}
              onOpen={(tab) => openDetail(row.id, tab)}
              onEdit={() => setEditing(row)}
              onReinvite={() => reinvite(row)}
            />
          </li>
        ))}
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
            {inviteButton}
          </div>
        }
      />
      {viewSwitch}

      <FilterBar
        fields={filterFields}
        values={{
          q: filters.q,
          driverType: filters.driverType ?? ALL_FILTER,
          operation: filters.operation ?? ALL_FILTER,
          linkStatus: filters.linkStatus ?? ALL_FILTER,
        }}
        onChange={(patch) =>
          setFilters(
            // Ô "Trạng thái" và ô "Cần đối chiếu" của dải số đếm là cùng một câu hỏi — chọn ô này
            // thì bỏ ô kia, để danh sách không âm thầm lọc giao của hai.
            'linkStatus' in patch
              ? { ...(patch as Partial<DriverFilters>), licenceCheck: undefined }
              : (patch as Partial<DriverFilters>),
          )
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

      <InviteDriverModal
        open={inviteOpen}
        prefill={reinviteFrom}
        onClose={() => {
          setInviteOpen(false);
          setReinviteFrom(null);
        }}
      />
      <EditDriverModal driver={editing} onClose={() => setEditing(null)} />
      <DriverDetailDrawer
        driverId={filters.open ?? null}
        month={filters.month}
        tab={filters.tab}
        previousId={pager.previousId}
        nextId={pager.nextId}
        onNavigate={(id) => openDetail(id, filters.tab)}
        onTabChange={(tab) => setFilters({ tab }, { resetPage: false })}
        onMonthChange={changeMonth}
        onEdit={setEditing}
        onClose={() => openDetail(undefined)}
      />
    </div>
  );
}
