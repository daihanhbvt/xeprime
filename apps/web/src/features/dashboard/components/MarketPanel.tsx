'use client';

import { PlusOutlined, ShopOutlined } from '@ant-design/icons';
import { Button, Skeleton } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PERMISSION, VEHICLE_PUBLIC_STATUS } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { usePermissions } from '@/hooks/use-permissions';
import { cx } from '@/lib/cx';
import type { DashboardLinks } from '../hooks/use-dashboard-links';
import type { PartnerOverviewMarket } from '../types';
import { DashboardPanel } from './DashboardPanel';
import styles from './SidePanels.module.css';

/**
 * "Xe trên chợ" — trục HIỂN THỊ của đội xe (khách có tìm thấy xe không), khác trục vận hành
 * (đang thuê/bảo dưỡng) ở thẻ KPI.
 *
 * "Cần sửa" là dòng duy nhất có màu nhấn: đó là việc của chính gian hàng, và mỗi ngày nằm đó là
 * một ngày chiếc xe không kiếm được đồng nào. Các dòng có trạng thái duyệt dẫn tới danh sách xe đã
 * lọc ĐÚNG trạng thái đó.
 */
export function MarketPanel({
  market,
  links,
}: {
  market: PartnerOverviewMarket | undefined;
  links: DashboardLinks;
}) {
  const t = useTranslations('Dashboard.market');
  const fmt = useAppFormat();
  const router = useRouter();
  const { has } = usePermissions();
  const canCreate = has(PERMISSION.VEHICLE_CREATE);

  const total = market ? market.onMarket + market.inReview + market.needsRevision + market.draft : 0;

  const rows = market
    ? [
        { key: 'onMarket', label: t('onMarket'), count: market.onMarket, href: links.vehicles, tone: 'good' },
        {
          key: 'needsRevision',
          label: t('needsRevision'),
          count: market.needsRevision,
          href: links.vehiclesByPublicStatus(VEHICLE_PUBLIC_STATUS.NEEDS_REVISION),
          tone: market.needsRevision > 0 ? 'warn' : 'plain',
        },
        {
          key: 'inReview',
          label: t('inReview'),
          count: market.inReview,
          href: links.vehiclesByPublicStatus(VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW),
          tone: 'plain',
        },
        {
          key: 'draft',
          label: t('draft'),
          count: market.draft,
          href: links.vehiclesByPublicStatus(VEHICLE_PUBLIC_STATUS.DRAFT),
          tone: 'plain',
        },
      ]
    : [];

  return (
    <DashboardPanel
      title={t('title')}
      icon={<ShopOutlined />}
      extra={
        <Link href={links.vehicles} className={styles.extraLink}>
          {t('manage')}
        </Link>
      }
    >
      {!market ? (
        <Skeleton active title={false} paragraph={{ rows: 4 }} />
      ) : total === 0 ? (
        <div className={styles.emptyBlock}>
          <p className={styles.note}>{t('empty')}</p>
          {canCreate ? (
            // Nút đi qua router chứ không bọc trong `<Link>`: `<a><button>` lồng nhau là HTML sai.
            <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push(links.vehicleNew)}>
              {t('add')}
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className={styles.rows}>
          {rows.map((row) => (
            <li key={row.key}>
              <Link href={row.href} className={styles.row}>
                <span className={cx(styles.dot, styles[`dot_${row.tone}`])} aria-hidden />
                <span className={styles.rowLabel}>{row.label}</span>
                <span className={cx(styles.rowValue, row.tone === 'warn' && styles.rowValueWarn)}>
                  {fmt.count(row.count)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardPanel>
  );
}
