'use client';

import { Alert, Button, Empty, Skeleton } from 'antd';
import Link from 'next/link';
import { serviceTypeLabel } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { marketplaceSearchHref } from '../filter-params';
import { useAllDestinations } from '../hooks/use-destinations';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import {
  RECOMMENDED_LIMIT,
  useNearProvinceCode,
  useRecommendedListings,
} from '../hooks/use-recommended-listings';
import { provinceLabelOf } from '../province-options';
import { CtaButton } from './CtaButton';
import { HomeCarousel } from './HomeCarousel';
import { SectionHeading } from './SectionHeading';
import { VehicleCard } from './VehicleCard';
import styles from './VehiclePreview.module.css';
import { useTranslations } from 'next-intl';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';

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
  const tHome = useTranslations('Home.featured');
  const { filters } = useMarketplaceFilters();
  const nearProvinceCode = useNearProvinceCode(filters);
  const { data: destinations } = useAllDestinations();

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
  const exploreHref = marketplaceSearchHref({
    serviceType: filters.serviceType,
    routeType: filters.routeType,
    vehicleType: filters.vehicleType,
    provinceCode: filters.provinceCode ?? nearProvinceCode ?? undefined,
    pickupAt: filters.pickupAt,
    returnAt: filters.returnAt,
    hourly: filters.hourly,
  });

  return (
    <section className={styles.section} aria-labelledby="home-vehicles">
      <SectionHeading
        id="home-vehicles"
        kicker={tHome('kicker')}
        title={serviceLabel ? t('titleWithService', { service: serviceLabel }) : tHome('title')}
        action={
          <CtaButton href={exploreHref} variant="outline">
            {tHome('viewAll')}
          </CtaButton>
        }
      />
      {/*
        Khi phải bù xe ở tỉnh khác, khối NÓI RA điều đó — hứa "xe ở Hà Nội" rồi hiện xe An Giang là
        cách nhanh nhất mất lòng tin. Trường hợp thường (đủ xe đúng tỉnh) thì im lặng như bản vẽ.
      */}
      {nearProvinceName && data?.meta.mixedProvinces ? (
        <p className={styles.sub}>{t('nearProvinceMixed', { province: nearProvinceName })}</p>
      ) : null}

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
        <Empty
          description={serviceLabel ? t('emptyForService', { service: serviceLabel }) : t('empty')}
        />
      ) : (
        // Lưới responsive (4-6 cột tuỳ màn hình); mobile là slider thẻ-ở-giữa (bản vẽ mobile v2).
        <HomeCarousel ariaLabel={tHome('title')} perView={4} layout="grid" responsiveGrid>
          {items.map((listing) => (
            <VehicleCard key={listing.id} listing={listing} />
          ))}
        </HomeCarousel>
      )}

      {/* Mobile: "Xem tất cả xe" xuống dưới slider, trải hết bề ngang (nút ở tiêu đề ẩn đi). */}
      <div className={styles.mobileAction}>
        <CtaButton href={exploreHref} variant="outline" className={styles.mobileActionButton}>
          {tHome('viewAll')}
        </CtaButton>
      </div>
    </section>
  );
}
