'use client';

import { CarOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Skeleton } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  MARKETPLACE_VISIBILITY_REASON_META,
  PERMISSION,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_META,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { useMySubscription } from '@/features/subscription/hooks/use-subscription';
import { useVehicles } from '@/features/vehicles/hooks/use-vehicles';
import type { VehicleListItem } from '@/features/vehicles/types';
import { usePermissions } from '@/hooks/use-permissions';
import type { DashboardLinks } from '../hooks/use-dashboard-links';
import { DashboardPanel } from './DashboardPanel';
import styles from './SidePanels.module.css';

/** Chủ xe cá nhân có một tới ba chiếc — đủ hiện hết, và vẫn có trần cho dữ liệu lạ. */
const OWNER_VEHICLE_PREVIEW = 5;

/**
 * "Xe của bạn" — Tổng quan của CHỦ XE CÁ NHÂN đặt từng chiếc xe lên bàn: khách có đang thấy nó
 * không (hay vì sao không), và nó đang rảnh hay đang ở với khách.
 *
 * Gian hàng gói thấy SỐ ĐẾM (`MarketPanel`) vì đội xe của họ là hàng chục chiếc; chủ xe 1–3 xe thì
 * cần thấy chính CHIẾC XE. Cùng API danh sách xe (`GET /vehicles`) — không có đường đọc thứ hai.
 *
 * Trần xe đọc `fleetQuota` của `GET /subscription` (do server giải — ADR 0041). Chạm trần thì mời
 * mở gian hàng: đúng lúc người dùng cần thêm năng lực, không phải một băng quảng cáo thường trực.
 */
export function OwnerVehiclesPanel({ links }: { links: DashboardLinks }) {
  const t = useTranslations('Dashboard.ownerVehicles');
  const router = useRouter();
  const { has } = usePermissions();
  const vehicles = useVehicles({ page: 1, limit: OWNER_VEHICLE_PREVIEW, sort: 'newest' });
  const subscription = useMySubscription(has(PERMISSION.SUBSCRIPTION_VIEW));

  const quota = subscription.data?.fleetQuota;
  const limit = quota?.kind === 'total' ? quota.totalLimit : null;
  const used = quota?.totalUsed ?? vehicles.data?.meta.total ?? 0;
  const atCapacity = limit !== null && used >= limit;
  const canCreate = has(PERMISSION.VEHICLE_CREATE) && !atCapacity;

  const items = vehicles.data?.items ?? [];
  const total = vehicles.data?.meta.total ?? 0;

  let body;
  if (vehicles.isLoading) {
    body = <Skeleton active title={false} paragraph={{ rows: 3 }} />;
  } else if (vehicles.isError && !vehicles.data) {
    body = <p className={styles.note}>{t('loadError')}</p>;
  } else if (items.length === 0) {
    body = <p className={styles.note}>{t('empty')}</p>;
  } else {
    body = (
      <ul className={styles.vehicleList}>
        {items.map((vehicle) => (
          <li key={vehicle.id}>
            <OwnerVehicleRow vehicle={vehicle} href={links.vehicle(vehicle.id)} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <DashboardPanel
      title={t('title')}
      icon={<CarOutlined />}
      extra={
        limit !== null ? (
          <span className={styles.extraNote}>{t('quota', { used, limit })}</span>
        ) : null
      }
    >
      <div className={styles.stack}>
        {body}

        {atCapacity ? (
          <div className={styles.upsell}>
            <p className={styles.upsellText}>{t('atCapacity', { limit: limit ?? 0 })}</p>
            <Link href={links.subscription} className={styles.extraLink}>
              {t('upgrade')}
            </Link>
          </div>
        ) : null}

        <div className={styles.actionsSplit}>
          {total > 0 ? (
            <Link href={links.vehicles} className={styles.footLink}>
              {t('viewAll')}
              <RightOutlined aria-hidden />
            </Link>
          ) : (
            <span />
          )}
          {canCreate ? (
            <Button icon={<PlusOutlined />} onClick={() => router.push(links.vehicleNew)}>
              {t('add')}
            </Button>
          ) : null}
        </div>
      </div>
    </DashboardPanel>
  );
}

function OwnerVehicleRow({ vehicle, href }: { vehicle: VehicleListItem; href: string }) {
  // Đã duyệt ⇒ nói khách có ĐANG thấy xe không (hay vì sao không); chưa duyệt ⇒ nói đang ở bước nào.
  const approved = vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;
  return (
    <Link href={href} className={styles.vehicleRow}>
      {vehicle.mainImageUrl ? (
        <img src={vehicle.mainImageUrl} alt="" className={styles.vehicleThumb} loading="lazy" />
      ) : (
        <span className={styles.vehicleThumbEmpty} aria-hidden>
          <CarOutlined />
        </span>
      )}
      <span className={styles.vehicleMain}>
        <span className={styles.vehicleName}>{vehicle.name}</span>
        {vehicle.plateNumber ? <span className={styles.vehiclePlate}>{vehicle.plateNumber}</span> : null}
      </span>
      <span className={styles.vehicleTags}>
        {approved ? (
          <StatusTag
            value={vehicle.marketplaceVisibilityReason}
            meta={MARKETPLACE_VISIBILITY_REASON_META}
            group="marketplaceVisibility"
          />
        ) : (
          <StatusTag
            value={vehicle.publicStatus}
            meta={VEHICLE_PUBLIC_STATUS_META}
            group="vehiclePublicStatus"
          />
        )}
        <StatusTag
          value={vehicle.operationStatus}
          meta={VEHICLE_OPERATION_STATUS_META}
          group="vehicleOperationStatus"
        />
      </span>
    </Link>
  );
}
