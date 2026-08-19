'use client';

import { RightOutlined } from '@ant-design/icons';
import { Alert, Button, Empty, Skeleton } from 'antd';
import Link from 'next/link';
import { serviceTypeLabel } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { applyFilterPatch } from '../filter-params';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import { usePublicListings } from '../hooks/use-public-listings';
import { VehicleCard } from './VehicleCard';
import styles from './VehiclePreview.module.css';
import { useTranslations } from 'next-intl';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';

/** Trang chủ chỉ XEM TRƯỚC — tối đa 8 xe, không phân trang, không bộ lọc facet. */
const PREVIEW_LIMIT = 8;

/**
 * Khối "Xe khả dụng" ở trang chủ.
 *
 * ĐỌC ngữ cảnh dịch vụ từ URL (17/08): tab dịch vụ ở thẻ tìm kiếm (search/SearchCard) ghi `?serviceType=` lên `/`
 * (shallow, không reload) → khối này query lại ngay theo dịch vụ đó, và link "Khám phá xe"
 * mang trọn ngữ cảnh (dịch vụ, lộ trình, loại xe, tỉnh, ngày) sang `/search` — hai khối trên
 * cùng một trang không bao giờ nói hai dịch vụ khác nhau.
 *
 * Hỏng khối này KHÔNG được làm hỏng cả trang chủ: lỗi hiện một alert gọn, các mục "Địa điểm nổi
 * bật"/"Gian hàng nổi bật" bên dưới vẫn dùng được.
 */
export function VehiclePreview() {
  const errorMessage = useErrorMessage();
  const domainLabel = useDomainLabel();
  const t = useTranslations('Marketplace.available');
  const { filters } = useMarketplaceFilters();
  const { data, isLoading, isError, error } = usePublicListings({
    // Ngữ cảnh từ hero (dịch vụ/loại xe/tỉnh/ngày) lọc luôn preview — facet sâu để cho /search.
    serviceType: filters.serviceType,
    vehicleType: filters.vehicleType,
    provinceCode: filters.provinceCode,
    pickupAt: filters.pickupAt,
    returnAt: filters.returnAt,
    page: 1,
    limit: PREVIEW_LIMIT,
  });
  const items = data?.listings ?? [];

  // "Khám phá xe" giữ nguyên ngữ cảnh đang xem (kể cả routeType — key URL, không gửi API).
  const exploreQs = new URLSearchParams();
  applyFilterPatch(exploreQs, {
    serviceType: filters.serviceType,
    routeType: filters.routeType,
    vehicleType: filters.vehicleType,
    provinceCode: filters.provinceCode,
    pickupAt: filters.pickupAt,
    returnAt: filters.returnAt,
    hourly: filters.hourly,
  });
  const exploreHref = exploreQs.toString()
    ? `${ROUTES.SEARCH}?${exploreQs.toString()}`
    : ROUTES.SEARCH;

  return (
    // id="recommendations": đích scroll của FeaturedLocations (bấm địa điểm → lọc + cuộn tới đây).
    <section id="recommendations" className={styles.section} aria-labelledby="home-vehicles">
      <div className={styles.head}>
        <div>
          <h2 id="home-vehicles" className={styles.title}>
            {filters.serviceType
              ? t('titleWithService', {
                  service: domainLabel(
                    'serviceType',
                    filters.serviceType,
                    serviceTypeLabel(filters.serviceType),
                  ),
                })
              : t('title')}{' '}
            {data ? (
              <span className={styles.count}>{t('count', { count: data.meta.total })}</span>
            ) : null}
          </h2>
        </div>
        <Link href={exploreHref} className={styles.seeAll}>
          {t('exploreAll')} <RightOutlined />
        </Link>
      </div>

      {isLoading ? (
        <ul className={styles.grid} aria-busy="true">
          {/* Khung chờ dựng đúng số ô và đúng tỉ lệ thẻ thật → không giật layout khi có dữ liệu. */}
          {Array.from({ length: PREVIEW_LIMIT }, (_, i) => (
            <li key={i} className={styles.skeletonCard}>
              <Skeleton.Image active className={styles.skeletonImg} />
              <Skeleton active paragraph={{ rows: 2 }} title={{ width: '70%' }} />
            </li>
          ))}
        </ul>
      ) : isError ? (
        <Alert
          type="error"
          showIcon
          message={t('loadError')}
          description={errorMessage(error)}
          action={
            <Link href={ROUTES.SEARCH}>
              <Button size="small">{t('openSearch')}</Button>
            </Link>
          }
        />
      ) : items.length === 0 ? (
        <Empty
          description={
            filters.serviceType
              ? t('emptyForService', {
                  service: domainLabel(
                    'serviceType',
                    filters.serviceType,
                    serviceTypeLabel(filters.serviceType),
                  ),
                })
              : t('empty')
          }
        />
      ) : (
        <ul className={styles.grid}>
          {items.map((listing) => (
            <li key={listing.id}>
              <VehicleCard listing={listing} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
