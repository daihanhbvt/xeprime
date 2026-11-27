'use client';

import { CheckOutlined, WarningFilled } from '@ant-design/icons';
import { App, Button, Popconfirm, Skeleton, Tabs } from 'antd';
import { useParams, useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DRIVER_LICENCE_STATE,
  DRIVER_LINK_OPEN_STATUSES,
  DRIVER_LINK_STATUS,
  DRIVER_LINK_STATUS_META,
  PERMISSION,
  STATUS_COLOR,
  type DriverLinkStatus,
} from '@xeprime/types';
import { holderNameDiffers } from '@xeprime/domain';
import { StatusBadge } from '@/components/data-display/StatusBadge';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { useRegisterPageTitle } from '@/components/layout/page-title-context';
import { ROUTES } from '@/constants/routes';
import { useAvailableHref } from '@/features/tenant-support/support-session';
import { usePermissions } from '@/hooks/use-permissions';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { isNotFoundError } from '@/lib/http-status';
import {
  useDriverAssignments,
  useDriverOverview,
  useEndDriver,
  useResumeDriver,
  useSetDriverLicenceChecked,
  useSuspendDriver,
} from '../hooks/use-drivers';
import type { InviteDriverFormValues } from '../schema';
import {
  DRIVER_DETAIL_TAB,
  DRIVER_DETAIL_TABS,
  type Driver,
  type DriverDetailTab,
  type DriverTripFilters,
} from '../types';
import { AddDriverModal } from './AddDriverModal';
import { DriverNoteCard, DriverProfileCard } from './DriverDetailParts';
import { DriverMonthNav } from './DriverMonthNav';
import { DRIVER_MONTH_PATTERN } from './DriverMonthPicker';
import { DriverOverviewTab } from './DriverOverviewTab';
import { DriverTripsTab } from './DriverTripsTab';
import { EditDriverModal } from './EditDriverModal';
import styles from './DriverDetail.module.css';

interface DetailFilters extends DriverTripFilters {
  tab?: DriverDetailTab;
}

function parseFilters(params: URLSearchParams): DetailFilters {
  const tab = params.get('tab') ?? '';
  const page = Number(params.get('page'));
  return {
    tab: (DRIVER_DETAIL_TABS as readonly string[]).includes(tab)
      ? (tab as DriverDetailTab)
      : undefined,
    month: DRIVER_MONTH_PATTERN.test(params.get('month') ?? '')
      ? (params.get('month') as string)
      : undefined,
    q: params.get('q') ?? undefined,
    status: params.get('status') ?? undefined,
    page: page > 1 ? page : undefined,
    limit: Number(params.get('limit')) || undefined,
  };
}

/**
 * Trang chi tiết MỘT tài xế liên kết — Figma `24042:71009` (Tổng quan) · `24051:80844` (Chuyến &
 * tiền công), thay ngăn kéo `?open=` của danh sách (25/11/2026).
 *
 * Cột trái: hồ sơ (tên, SĐT, trạng thái liên kết, hình thức, Chỉnh sửa · Gọi · Zalo, tên tài khoản,
 * chuyến đang gán, liên kết từ), bằng lái (chỉ phần chữ — ADR 0063), ghi chú nội bộ, "Huỷ liên
 * kết". Cột phải: hai tab + tháng. Tab, tháng, tìm kiếm, trạng thái và trang sống trên URL.
 */
export function DriverDetailPage() {
  const t = useTranslations('Drivers.detailPage');
  return (
    <Suspense fallback={<Skeleton active aria-label={t('loading')} />}>
      <DriverDetailInner />
    </Suspense>
  );
}

function DriverDetailInner() {
  const t = useTranslations('Drivers');
  const tPage = useTranslations('Drivers.detailPage');
  const tCommon = useTranslations('Common');
  const params = useParams<{ id: string }>();
  const id = params?.id ?? null;
  const router = useRouter();
  const availableHref = useAvailableHref();
  const { message } = App.useApp();
  const { has } = usePermissions();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { filters, setFilters } = useUrlFilters(parseFilters);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [reinviteFrom, setReinviteFrom] = useState<InviteDriverFormValues | null>(null);

  useRegisterPageTitle(tPage('pageTitle'));

  const canView = has(PERMISSION.DRIVER_VIEW);
  const canManage = has(PERMISSION.DRIVER_MANAGE);
  const query = useDriverOverview(canView ? id : null, filters.month);
  // Số trên tab "Chuyến & tiền công" — cùng tháng, không theo bộ lọc của bảng.
  const tripsCount = useDriverAssignments(canView ? id : null, {
    month: query.data?.month.month ?? filters.month,
    page: 1,
  });
  const suspend = useSuspendDriver();
  const resume = useResumeDriver();
  const end = useEndDriver();

  if (!canView) {
    return <PermissionState kind="forbidden" missingPermissions={[PERMISSION.DRIVER_VIEW]} />;
  }

  const data = query.data && query.data.driver.id === id ? query.data : undefined;
  if (!data) {
    if (query.isError) {
      const notFound = isNotFoundError(query.error);
      const listHref = availableHref(ROUTES.MANAGE.DRIVERS);
      return (
        <div className={styles.state}>
          <EmptyState
            variant="error"
            title={notFound ? tPage('notFound') : tPage('loadError')}
            onRetry={notFound ? undefined : () => void query.refetch()}
            action={
              notFound && listHref ? (
                <Button onClick={() => router.push(listHref)}>{tPage('backToList')}</Button>
              ) : undefined
            }
          />
        </div>
      );
    }
    return <Skeleton active avatar paragraph={{ rows: 8 }} aria-label={tPage('loading')} />;
  }

  const driver = data.driver;
  const open = DRIVER_LINK_OPEN_STATUSES.includes(driver.linkStatus as DriverLinkStatus);
  const invited = driver.linkStatus === DRIVER_LINK_STATUS.INVITED;
  const canReinvite = canManage && !open && !driver.currentOpenLinkStatus;
  const tab = filters.tab ?? DRIVER_DETAIL_TAB.OVERVIEW;
  const feedback = (key: 'toast.suspended' | 'toast.resumed' | 'toast.ended' | 'toast.revoked') => ({
    onSuccess: () => message.success(t(key)),
    onError: (err: unknown) => message.error(errorMessage(err)),
  });

  const accountName = driver.account.displayName || null;
  const facts = [
    ...(accountName
      ? [{ key: 'account', label: tPage('profile.account'), value: accountName }]
      : []),
    {
      key: 'trips',
      label: tPage('profile.activeTrips'),
      value: fmt.count(driver.activeBookingCount),
    },
    driver.respondedAt && driver.linkStatus !== DRIVER_LINK_STATUS.DECLINED
      ? {
          key: 'since',
          label: tPage('profile.linkedSince'),
          value: fmt.date(driver.respondedAt),
        }
      : { key: 'invited', label: tPage('profile.invitedAt'), value: fmt.date(driver.invitedAt) },
    ...(driver.endedAt
      ? [{ key: 'ended', label: tPage('profile.endedAt'), value: fmt.date(driver.endedAt) }]
      : []),
  ];

  return (
    <div className={styles.layout}>
      <aside className={styles.aside}>
        <DriverProfileCard
          name={driver.name}
          phone={driver.phone}
          photoUrl={driver.account.avatarUrl}
          onEdit={open && canManage ? () => setEditing(driver) : undefined}
          chips={
            <>
              <StatusBadge
                value={driver.linkStatus as DriverLinkStatus}
                meta={DRIVER_LINK_STATUS_META}
                group="driverLinkStatus"
                tone={driver.linkStatus === DRIVER_LINK_STATUS.SUSPENDED ? STATUS_COLOR.DANGER : undefined}
                className={styles.statusChip}
              />
              <span className={styles.typeChip}>
                {domainLabel('driverType', driver.driverType, driver.driverType)}
              </span>
            </>
          }
          facts={facts}
        />

        <LicenceCard driver={driver} canManage={canManage && open} />

        <DriverNoteCard
          note={driver.note}
          onEdit={open && canManage ? () => setEditing(driver) : undefined}
        />

        {canManage ? (
          <div className={styles.asideFooter}>
            {open ? (
              <Popconfirm
                title={
                  invited
                    ? t('actions.revokeConfirm')
                    : driver.activeBookingCount > 0
                      ? t('actions.endConfirmWithTrips', { count: driver.activeBookingCount })
                      : t('actions.endConfirm')
                }
                okText={invited ? t('actions.revoke') : tPage('unlink')}
                okButtonProps={{ danger: true }}
                cancelText={tCommon('actions.close')}
                onConfirm={() =>
                  end.mutate(driver.id, feedback(invited ? 'toast.revoked' : 'toast.ended'))
                }
              >
                <Button type="text" danger className={styles.textAction} loading={end.isPending}>
                  {invited ? t('actions.revoke') : tPage('unlink')}
                </Button>
              </Popconfirm>
            ) : null}
            {driver.linkStatus === DRIVER_LINK_STATUS.ACTIVE ? (
              <Popconfirm
                title={t('actions.suspendConfirm')}
                okText={t('actions.suspend')}
                cancelText={tCommon('actions.close')}
                onConfirm={() => suspend.mutate(driver.id, feedback('toast.suspended'))}
              >
                <Button type="text" className={styles.textAction} loading={suspend.isPending}>
                  {t('actions.suspend')}
                </Button>
              </Popconfirm>
            ) : null}
            {driver.linkStatus === DRIVER_LINK_STATUS.SUSPENDED ? (
              <Button
                type="text"
                className={styles.textAction}
                loading={resume.isPending}
                onClick={() => resume.mutate(driver.id, feedback('toast.resumed'))}
              >
                {t('actions.resume')}
              </Button>
            ) : null}
            {canReinvite ? (
              <Button
                type="primary"
                onClick={() =>
                  setReinviteFrom({
                    phone: driver.phone,
                    name: driver.name,
                    driverType: driver.driverType,
                    note: driver.note ?? '',
                  })
                }
              >
                {t('actions.reinvite')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </aside>

      <main className={styles.main}>
        <div className={styles.topBar}>
          <Tabs
            className={styles.tabs}
            activeKey={tab}
            onChange={(key) =>
              setFilters(
                {
                  tab: key === DRIVER_DETAIL_TAB.OVERVIEW ? undefined : (key as DriverDetailTab),
                  q: undefined,
                  status: undefined,
                  page: undefined,
                },
                { resetPage: false },
              )
            }
            items={[
              { key: DRIVER_DETAIL_TAB.OVERVIEW, label: t('detail.tabs.overview') },
              {
                key: DRIVER_DETAIL_TAB.TRIPS,
                label: (
                  <>
                    {t('detail.tabs.trips')}
                    {tripsCount.data ? (
                      <span className={styles.tabCount}>{fmt.count(tripsCount.data.meta.total)}</span>
                    ) : null}
                  </>
                ),
              },
            ]}
          />
          <DriverMonthNav
            month={data.month.month}
            onChange={(month) => setFilters({ month, page: undefined }, { resetPage: false })}
          />
        </div>

        {tab === DRIVER_DETAIL_TAB.TRIPS ? (
          <DriverTripsTab
            driverId={driver.id}
            driverPhone={driver.phone}
            month={data.month.month}
            wageTotal={data.month.wageTotal}
            filters={filters}
            onFilters={(patch) => setFilters(patch, { resetPage: false })}
          />
        ) : (
          <DriverOverviewTab overview={data} />
        )}
      </main>

      <EditDriverModal driver={editing} onClose={() => setEditing(null)} />
      <AddDriverModal
        open={reinviteFrom !== null}
        prefill={reinviteFrom}
        onClose={() => setReinviteFrom(null)}
      />
    </div>
  );
}

/** Thẻ "Bằng lái" (Figma): trạng thái + Hạng · Hạn đến · Tên trên bằng · Loại — không ảnh, không số bằng. */
function LicenceCard({ driver, canManage }: { driver: Driver; canManage: boolean }) {
  const t = useTranslations('Drivers');
  const tPage = useTranslations('Drivers.detailPage.licence');
  const tCheck = useTranslations('Drivers.licenceCheck');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const setChecked = useSetDriverLicenceChecked();
  const licence = driver.licence;
  const verified = licence.state === DRIVER_LICENCE_STATE.VERIFIED;
  const nameDiffers = verified && holderNameDiffers(licence.fullName, driver.name);
  const check = driver.licenceCheck ?? null;
  const mismatch = nameDiffers && !check;
  const toggle = (checked: boolean) =>
    setChecked.mutate(
      { id: driver.id, checked },
      {
        onSuccess: () =>
          message.success(checked ? t('toast.licenceChecked') : t('toast.licenceUnchecked')),
        onError: (err) => message.error(errorMessage(err)),
      },
    );

  const state = !verified ? (
    <span className={cx(styles.licenceState, styles.licenceNone)}>
      {licence.state === DRIVER_LICENCE_STATE.PENDING
        ? t('card.pendingTitle')
        : t('card.noneTitle')}
    </span>
  ) : mismatch ? (
    <span className={cx(styles.licenceState, styles.licenceWarn)}>
      <WarningFilled aria-hidden="true" />
      {t('card.needsCheck')}
    </span>
  ) : (
    <span className={cx(styles.licenceState, styles.licenceOk)}>
      <CheckOutlined aria-hidden="true" />
      {check ? tCheck('checked') : t('card.verified')}
    </span>
  );

  return (
    <section className={styles.card} aria-label={tPage('title')}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{tPage('title')}</h3>
        {state}
      </div>
      {verified ? (
        <dl className={styles.licenceGrid}>
          <div>
            <dt>{tPage('class')}</dt>
            <dd>{licence.classes.length > 0 ? licence.classes.join(', ') : '-'}</dd>
          </div>
          <div>
            <dt>{tPage('expiry')}</dt>
            {/* `expiresOn` là NGÀY LỊCH `YYYY-MM-DD` — `dateKey` không mượn nửa đêm theo máy. */}
            <dd>{licence.expiresOn ? fmt.dateKey(licence.expiresOn) : t('card.noExpiry')}</dd>
          </div>
          <div>
            <dt>{tPage('holder')}</dt>
            <dd className={styles.upper}>{licence.fullName ?? '-'}</dd>
          </div>
          <div>
            <dt>{tPage('kind')}</dt>
            <dd>{licence.kind ? domainLabel('driverLicenceKind', licence.kind) : '-'}</dd>
          </div>
        </dl>
      ) : (
        <p className={styles.muted}>
          {licence.state === DRIVER_LICENCE_STATE.PENDING ? t('card.pendingHint') : t('card.noneHint')}
        </p>
      )}
      {mismatch ? <p className={styles.warnText}>{t('card.nameMismatch')}</p> : null}
      {mismatch && canManage ? (
        <Button
          icon={<CheckOutlined />}
          loading={setChecked.isPending}
          onClick={() => toggle(true)}
        >
          {tCheck('mark')}
        </Button>
      ) : null}
      {/* Đã đối chiếu: ai, lúc nào — và lối gỡ khi bấm nhầm. */}
      {nameDiffers && check ? (
        <div className={styles.checkedRow}>
          <span className={styles.muted}>
            {check.checkedByName
              ? tCheck('checkedBy', { name: check.checkedByName, time: fmt.dateTime(check.checkedAt) })
              : tCheck('checkedAt', { time: fmt.dateTime(check.checkedAt) })}
          </span>
          {canManage ? (
            <Button
              type="link"
              size="small"
              loading={setChecked.isPending}
              onClick={() => toggle(false)}
            >
              {tCheck('unmark')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
