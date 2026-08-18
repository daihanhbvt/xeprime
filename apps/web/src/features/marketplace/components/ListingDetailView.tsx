import Link from 'next/link';
import {
  CATALOG_TYPE,
  SERVICE_TYPE,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { RequestBookingButton } from '@/features/booking-requests/components/RequestBookingButton';
import { catalogLabel, type CatalogMap } from '@/features/catalog/types';
import { ChatWithShopButton } from '@/features/chat/components/ChatWithShopButton';
import { DiscountTag } from '@/components/data-display/DiscountTag';
import { shopPath } from '@/constants/routes';
import { applyDiscountPercent, formatMoneyVnd } from '@/lib/money';
import type { PublicListingDetail } from '../types';
import { ListingGallery } from './ListingGallery';
import { ListingReviews } from './ListingReviews';
import { ListingServiceSelector } from './ListingServiceSelector';
import { ListingSpecsCard } from './ListingSpecsCard';
import styles from './ListingDetailView.module.css';

function vehicleTypeLabel(type: string): string {
  return type === VEHICLE_TYPE.MOTORBIKE ? 'Xe máy' : 'Ô tô';
}

/** Trang chi tiết một xe trên Marketplace (server-render). Nút thuê là client island. */
export function ListingDetailView({
  listing,
  catalog,
  pickupAt,
  returnAt,
  serviceType,
  routeType,
}: {
  listing: PublicListingDetail;
  /** Danh mục lọc — trang server không gọi được `useCatalog`, page truyền xuống. */
  catalog: CatalogMap;
  pickupAt?: string;
  returnAt?: string;
  /** Ngữ cảnh dịch vụ/lộ trình từ tab tìm kiếm — prefill luồng đặt (17/08). */
  serviceType?: string;
  routeType?: string;
}) {
  const brand = catalogLabel(catalog[CATALOG_TYPE.VEHICLE_BRAND], listing.brand);
  // Thẻ thông số 2 cột kèm icon (mockup đợt 4) — key để client island tra icon.
  const specs: Array<{ key: string; label: string; value: string }> = [
    { key: 'vehicleType', label: 'Loại xe', value: vehicleTypeLabel(listing.vehicleType) },
    ...(listing.bodyType
      ? [
          {
            key: 'bodyType',
            label: 'Kiểu dáng',
            value: catalogLabel(catalog[CATALOG_TYPE.BODY_TYPE], listing.bodyType) ?? '',
          },
        ]
      : []),
    ...(listing.seatCount
      ? [{ key: 'seatCount', label: 'Số chỗ', value: `${listing.seatCount} chỗ` }]
      : []),
    ...(listing.fuelType
      ? [
          {
            key: 'fuelType',
            label: 'Nguồn năng lượng',
            value: catalogLabel(catalog[CATALOG_TYPE.FUEL_TYPE], listing.fuelType) ?? '',
          },
        ]
      : []),
    ...(listing.manufactureYear
      ? [{ key: 'manufactureYear', label: 'Đời xe', value: String(listing.manufactureYear) }]
      : []),
    ...(listing.color ? [{ key: 'color', label: 'Màu', value: listing.color }] : []),
    ...(brand
      ? [{ key: 'brand', label: 'Hãng', value: [brand, listing.model].filter(Boolean).join(' ') }]
      : []),
  ];

  /*
   * MỘT `activeService` cho cả trang (17/08) — selector, khối giá lớn và popup thuê cùng đọc:
   * dịch vụ từ URL nếu xe phục vụ được → ưu tiên tự lái → dịch vụ đầu tiên xe đăng.
   */
  const services: readonly string[] = listing.serviceTypes ?? [];
  const activeService =
    serviceType && services.includes(serviceType)
      ? serviceType
      : services.includes(SERVICE_TYPE.SELF_DRIVE)
        ? SERVICE_TYPE.SELF_DRIVE
        : (services[0] ?? SERVICE_TYPE.SELF_DRIVE);

  // Preview cùng công thức với PricingService; báo giá server vẫn là nguồn chốt.
  const discount = listing.discountPercent ?? 0;
  const displayPrice =
    discount > 0 ? applyDiscountPercent(listing.weekdayPrice, discount) : listing.weekdayPrice;

  return (
    <div className={styles.wrap}>
      {/*
       * Sticky gallery phải nằm trong RIÊNG khối đầu trang. Nếu đặt nó trực tiếp trong
       * `.wrap` cùng Mô tả/Đánh giá, biên sticky là toàn trang và ảnh sẽ đè lên
       * nội dung hàng dưới khi cuộn.
       */}
      <div className={styles.top}>
        <div className={styles.media}>
          {/* Client island: bấm ảnh nào cũng mở trình xem toàn màn hình chung (đếm x/y). */}
          <ListingGallery
            name={listing.name}
            mainImageUrl={listing.mainImageUrl}
            images={listing.images}
          />
        </div>

        <div className={styles.info}>
          <h1 className={styles.title}>{listing.name}</h1>

          {/* Xe nhiều dịch vụ → selector nổi bật ngay trên khối giá; giá lớn đổi theo. */}
          <ListingServiceSelector services={services} active={activeService} />

          {activeService === SERVICE_TYPE.LONG_TERM ? (
            <div className={styles.price}>
              {listing.monthlyPrice ? (
                <>
                  <div className={styles.priceMain}>
                    <b>{formatMoneyVnd(listing.monthlyPrice)}</b>
                    <span>/tháng</span>
                  </div>
                </>
              ) : (
                <div className={styles.priceMain}>
                  <b className={styles.priceContact}>Liên hệ báo giá thuê dài hạn</b>
                </div>
              )}
            </div>
          ) : activeService === SERVICE_TYPE.WITH_DRIVER ? (
            <div className={styles.price}>
              {listing.withDriverDailyPrice ? (
                <>
                  <div className={styles.priceMain}>
                    <b>{formatMoneyVnd(listing.withDriverDailyPrice)}</b>
                    <span>/ngày</span>
                  </div>
                </>
              ) : (
                <div className={styles.priceMain}>
                  <b className={styles.priceContact}>Liên hệ báo giá chuyến có tài xế</b>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.price}>
              <div className={styles.priceMain}>
                {discount > 0 && listing.weekdayPrice ? (
                  <>
                    <s className={styles.oldPrice}>{formatMoneyVnd(listing.weekdayPrice)}</s>
                    <DiscountTag percent={discount} />
                  </>
                ) : null}
                <b>{formatMoneyVnd(displayPrice)}</b>
                <span>/ngày</span>
              </div>
              {listing.weekendPrice || listing.hourlyPrice ? (
                <div className={styles.priceDetails}>
                  {listing.weekendPrice ? (
                    <span className={styles.weekend}>
                      Cuối tuần{' '}
                      {formatMoneyVnd(
                        discount > 0
                          ? applyDiscountPercent(listing.weekendPrice, discount)
                          : listing.weekendPrice,
                      )}
                      {discount > 0 ? ' sau giảm' : ''}
                    </span>
                  ) : null}
                  {listing.hourlyPrice ? (
                    <span className={styles.weekend}>
                      Thuê giờ {formatMoneyVnd(listing.hourlyPrice)}/giờ
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          {listing.deliveryEnabled || listing.noCollateral ? (
            <div className={styles.amenities}>
              {listing.deliveryEnabled ? (
                <span className={styles.amenityBadge}>Giao xe tận nơi</span>
              ) : null}
              {listing.noCollateral ? (
                <span className={styles.amenityBadge}>Miễn thế chấp</span>
              ) : null}
            </div>
          ) : null}

          <ListingSpecsCard specs={specs} />

          {listing.features.length > 0 ? (
            <div className={styles.features}>
              {listing.features.map((key) => (
                <span key={key} className={styles.featureChip}>
                  {catalogLabel(catalog[CATALOG_TYPE.VEHICLE_FEATURE], key)}
                </span>
              ))}
            </div>
          ) : null}

          {/* Thẻ gian hàng theo mockup: avatar (logo hoặc chữ cái đầu) + tick vàng đã duyệt. */}
          <div className={styles.shop}>
            <span className={styles.shopAvatar} aria-hidden="true">
              {listing.shopLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- logo từ R2, host theo môi trường
                <img src={listing.shopLogoUrl} alt="" className={styles.shopAvatarImg} />
              ) : (
                listing.shopName.charAt(0).toUpperCase()
              )}
            </span>
            <div className={styles.shopBody}>
              <div className={styles.shopNameRow}>
                <Link href={shopPath.detail(listing.shopSlug)} className={styles.shopName}>
                  {listing.shopName}
                </Link>
                {/* Xe lên chợ đồng nghĩa gian hàng đã qua duyệt nền tảng — tick nói đúng điều đó. */}
                <span className={styles.verified} title="Gian hàng đã được duyệt">
                  ✓
                </span>
              </div>
              {listing.shopProvince ? (
                <div className={styles.shopMeta}>{listing.shopProvince}</div>
              ) : null}
              {listing.shopBio ? <p className={styles.shopBio}>{listing.shopBio}</p> : null}
            </div>
          </div>

          <div className={styles.actions}>
            {/* Trang này đã có hồ sơ xe đầy đủ — truyền xuống để overlay khỏi tải lại. */}
            <RequestBookingButton
              vehicleId={listing.id}
              vehicleName={listing.name}
              vehicleImageUrl={listing.mainImageUrl}
              listing={listing}
              pickupAt={pickupAt}
              returnAt={returnAt}
              // Cùng activeService với selector + khối giá — popup mở đúng dịch vụ đang xem.
              serviceType={activeService}
              routeType={routeType}
              size="large"
              className={styles.cta}
            />
            <ChatWithShopButton vehicleId={listing.id} size="large" />
          </div>
        </div>
      </div>

      {/* Hàng dưới theo mockup: Mô tả và Đánh giá là HAI THẺ full-width dưới khu ảnh + giá. */}
      <div className={styles.bottom}>
        <section id="description" className={styles.bottomCard}>
          <h2 className={styles.descTitle}>Mô tả</h2>
          <p className={styles.descBody}>{listing.description || 'Gian hàng chưa viết mô tả.'}</p>
        </section>
        <section className={styles.bottomCard}>
          <ListingReviews vehicleId={listing.id} />
        </section>
      </div>
    </div>
  );
}
