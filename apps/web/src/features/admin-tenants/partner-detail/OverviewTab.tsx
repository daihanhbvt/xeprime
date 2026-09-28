'use client';

import {
  AlertOutlined,
  ApartmentOutlined,
  CalendarOutlined,
  CarOutlined,
  CrownOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  PercentageOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Button, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  PARTNER_DETAIL_TAB,
  SHOP_VERIFICATION_META,
  USER_STATUS_META,
  VEHICLE_ALERT_SEVERITY,
  type PartnerDetailTab,
  type ShopVerification,
  type UserStatus,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DashboardPanel } from '@/features/dashboard/components/DashboardPanel';
import { StatCard } from '@/features/dashboard/components/StatCard';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import type { PartnerOverview } from './api';
import { usePartnerCommission } from './hooks';
import {
  KeyValues,
  MoneyValue,
  PartnerBookingTable,
  PartnerVehicleTable,
  QuotaValue,
  usePeriodLabel,
  useTabState,
} from './parts';
import styles from './PartnerDetail.module.css';

const DAY_MS = 24 * 60 * 60 * 1000;

export function ReadOnlyTag() {
  const t = useTranslations('AdminTenants.partnerDetail');
  return <Tag>{t('readOnly')}</Tag>;
}

/**
 * Tab Tổng quan — dữ liệu đã tải cùng đầu drawer (`overview`), nên tab mở tức thì. Khối nào của
 * miền mà người xem thiếu quyền thì server trả `null` và khối đó không hiện.
 */
export function OverviewTab({
  overview,
  isPackage,
  onGoTab,
}: {
  overview: PartnerOverview;
  isPackage: boolean;
  onGoTab: (tab: PartnerDetailTab) => void;
}) {
  const t = useTranslations('AdminTenants.partnerDetail.overview');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { identity, owner, counts, operating, plan, branches } = overview;
  // `null` = người xem không có quyền xem xe: không có tóm tắt cảnh báo, không có lối vào tab Xe.
  const alerts = overview.alerts ?? null;
  const vehiclesWithAlerts = counts.vehiclesWithAlerts ?? null;

  return (
    <div className={styles.tabBody}>
      {alerts && alerts.length > 0 && vehiclesWithAlerts !== null ? (
        <button
          type="button"
          className={cx(styles.banner, styles.bannerButton)}
          onClick={() => onGoTab(PARTNER_DETAIL_TAB.VEHICLES)}
        >
          <ExclamationCircleOutlined className={styles.bannerIcon} />
          <span>
            {t('issuesBanner', { count: vehiclesWithAlerts })}
            {alerts.slice(0, 3).map((alert) => (
              <span key={alert.kind}>
                {' · '}
                {t('issueItem', {
                  label: domainLabel('vehicleAlertShort', alert.kind),
                  count: alert.vehicleCount,
                })}
              </span>
            ))}
          </span>
          <RightOutlined aria-hidden />
        </button>
      ) : null}

      <div className={styles.kpis}>
        <StatCard
          label={t('stats.vehicles')}
          value={fmt.count(counts.vehicles)}
          icon={CarOutlined}
          tone="blue"
        />
        <StatCard
          label={t('stats.listed')}
          value={fmt.count(counts.listed)}
          icon={ShopOutlined}
          tone="green"
        />
        <StatCard
          label={t('stats.renting')}
          value={fmt.count(counts.renting)}
          icon={CalendarOutlined}
          tone="gold"
        />
        {vehiclesWithAlerts !== null ? (
          <StatCard
            label={t('stats.alerts')}
            value={fmt.count(vehiclesWithAlerts)}
            icon={WarningOutlined}
            tone="red"
            danger={vehiclesWithAlerts > 0}
          />
        ) : null}
      </div>

      <div className={styles.columns}>
        <div className={styles.stack}>
          <DashboardPanel
            title={isPackage ? t('info.shopTitle') : t('info.ownerTitle')}
            icon={<InfoCircleOutlined />}
            extra={<ReadOnlyTag />}
          >
            <KeyValues
              items={
                isPackage
                  ? [
                      { key: 'name', label: t('info.shopName'), value: identity.name },
                      { key: 'code', label: t('info.shopCode'), value: identity.code },
                      {
                        key: 'area',
                        label: t('info.area'),
                        value: operating.areaNames.join(', ') || '—',
                      },
                      {
                        key: 'joined',
                        label: t('info.joined'),
                        value: fmt.date(identity.createdAt),
                      },
                      {
                        key: 'address',
                        label: t('info.publicAddress'),
                        value: operating.publicAddress ?? '—',
                      },
                    ]
                  : [
                      { key: 'name', label: t('info.ownerName'), value: owner.name ?? '—' },
                      { key: 'code', label: t('info.ownerCode'), value: identity.code },
                      {
                        key: 'area',
                        label: t('info.area'),
                        value: operating.areaNames.join(', ') || '—',
                      },
                      {
                        key: 'joined',
                        label: t('info.joined'),
                        value: fmt.date(identity.createdAt),
                      },
                      { key: 'phone', label: t('info.phone'), value: owner.phoneMasked ?? '—' },
                      { key: 'email', label: t('info.email'), value: owner.emailMasked ?? '—' },
                    ]
              }
            />
          </DashboardPanel>

          {overview.recentVehicles ? (
            <DashboardPanel
              title={t('recentVehicles')}
              icon={<CarOutlined />}
              extra={
                <Button
                  type="link"
                  size="small"
                  onClick={() => onGoTab(PARTNER_DETAIL_TAB.VEHICLES)}
                >
                  {t('viewAllVehicles')} <RightOutlined aria-hidden />
                </Button>
              }
            >
              <PartnerVehicleTable items={overview.recentVehicles} isPackage={isPackage} compact />
            </DashboardPanel>
          ) : null}

          {isPackage && branches ? (
            <DashboardPanel
              title={t('branches.title')}
              icon={<ApartmentOutlined />}
              empty={t('branches.empty')}
            >
              {branches.length > 0 ? (
                <ul className={styles.issueList}>
                  {branches.map((branch) => (
                    <li key={branch.id} className={styles.issue}>
                      <span>
                        <strong>{branch.name}</strong>
                        {branch.isDefault ? (
                          <Tag className={styles.small}>{t('branches.default')}</Tag>
                        ) : null}
                        <div className={styles.muted}>{branch.address ?? '—'}</div>
                      </span>
                      <span>{t('branches.vehicles', { count: branch.vehicleCount })}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </DashboardPanel>
          ) : null}

          {!isPackage && overview.recentBookings ? (
            <DashboardPanel
              title={t('recentBookings')}
              icon={<FileTextOutlined />}
              extra={
                <Button
                  type="link"
                  size="small"
                  onClick={() => onGoTab(PARTNER_DETAIL_TAB.BOOKINGS)}
                >
                  {t('viewAllBookings')} <RightOutlined aria-hidden />
                </Button>
              }
            >
              <PartnerBookingTable items={overview.recentBookings} compact />
            </DashboardPanel>
          ) : null}
        </div>

        <div className={styles.stack}>
          <DashboardPanel
            title={isPackage ? t('operating.shopTitle') : t('operating.ownerTitle')}
            icon={<SafetyCertificateOutlined />}
          >
            <KeyValues
              items={[
                {
                  key: 'verification',
                  label: t('operating.verification'),
                  value: (
                    <StatusTag
                      value={operating.verification as ShopVerification}
                      meta={SHOP_VERIFICATION_META}
                      group="shopVerification"
                    />
                  ),
                },
                ...(isPackage
                  ? [
                      {
                        key: 'onboarding',
                        label: t('operating.onboarding'),
                        value: operating.onboardingCompleted
                          ? t('operating.onboardingDone')
                          : t('operating.onboardingPending'),
                      },
                      {
                        key: 'listing',
                        label: t('operating.listing'),
                        value: (
                          <ListingEligibility
                            missing={operating.listingRequirementsMissing ?? []}
                          />
                        ),
                      },
                    ]
                  : [
                      {
                        key: 'account',
                        label: t('operating.accountStatus'),
                        value: owner.accountStatus ? (
                          <StatusTag
                            value={owner.accountStatus as UserStatus}
                            meta={USER_STATUS_META}
                            group="userStatus"
                          />
                        ) : (
                          '—'
                        ),
                      },
                    ]),
                {
                  key: 'lastActivity',
                  label: t('operating.lastActivity'),
                  value: operating.lastActivityAt
                    ? fmt.dateTime(operating.lastActivityAt)
                    : t('operating.never'),
                },
              ]}
            />
          </DashboardPanel>

          {isPackage ? (
            <DashboardPanel title={t('plan.title')} icon={<CrownOutlined />} empty={t('plan.none')}>
              {plan && plan.planName ? <PlanSummary plan={plan} /> : null}
            </DashboardPanel>
          ) : null}

          {alerts ? (
            <DashboardPanel
              title={t('issues.title')}
              icon={<AlertOutlined />}
              empty={t('issues.empty')}
            >
              {alerts.length > 0 ? (
                <ul className={styles.issueList}>
                  {alerts.map((alert) => (
                    <li key={alert.kind} className={styles.issue}>
                      <span
                        className={
                          alert.severity === VEHICLE_ALERT_SEVERITY.CRITICAL
                            ? styles.critical
                            : styles.warning
                        }
                      >
                        {domainLabel('vehicleAlertShort', alert.kind)}
                      </span>
                      <span>{t('issues.vehicles', { count: alert.vehicleCount })}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </DashboardPanel>
          ) : null}

          {isPackage ? (
            <DashboardPanel title={t('owner.title')} icon={<UserOutlined />}>
              <KeyValues
                items={[
                  { key: 'name', label: t('info.ownerName'), value: owner.name ?? '—' },
                  { key: 'phone', label: t('info.phone'), value: owner.phoneMasked ?? '—' },
                  { key: 'email', label: t('info.email'), value: owner.emailMasked ?? '—' },
                ]}
              />
            </DashboardPanel>
          ) : (
            <CommissionSummary tenantId={identity.id} onGoTab={onGoTab} />
          )}
        </div>
      </div>
    </div>
  );
}

function ListingEligibility({ missing }: { missing: string[] }) {
  const t = useTranslations('AdminTenants.partnerDetail.overview.operating');
  const tGate = useTranslations('Shop.listingGate.items');
  if (missing.length === 0) return <Tag color="success">{t('listingReady')}</Tag>;
  return (
    <span className={styles.warning}>
      {t('listingMissing', {
        items: missing
          .map((key) => (tGate.has(key as never) ? tGate(key as never) : key))
          .join(', '),
      })}
    </span>
  );
}

function PlanSummary({ plan }: { plan: NonNullable<PartnerOverview['plan']> }) {
  const t = useTranslations('AdminTenants.partnerDetail.overview.plan');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const [now] = useState(() => Date.now());
  const daysLeft = plan.endsAt
    ? Math.max(0, Math.ceil((new Date(plan.endsAt).getTime() - now) / DAY_MS))
    : null;
  return (
    <KeyValues
      items={[
        { key: 'plan', label: t('name'), value: <strong>{plan.planName}</strong> },
        { key: 'phase', label: t('phase'), value: domainLabel('billingPhase', plan.phase) },
        {
          key: 'ends',
          label: t('endsAt'),
          value: plan.endsAt ? (
            <>
              {fmt.date(plan.endsAt)}
              {daysLeft !== null ? (
                <span className={styles.muted}> {t('daysLeft', { days: daysLeft })}</span>
              ) : null}
            </>
          ) : (
            '—'
          ),
        },
        {
          key: 'quota',
          label: t('quota'),
          // Trần ĐANG CƯỠNG CHẾ do server tính — kể cả khi gói đã hết hạn và trần là Owner Lite.
          value: <QuotaValue quota={plan.vehicleQuota} unit="vehicles" />,
        },
      ]}
    />
  );
}

/** Tóm tắt tháng hiện tại của chủ xe cá nhân — số tiền theo quyền, do server quyết. */
function CommissionSummary({
  tenantId,
  onGoTab,
}: {
  tenantId: string;
  onGoTab: (tab: PartnerDetailTab) => void;
}) {
  const t = useTranslations('AdminTenants.partnerDetail.overview.commission');
  const tTab = useTranslations('AdminTenants.partnerDetail');
  const periodLabel = usePeriodLabel();
  const query = usePartnerCommission(tenantId);
  const data = query.data;
  const current = data?.months.find((month) => !month.closed) ?? null;
  // Đang tải / lỗi KHÔNG được đọc thành "chưa có số liệu".
  const state = useTabState({
    isLoading: query.isLoading,
    error: query.isError && !data ? query.error : null,
    onRetry: () => void query.refetch(),
    deniedMessage: tTab('denied.commission'),
  });
  return (
    <DashboardPanel
      title={t('title')}
      icon={<PercentageOutlined />}
      empty={t('empty')}
      extra={
        <Button type="link" size="small" onClick={() => onGoTab(PARTNER_DETAIL_TAB.COMMISSION)}>
          {t('viewDetail')} <RightOutlined aria-hidden />
        </Button>
      }
    >
      {state ??
        (current ? (
          <KeyValues
            items={[
              { key: 'period', label: t('period'), value: periodLabel(current.period) },
              { key: 'count', label: t('completed'), value: current.completedCount },
              {
                key: 'revenue',
                label: t('revenue'),
                value: <MoneyValue value={current.revenue} />,
              },
              {
                key: 'fee',
                label: t('serviceFee'),
                value: <MoneyValue value={current.serviceFee} />,
              },
            ]}
          />
        ) : null)}
    </DashboardPanel>
  );
}
