'use client';

import { Alert, Button, Empty, Result, Tabs } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { VEHICLE_TYPE, VEHICLE_TYPE_VALUES, type VehicleType } from '@xeprime/types';
import { AccountPageHeader } from '@/features/account/components/AccountPageHeader';
import { marketplaceSearchHref } from '@/features/marketplace/filter-params';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useFavoriteTab, useFavoritesList } from '../hooks/use-favorites-list';
import { FavoriteVehicleCard, FavoriteVehicleCardSkeleton } from './FavoriteVehicleCard';
import styles from './FavoritesView.module.css';

const SKELETON_CARDS = 3;

/**
 * Trang "Xe yêu thích" (`/account/favorites`, BRD §5.2): hai tab Ô tô / Xe máy trên URL, danh sách
 * tải tiếp theo trang server, đủ trạng thái đang tải / rỗng / lỗi + thử lại. Cổng đăng nhập do
 * `AccountShell` của khu tài khoản lo — trang này không tự gác.
 */
export function FavoritesView() {
  const t = useTranslations('Favorites');
  const tCommon = useTranslations('Common');
  const dl = useDomainLabel();
  const { vehicleType, setVehicleType } = useFavoriteTab();

  return (
    <div className={styles.page}>
      <AccountPageHeader title={t('page.title')} />

      <Tabs
        className={styles.tabs}
        activeKey={vehicleType}
        onChange={(key) => setVehicleType(key as VehicleType)}
        aria-label={t('tabs.label')}
        items={VEHICLE_TYPE_VALUES.map((type) => ({
          key: type,
          label: <FavoriteTabLabel vehicleType={type} label={dl('vehicleType', type)} />,
        }))}
      />

      {/* `key` theo tab: đổi tab là một danh sách mới, không mang trạng thái của tab trước. */}
      <FavoritesTab
        key={vehicleType}
        vehicleType={vehicleType}
        retryLabel={tCommon('actions.retry')}
      />
    </div>
  );
}

/**
 * Nhãn tab kèm số xe — "Ô tô (5 xe)". Đọc CHUNG khoá query với danh sách của tab đó nên không gọi
 * API trùng, và bỏ thích lạc quan trừ `total` trong cache (`favorite-cache.ts`) nên số đổi ngay.
 * Chưa có dữ liệu (đang tải / lỗi) thì chỉ hiện tên loại xe.
 */
function FavoriteTabLabel({ vehicleType, label }: { vehicleType: VehicleType; label: string }) {
  const t = useTranslations('Favorites');
  const { total, isInitialLoading, initialError } = useFavoritesList(vehicleType);
  if (isInitialLoading || initialError) return label;
  return t('tabs.withCount', { type: label, count: total });
}

function FavoritesTab({
  vehicleType,
  retryLabel,
}: {
  vehicleType: VehicleType;
  retryLabel: string;
}) {
  const t = useTranslations('Favorites');
  const tCommon = useTranslations('Common');
  const errorMessage = useErrorMessage();
  const list = useFavoritesList(vehicleType);

  if (list.isInitialLoading) {
    return (
      <div className={styles.list} aria-busy="true" aria-label={tCommon('states.loading')}>
        {Array.from({ length: SKELETON_CARDS }, (_, i) => (
          <FavoriteVehicleCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (list.initialError) {
    return (
      <Result
        status="warning"
        title={t('error.title')}
        subTitle={errorMessage(list.initialError)}
        extra={
          <Button type="primary" onClick={list.retry}>
            {retryLabel}
          </Button>
        }
      />
    );
  }

  if (list.items.length === 0) {
    return (
      <Empty
        className={styles.empty}
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <span className={styles.emptyText}>
            <strong>
              {t(vehicleType === VEHICLE_TYPE.MOTORBIKE ? 'empty.motorbike' : 'empty.car')}
            </strong>
            <span>{t('empty.body')}</span>
          </span>
        }
      >
        <Link href={marketplaceSearchHref({ vehicleType })} className={styles.emptyCta}>
          {t('empty.cta')}
        </Link>
      </Empty>
    );
  }

  return (
    <>
      <ul className={styles.list}>
        {list.items.map((vehicle) => (
          <li key={vehicle.id} className={styles.item}>
            <FavoriteVehicleCard vehicle={vehicle} />
          </li>
        ))}
      </ul>

      {list.appendError ? (
        <Alert
          type="warning"
          showIcon
          className={styles.appendError}
          title={t('error.loadMore', { reason: errorMessage(list.appendError) })}
          action={
            <Button size="small" onClick={list.fetchNextPage}>
              {retryLabel}
            </Button>
          }
        />
      ) : null}

      {list.hasNextPage ? (
        <div className={styles.more}>
          <Button loading={list.isFetchingNextPage} onClick={list.fetchNextPage}>
            {t('tabs.showMore')}
          </Button>
        </div>
      ) : null}
    </>
  );
}
