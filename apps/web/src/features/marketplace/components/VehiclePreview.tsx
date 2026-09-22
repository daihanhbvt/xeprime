'use client';

import { RightOutlined } from '@ant-design/icons';
import { Alert, Button, Empty, Skeleton } from 'antd';
import Link from 'next/link';
import { serviceTypeLabel } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { applyFilterPatch } from '../filter-params';
import { useDestinations } from '../hooks/use-destinations';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import {
  RECOMMENDED_LIMIT,
  useNearProvinceCode,
  useRecommendedListings,
} from '../hooks/use-recommended-listings';
import { provinceLabelOf } from '../province-options';
import { VehicleCard } from './VehicleCard';
import styles from './VehiclePreview.module.css';
import { useTranslations } from 'next-intl';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';

/** Đủ 34 tỉnh — chỉ để tra TÊN của tỉnh đang ưu tiên; danh sách này đã được cache dùng chung. */
const ALL_DESTINATIONS = 34;

/**
 * Khối "Xe phù hợp với bạn" ở trang chủ.
 *
 * ## Nó xếp hạng thế nào
 *
 * Backend (`GET /public/listings/recommended`) xếp theo hai tầng: BẬC ĐỊA LÝ trước (đúng tỉnh →
 * cùng vùng → còn lại), rồi `rank_score` — điểm gộp từ chất lượng Bayes, số chuyến đã chạy, độ
 * đầy hồ sơ và độ mới. Mỗi gian hàng tối đa hai xe, để một gian hàng đông xe không chiếm cả khối.
 *
 * Tỉnh ở đây là ƯU TIÊN chứ không phải bộ lọc: khách ở tỉnh chưa có xe vẫn thấy một khối đầy,
 * chỉ là xe tỉnh khác. Khi điều đó xảy ra, khối NÓI RA (`meta.mixedProvinces`) thay vì để người
 * xem tự phát hiện — hứa "xe ở Hà Nội" rồi hiện xe An Giang là cách nhanh nhất mất lòng tin.
 *
 * ## Nó lọc theo cái gì
 *
 * Dịch vụ / loại xe / khoảng thuê đọc từ URL (thẻ tìm kiếm ghi `?serviceType=` lên `/` bằng
 * shallow replace), nên hai khối trên cùng một trang không bao giờ nói hai dịch vụ khác nhau.
 * Facet sâu (hãng, tiện ích, giá) cố ý không có ở đây — chúng thuộc về trang kết quả.
 *
 * Hỏng khối này KHÔNG được làm hỏng cả trang chủ: lỗi hiện một alert gọn, các mục "Địa điểm nổi
 * bật" / "Gian hàng nổi bật" bên dưới vẫn dùng được.
 */
export function VehiclePreview() {
  const errorMessage = useErrorMessage();
  const domainLabel = useDomainLabel();
  const t = useTranslations('Marketplace.available');
  const { filters } = useMarketplaceFilters();
  const nearProvinceCode = useNearProvinceCode(filters);
  const { data: destinations } = useDestinations(ALL_DESTINATIONS);

  const { data, isLoading, isError, error } = useRecommendedListings({
    vehicleType: filters.vehicleType,
    serviceType: filters.serviceType,
    nearProvinceCode,
    pickupAt: filters.pickupAt,
    returnAt: filters.returnAt,
  });
  const items = data?.data ?? [];

  // Tên tỉnh chỉ tra được khi danh mục điểm đến đã về VÀ tỉnh đó còn xe. Không tra ra thì khối
  // im lặng về địa lý thay vì hiện một mã hai chữ số — mã là dữ liệu, không phải chữ cho người đọc.
  const nearProvinceName = provinceLabelOf(destinations, data?.meta.nearProvinceCode ?? undefined);

  const serviceLabel = filters.serviceType
    ? domainLabel('serviceType', filters.serviceType, serviceTypeLabel(filters.serviceType))
    : null;

  // "Khám phá xe" giữ nguyên ngữ cảnh đang xem (kể cả routeType — key URL, không gửi API). Tỉnh
  // đi kèm ở dạng BỘ LỌC: sang trang kết quả thì khách đang thật sự tìm, không còn là xem lướt.
  const exploreQs = new URLSearchParams();
  applyFilterPatch(exploreQs, {
    serviceType: filters.serviceType,
    routeType: filters.routeType,
    vehicleType: filters.vehicleType,
    provinceCode: filters.provinceCode ?? nearProvinceCode ?? undefined,
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
            {serviceLabel ? t('titleWithService', { service: serviceLabel }) : t('title')}{' '}
            {data ? (
              <span className={styles.count}>{t('count', { count: data.meta.total })}</span>
            ) : null}
          </h2>
          {nearProvinceName ? (
            <p className={styles.sub}>
              {data?.meta.mixedProvinces
                ? t('nearProvinceMixed', { province: nearProvinceName })
                : t('nearProvince', { province: nearProvinceName })}
            </p>
          ) : null}
        </div>
        <Link href={exploreHref} className={styles.seeAll}>
          {t('exploreAll')} <RightOutlined />
        </Link>
      </div>

      {isLoading ? (
        <ul className={styles.grid} aria-busy="true">
          {/* Khung chờ dựng đúng số ô và đúng tỉ lệ thẻ thật → không giật layout khi có dữ liệu. */}
          {Array.from({ length: RECOMMENDED_LIMIT }, (_, i) => (
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
          title={t('loadError')}
          description={errorMessage(error)}
          action={
            <Link href={ROUTES.SEARCH}>
              <Button size="small">{t('openSearch')}</Button>
            </Link>
          }
        />
      ) : items.length === 0 ? (
        <Empty description={serviceLabel ? t('emptyForService', { service: serviceLabel }) : t('empty')} />
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
