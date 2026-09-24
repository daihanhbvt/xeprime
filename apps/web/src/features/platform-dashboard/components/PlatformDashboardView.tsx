'use client';

import {
  AuditOutlined,
  CarOutlined,
  FileTextOutlined,
  LockOutlined,
  ShopOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { Button, Result, Spin } from 'antd';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { TENANT_STATUS_META, type TenantStatus } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ROUTES } from '@/constants/routes';
import { dayjs } from '@/lib/datetime';
import { DashboardPanel } from '@/features/dashboard/components/DashboardPanel';
import { StatCard } from '@/features/dashboard/components/StatCard';
import { usePlatformSummary } from '../hooks/use-platform-summary';
import type { PlatformRecentTenant } from '../types';
import styles from './PlatformDashboardView.module.css';
import { useAppFormat, type AppFormat } from '@/i18n/use-app-format';

/** Ngày hôm nay theo ngôn ngữ đang dùng — "Thứ Năm, 24 tháng 9, 2026" · "Thursday, September 24, 2026". */
function todayLabel(fmt: AppFormat): string {
  const text = fmt.fullDate(dayjs());
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

/**
 * Dashboard nền tảng — số liệu toàn hệ thống + lối tắt sang màn "Duyệt xe" / gian hàng.
 *
 * Lối tắt "Chờ duyệt" chỉ còn PHIẾU XE (24/09/2026): nền tảng tạm ngừng xác minh gian hàng, và
 * màn duyệt chỉ nhận phiếu xe — một dòng "Hồ sơ gian hàng · N phiếu" trỏ vào đó là mời người
 * trực đi tìm một hàng đợi không tồn tại.
 */
export function PlatformDashboardView() {
  const t = useTranslations('PlatformDashboard');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = usePlatformSummary();

  if (isError && !data) {
    return (
      <Result
        status="error"
        title={t('loadError')}
        extra={
          <Button type="primary" onClick={() => void refetch()}>
            {tCommon('actions.retry')}
          </Button>
        }
      />
    );
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.date}>{todayLabel(fmt)}</p>
      </header>

      <div className={styles.stats}>
        <StatCard
          label={t('stats.tenantTotal')}
          value={data ? data.tenantTotal : '—'}
          icon={ShopOutlined}
          tone="blue"
          loading={isLoading}
        />
        <StatCard
          label={t('stats.tenantActive')}
          value={data ? data.tenantsByStatus.active : '—'}
          icon={ShopOutlined}
          tone="green"
          loading={isLoading}
        />
        <StatCard
          label={t('stats.tenantSuspended')}
          value={data ? data.tenantsByStatus.suspended : '—'}
          icon={StopOutlined}
          tone="red"
          danger={Boolean(data?.tenantsByStatus.suspended)}
          loading={isLoading}
        />
        <StatCard
          label={t('stats.vehiclesPending')}
          value={data ? data.approvalPendingVehicle : '—'}
          icon={AuditOutlined}
          tone="gold"
          loading={isLoading}
        />
        <StatCard
          label={t('stats.listingActive')}
          value={data ? data.listingActive : '—'}
          icon={CarOutlined}
          tone="green"
          loading={isLoading}
        />
        <StatCard
          label={t('stats.bookingThisMonth')}
          value={data ? data.bookingThisMonth : '—'}
          icon={FileTextOutlined}
          tone="blue"
          loading={isLoading}
        />
      </div>

      <div className={styles.panels}>
        <DashboardPanel title={t('pending.title')} icon={<AuditOutlined />}>
          {isLoading ? (
            <div className={styles.center}>
              <Spin />
            </div>
          ) : (
            <>
              <ul className={styles.miniList}>
                <li className={styles.miniRow}>
                  <button
                    type="button"
                    className={styles.miniBtn}
                    onClick={() => router.push(ROUTES.MANAGE.ADMIN)}
                  >
                    <span className={styles.miniName}>{t('pending.vehicles')}</span>
                    <span className={styles.miniMeta}>
                      {t('pending.count', { count: data?.approvalPendingVehicle ?? 0 })}
                    </span>
                  </button>
                </li>
              </ul>
              <div className={styles.panelFoot}>
                <Button size="small" onClick={() => router.push(ROUTES.MANAGE.ADMIN)}>
                  {t('pending.open')}
                </Button>
              </div>
            </>
          )}
        </DashboardPanel>

        <DashboardPanel title={t('recent.title')} icon={<LockOutlined />} empty={t('recent.empty')}>
          {isLoading ? (
            <div className={styles.center}>
              <Spin />
            </div>
          ) : data && data.recentTenants.length > 0 ? (
            <>
              <RecentTenantList
                items={data.recentTenants}
                onSelect={() => router.push(ROUTES.MANAGE.ADMIN_TENANTS)}
              />
              <div className={styles.panelFoot}>
                <Button size="small" onClick={() => router.push(ROUTES.MANAGE.ADMIN_TENANTS)}>
                  {t('recent.manage')}
                </Button>
              </div>
            </>
          ) : null}
        </DashboardPanel>
      </div>
    </div>
  );
}

function RecentTenantList({
  items,
  onSelect,
}: {
  items: PlatformRecentTenant[];
  onSelect: () => void;
}) {
  const fmt = useAppFormat();

  return (
    <ul className={styles.miniList}>
      {items.map((t) => (
        <li key={t.id} className={styles.miniRow}>
          <button type="button" className={styles.miniBtn} onClick={onSelect}>
            <div>
              <div className={styles.miniName}>{t.name}</div>
              <div className={styles.miniMeta}>
                {t.provinceName ? `${t.provinceName} · ` : ''}
                {fmt.date(t.createdAt)}
              </div>
            </div>
            <StatusTag
              value={t.status as TenantStatus}
              meta={TENANT_STATUS_META}
              group="tenantStatus"
            />
          </button>
        </li>
      ))}
    </ul>
  );
}
