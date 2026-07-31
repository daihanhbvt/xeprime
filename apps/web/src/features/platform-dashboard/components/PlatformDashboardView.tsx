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
import { useRouter } from 'next/navigation';
import { TENANT_STATUS_META, type TenantStatus } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ROUTES } from '@/constants/routes';
import { dayjs, formatDate } from '@/lib/datetime';
import { DashboardPanel } from '@/features/dashboard/components/DashboardPanel';
import { StatCard } from '@/features/dashboard/components/StatCard';
import { usePlatformSummary } from '../hooks/use-platform-summary';
import type { PlatformRecentTenant } from '../types';
import styles from './PlatformDashboardView.module.css';

/** Ngày hôm nay kiểu "Thứ Sáu, 24 tháng 7, 2026" (dayjs đã set locale vi ở providers). */
function todayLabel(): string {
  const text = dayjs().format('dddd, D [tháng] M, YYYY');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Dashboard nền tảng — số liệu toàn hệ thống + lối tắt sang duyệt hồ sơ / gian hàng. */
export function PlatformDashboardView() {
  const router = useRouter();
  const { data, isLoading, isError, refetch } = usePlatformSummary();

  if (isError && !data) {
    return (
      <Result
        status="error"
        title="Không tải được số liệu nền tảng"
        extra={
          <Button type="primary" onClick={() => void refetch()}>
            Thử lại
          </Button>
        }
      />
    );
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.title}>Tổng quan nền tảng</h1>
        <p className={styles.date}>{todayLabel()}</p>
      </header>

      <div className={styles.stats}>
        <StatCard
          label="Tổng gian hàng"
          value={data ? data.tenantTotal : '—'}
          icon={ShopOutlined}
          tone="blue"
          loading={isLoading}
        />
        <StatCard
          label="Đang hoạt động"
          value={data ? data.tenantsByStatus.active : '—'}
          icon={ShopOutlined}
          tone="green"
          loading={isLoading}
        />
        <StatCard
          label="Bị khoá"
          value={data ? data.tenantsByStatus.suspended : '—'}
          icon={StopOutlined}
          tone="red"
          danger={Boolean(data?.tenantsByStatus.suspended)}
          loading={isLoading}
        />
        <StatCard
          label="Chờ duyệt hồ sơ"
          value={data ? data.approvalPending : '—'}
          icon={AuditOutlined}
          tone="gold"
          loading={isLoading}
        />
        <StatCard
          label="Xe đang public"
          value={data ? data.listingActive : '—'}
          icon={CarOutlined}
          tone="green"
          loading={isLoading}
        />
        <StatCard
          label="Đơn thuê tháng này"
          value={data ? data.bookingThisMonth : '—'}
          icon={FileTextOutlined}
          tone="blue"
          loading={isLoading}
        />
      </div>

      <div className={styles.panels}>
        <DashboardPanel title="Chờ duyệt" icon={<AuditOutlined />}>
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
                    <span className={styles.miniName}>Hồ sơ gian hàng</span>
                    <span className={styles.miniMeta}>{data?.approvalPendingTenant ?? 0} phiếu</span>
                  </button>
                </li>
                <li className={styles.miniRow}>
                  <button
                    type="button"
                    className={styles.miniBtn}
                    onClick={() => router.push(ROUTES.MANAGE.ADMIN)}
                  >
                    <span className={styles.miniName}>Hồ sơ xe</span>
                    <span className={styles.miniMeta}>{data?.approvalPendingVehicle ?? 0} phiếu</span>
                  </button>
                </li>
              </ul>
              <div className={styles.panelFoot}>
                <Button size="small" onClick={() => router.push(ROUTES.MANAGE.ADMIN)}>
                  Mở hàng đợi duyệt
                </Button>
              </div>
            </>
          )}
        </DashboardPanel>

        <DashboardPanel title="Gian hàng mới" icon={<LockOutlined />} empty="Chưa có gian hàng nào">
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
                  Quản lý gian hàng
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
  return (
    <ul className={styles.miniList}>
      {items.map((t) => (
        <li key={t.id} className={styles.miniRow}>
          <button type="button" className={styles.miniBtn} onClick={onSelect}>
            <div>
              <div className={styles.miniName}>{t.name}</div>
              <div className={styles.miniMeta}>
                {t.provinceName ? `${t.provinceName} · ` : ''}
                {formatDate(t.createdAt)}
              </div>
            </div>
            <StatusTag value={t.status as TenantStatus} meta={TENANT_STATUS_META} />
          </button>
        </li>
      ))}
    </ul>
  );
}
