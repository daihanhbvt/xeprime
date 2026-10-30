'use client';

import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { App, Button, Tag } from 'antd';
import { Suspense, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DRIVER_LINK_OPEN_STATUSES,
  DRIVER_LINK_END_PARTY,
  DRIVER_LINK_STATUS,
  DRIVER_LINK_STATUS_FILTER_ANY,
  DRIVER_LINK_STATUS_VALUES,
  DRIVER_TYPE_VALUES,
  PERMISSION,
  isDriverLinkStatus,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { ToneBadge } from '@/components/data-display/ToneBadge';
import { driverLinkTone } from '@xeprime/domain';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { usePermissions } from '@/hooks/use-permissions';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useOpenRecordPager } from '@/hooks/use-open-record-pager';
import { DRIVERS_DEFAULT_LIMIT } from '../api';
import { useDrivers, useEndDriver, useResumeDriver, useSuspendDriver } from '../hooks/use-drivers';
import {
  DRIVER_DETAIL_TAB,
  DRIVER_DETAIL_TABS,
  type Driver,
  type DriverDetailTab,
  type DriverFilters,
} from '../types';
import { DriverDetailDrawer } from './DriverDetailDrawer';
import { DRIVER_MONTH_PATTERN, DriverMonthPicker } from './DriverMonthPicker';
import { DriverLicenceStateTag } from './DriverLicenceStateTag';
import { DriverWageSettingsCard } from './DriverWageSettingsCard';
import { EditDriverModal } from './EditDriverModal';
import { InviteDriverModal } from './InviteDriverModal';
import type { InviteDriverFormValues } from '../schema';
import styles from './DriversPage.module.css';

const MIN_TABLE_WIDTH = 1180;

type ToastKey = 'toast.suspended' | 'toast.resumed' | 'toast.ended' | 'toast.revoked';

function parseFilters(params: URLSearchParams): DriverFilters {
  const linkStatus = params.get('linkStatus');
  const driverType = params.get('driverType') ?? '';
  const page = Number(params.get('page'));
  const tab = params.get('tab');
  return {
    q: params.get('q') ?? undefined,
    linkStatus:
      isDriverLinkStatus(linkStatus) || linkStatus === DRIVER_LINK_STATUS_FILTER_ANY
        ? linkStatus
        : undefined,
    driverType: (DRIVER_TYPE_VALUES as string[]).includes(driverType) ? driverType : undefined,
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
 * Tài xế của bên thuê (ADR 0063) — mỗi dòng là một LIÊN KẾT với một tài khoản khách: mời bằng
 * SĐT, tài xế đồng ý ở site khách. Mở cho cả gian hàng tuyến gói lẫn chủ xe tuyến hoa hồng, không
 * sau cờ gói. Bên thuê chỉ thấy TRẠNG THÁI bằng lái của tài xế — không ảnh, không số bằng.
 */
export function DriversPage() {
  // `useUrlFilters` đọc `useSearchParams` — Next bắt buộc một ranh giới Suspense.
  return (
    <Suspense fallback={null}>
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
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();

  // Bộ lọc + trang sống trên URL (ADR 0004).
  const { filters, setFilters } = useUrlFilters(parseFilters);
  const [inviteOpen, setInviteOpen] = useState(false);
  // "Mời lại" mở cùng modal mời, điền sẵn từ dòng cũ.
  const [reinviteFrom, setReinviteFrom] = useState<InviteDriverFormValues | null>(null);
  const [editing, setEditing] = useState<Driver | null>(null);

  const { data, isError, refetch, isFetching } = useDrivers(filters);
  const suspend = useSuspendDriver();
  const resume = useResumeDriver();
  const end = useEndDriver();

  const canManage = has(PERMISSION.DRIVER_MANAGE);

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: DRIVERS_DEFAULT_LIMIT, total: 0, hasNext: false };

  // Ngăn chi tiết: tài xế + tab sống trên URL; mở/đóng chỉ đổi giao diện, giữ nguyên trang.
  const pager = useOpenRecordPager(
    items.map((row) => row.id),
    filters.open,
  );
  const openDetail = (id: string | undefined, tab?: DriverDetailTab) => {
    if (id) pager.remember();
    setFilters({ open: id, tab: id ? tab : undefined }, { resetPage: false });
  };
  const changeMonth = (month: string) => setFilters({ month });

  const filterFields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('filters.search'),
      placeholder: t('filters.searchPlaceholder'),
    },
    {
      kind: 'select',
      key: 'linkStatus',
      label: t('filters.status'),
      // Không tham số = các liên kết CÒN MỞ (mặc định của server) — `all` chỉ là "xoá tham số";
      // `any` = mọi trạng thái, gồm cả đã từ chối / đã kết thúc.
      options: [
        { value: 'all', label: t('filters.openLinks') },
        { value: DRIVER_LINK_STATUS_FILTER_ANY, label: t('filters.allStatuses') },
        ...DRIVER_LINK_STATUS_VALUES.map((value) => ({
          value,
          label: domainLabel('driverLinkStatus', value),
        })),
      ],
      allowClear: false,
    },
    {
      kind: 'select',
      key: 'driverType',
      label: t('filters.type'),
      options: [
        { value: 'all', label: t('filters.allTypes') },
        ...DRIVER_TYPE_VALUES.map((value) => ({ value, label: domainLabel('driverType', value) })),
      ],
      allowClear: false,
    },
  ];

  const feedback = (successKey: ToastKey) => ({
    onSuccess: () => message.success(t(successKey)),
    onError: (err: unknown) => message.error(errorMessage(err)),
  });


  const inviteButton = canManage ? (
    <Button type="primary" icon={<UserAddOutlined />} onClick={() => setInviteOpen(true)}>
      {t('actions.invite')}
    </Button>
  ) : null;

  const columns: DataTableColumn<Driver>[] = [
    {
      title: t('columns.driver'),
      key: 'driver',
      width: 260,
      render: (_, row) => (
        <div>
          <Button type="link" className={styles.linkCell} onClick={() => openDetail(row.id)}>
            {row.name}
          </Button>
          <div className={styles.meta}>{row.phone}</div>
          {row.account.displayName && row.account.displayName !== row.name ? (
            <div className={styles.meta}>
              {t('columns.accountName', { name: row.account.displayName })}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: t('columns.type'),
      key: 'type',
      width: 140,
      render: (_, row) => <Tag>{domainLabel('driverType', row.driverType, row.driverType)}</Tag>,
    },
    {
      title: t('columns.licence'),
      key: 'licence',
      width: 220,
      render: (_, row) => <DriverLicenceStateTag licence={row.licence} invitedName={row.name} />,
    },
    {
      title: t('columns.activeBookings'),
      key: 'active',
      width: 130,
      render: (_, row) =>
        row.activeBookingCount > 0 ? (
          <Tag color="blue">{t('activeBookings', { count: row.activeBookingCount })}</Tag>
        ) : (
          tCommon('labels.emptyValue')
        ),
    },
    {
      // Số lần RÚT chuyến đã nhận trong 90 ngày (ADR 0074) — để bên thuê tự quyết tạm khoá.
      title: t('columns.drops'),
      key: 'drops',
      width: 170,
      render: (_, row) =>
        row.dropCount > 0 || row.autoAssignCooldownUntil ? (
          <div>
            {row.dropCount > 0 ? (
              <Tag color={row.criticalDropCount > 0 ? 'red' : 'orange'}>
                {t('drops.count', { count: row.dropCount })}
              </Tag>
            ) : null}
            {row.criticalDropCount > 0 ? (
              <div className={styles.meta}>
                {t('drops.critical', { count: row.criticalDropCount })}
              </div>
            ) : null}
            {row.autoAssignCooldownUntil ? (
              <div className={styles.meta}>
                {t('drops.cooldownUntil', { time: fmt.dateTime(row.autoAssignCooldownUntil) })}
              </div>
            ) : null}
          </div>
        ) : (
          tCommon('labels.emptyValue')
        ),
    },
    {
      // Thống kê tháng (ADR 0075): tổng tiền công đã ghi + số chuyến HOÀN THÀNH — bấm để xem từng chuyến.
      title: t('columns.monthWage'),
      key: 'monthWage',
      width: 150,
      render: (_, row) =>
        row.monthCompletedTrips > 0 || Number(row.monthWageTotal) > 0 ? (
          <div>
            <Button
              type="link"
              className={styles.linkCell}
              onClick={() => openDetail(row.id, DRIVER_DETAIL_TAB.TRIPS)}
            >
              {fmt.money(row.monthWageTotal)}
            </Button>
            <div className={styles.meta}>
              {t('wage.monthTrips', { count: row.monthCompletedTrips })}
            </div>
          </div>
        ) : (
          tCommon('labels.emptyValue')
        ),
    },
    {
      title: t('columns.status'),
      key: 'status',
      width: 170,
      render: (_, row) => (
        <div>
          {/* Cùng viên trạng thái với "Trung tâm Tài xế" ở site khách — một sắc cho một trạng thái. */}
          <ToneBadge tone={driverLinkTone(row.linkStatus)}>
            {domainLabel('driverLinkStatus', row.linkStatus)}
          </ToneBadge>
          {row.linkStatus === DRIVER_LINK_STATUS.ENDED && row.endedByParty ? (
            <div className={styles.meta}>
              {row.endedByParty === DRIVER_LINK_END_PARTY.DRIVER
                ? t('endedBy.driver')
                : t('endedBy.employer')}
            </div>
          ) : null}
          {/* Dòng cũ của một tài khoản đã có liên kết MỚI còn mở: nói rõ thay vì cho mời lần nữa. */}
          {row.currentOpenLinkStatus ? (
            <div className={styles.meta}>
              {row.currentOpenLinkStatus === DRIVER_LINK_STATUS.INVITED
                ? t('reinvite.alreadyInvited')
                : t('reinvite.alreadyLinked')}
            </div>
          ) : null}
        </div>
      ),
    },
    actionColumn<Driver>((row) => {
      const open = DRIVER_LINK_OPEN_STATUSES.includes(row.linkStatus);
      const invited = row.linkStatus === DRIVER_LINK_STATUS.INVITED;
      const closed = !open;
      return [
        {
          key: 'view',
          label: t('actions.view'),
          icon: <EyeOutlined />,
          onClick: () => openDetail(row.id),
        },
        {
          key: 'reinvite',
          label: t('actions.reinvite'),
          icon: <UserAddOutlined />,
          hidden: !canManage || !closed || Boolean(row.currentOpenLinkStatus),
          onClick: () => {
            setReinviteFrom({
              phone: row.phone,
              name: row.name,
              driverType: row.driverType,
              note: row.note ?? '',
            });
            setInviteOpen(true);
          },
        },
        {
          key: 'edit',
          label: tCommon('actions.edit'),
          icon: <EditOutlined />,
          hidden: !canManage || !open,
          onClick: () => setEditing(row),
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
          icon: <DeleteOutlined />,
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
    }),
  ];

  return (
    <div>
      <ManagePageHeader title={t('page.title')} />

      <DriverWageSettingsCard />

      <FilterBar
        fields={filterFields}
        values={{
          q: filters.q,
          linkStatus: filters.linkStatus ?? 'all',
          driverType: filters.driverType ?? 'all',
        }}
        // `onChange` gửi đúng trường vừa đổi — ghi thẳng làm patch.
        onChange={(patch) => setFilters(patch as unknown as Partial<DriverFilters>)}
        actions={
          <div className={styles.toolbar}>
            <DriverMonthPicker month={filters.month} onChange={changeMonth} />
            {inviteButton}
          </div>
        }
      />

      <DataTable<Driver>
        label={t('page.tableLabel')}
        columns={columns}
        items={items}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={
          isError && !data ? { title: t('page.loadError'), onRetry: () => void refetch() } : null
        }
        empty={{
          title: t('page.empty'),
          description: t('page.emptyHint'),
          action: inviteButton ?? undefined,
        }}
        pagination={{
          meta,
          onChange: (page, pageSize) => setFilters({ page, limit: pageSize }),
          totalLabel: (total) => t('page.total', { count: total }),
        }}
      />

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
