'use client';

import { CheckOutlined } from '@ant-design/icons';
import { Card } from 'antd';
import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import {
  SERVICE_TYPE,
  SHOP_ONBOARDING_STATE,
  missingPackageShopListingRequirements,
  type PackageShopListingRequirement,
  VEHICLE_IMAGE_TYPE,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { VehicleCard } from '@/features/marketplace/components/VehicleCard';
import type { PublicListing } from '@/features/marketplace/types';
import type { MyShop } from '@/features/shop/types';
import { decorativeIcon } from '@/lib/decorative-icon';
import styles from './CreateVehicleAside.module.css';

/**
 * Các mục "Sẵn sàng gửi duyệt" (Figma). Đủ hết các mục BẮT BUỘC ⇒ bấm Gửi duyệt là qua cổng của
 * server (18/11/2026): `shop` = hồ sơ gian hàng tuyến gói (logo, địa chỉ - `missingPackageShop-
 * ListingRequirements`), `undefined` khi không áp dụng. `features` là TUỲ CHỌN - không tính vào x/N.
 */
export interface CreateReadiness {
  photos: boolean;
  info: boolean;
  pricing: boolean;
  shop?: boolean;
  features: boolean;
}

/**
 * Mục hồ sơ gian hàng còn thiếu để GỬI DUYỆT xe - cùng luật cổng server (`SHOP_LISTING_REQUIREMENTS
 * _MISSING`), chỉ cho gian hàng tuyến gói. SĐT liên hệ đọc ở chi nhánh mặc định phía server, client
 * không có trường đó nên không đoán (server vẫn là cổng cuối).
 */
export function shopListingGaps(
  shop: MyShop | null | undefined,
): PackageShopListingRequirement[] | null {
  if (!shop) return null;
  const packageTrack =
    shop.onboardingState === SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE ||
    shop.onboardingState === SHOP_ONBOARDING_STATE.PACKAGE_PENDING;
  if (!packageTrack) return null;
  return missingPackageShopListingRequirements({
    displayName: shop.name,
    contactPhone: 'n/a',
    provinceCode: shop.defaultBranch?.provinceCode ?? null,
    addressLine: shop.defaultBranch?.address ?? null,
    logoUrl: shop.profile?.logoUrl ?? null,
  });
}

/**
 * Giá trị form mà thẻ xem trước cần — thuần dữ liệu để cả wizard nâng cao lẫn luồng đăng nhanh (hai
 * kiểu form khác nhau) cùng dùng. discountPercent là mức giảm ĐANG ÁP (luồng nhanh: chỉ khi bật).
 */
export interface CreatePreviewValues {
  /** DeepPartial của RHF cho phép từng phần tử thiếu trường - đọc phòng thủ. */
  media?: ReadonlyArray<{ url?: string; type?: string } | undefined> | null;
  name?: string | null;
  vehicleType?: string | null;
  seatCount?: number | null;
  transmission?: string | null;
  fuelType?: string | null;
  weekdayPrice?: number | string | null;
  discountPercent?: number | null;
  deliveryEnabled?: boolean | null;
}

/** Gian hàng như khách thấy trên thẻ xe (logo, tích xanh của tuyến gói, tỉnh). */
export interface PreviewShop {
  name: string;
  slug: string;
  logoUrl: string | null;
  province: string | null;
  verified: boolean;
}

/** Từ hồ sơ gian hàng (`/tenants/current/shop`) ra phần gian hàng của thẻ xe xem trước. */
export function previewShopOf(shop: MyShop | null | undefined): PreviewShop | null {
  if (!shop) return null;
  return {
    name: shop.name,
    slug: shop.slug,
    logoUrl: shop.profile?.logoUrl ?? null,
    province: shop.profile?.provinceName ?? null,
    // Thẻ khách hiện tích xanh cho gian hàng tuyến gói (`shopVerified`).
    verified: shop.onboardingState === SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
  };
}

interface CreateVehicleAsideProps {
  preview: CreatePreviewValues;
  readiness: CreateReadiness;
  /** Tên chi nhánh đang chọn - nơi xe hiện ra trên chợ. */
  branchLabel: string | null;
  shop: PreviewShop | null;
  /** Số ảnh bắt buộc (góc ảnh + cà vẹt nếu có) để ghi đúng mục đầu tiên. */
  requiredPhotos: number;
}

/**
 * Cột phải của wizard tạo xe - Figma `24352:79234`: thẻ "Xem trước trên Marketplace" (dựng từ
 * CHÍNH giá trị đang nhập) và thẻ "Sẵn sàng gửi duyệt x/4" + "Lưu nháp".
 *
 * Bản xem trước chỉ để chủ xe hình dung - giá/nhãn thật trên chợ do backend dựng khi duyệt
 * (`public_listings`, ADR 0008), nên ở đây không có số sao/lượt đánh giá giả.
 */
export function CreateVehicleAside({
  preview,
  readiness,
  branchLabel,
  shop,
  requiredPhotos,
}: CreateVehicleAsideProps) {
  const t = useTranslations('Vehicles.form.createAside');
  const items = [
    { key: 'photos', done: readiness.photos, label: t('readyPhotos', { count: requiredPhotos }) },
    { key: 'info', done: readiness.info, label: t('readyInfo') },
    { key: 'pricing', done: readiness.pricing, label: t('readyPricing') },
    ...(readiness.shop === undefined
      ? []
      : [{ key: 'shop', done: readiness.shop, label: t('readyShop') }]),
  ];
  const doneCount = items.filter((item) => item.done).length;
  const optionalItems = [{ key: 'features', done: readiness.features, label: t('readyFeatures') }];

  return (
    <>
      <MarketplacePreview values={preview} branchLabel={branchLabel} shop={shop} />
      <Card className={styles.card}>
        <div className={styles.readyHeader}>
          <h2 className={styles.cardTitle}>{t('readyTitle')}</h2>
          <span className={styles.readyCount}>
            {t('readyCount', { done: doneCount, total: items.length })}
          </span>
        </div>
        {/* Thanh tự vẽ theo design (cam trên nền vàng nhạt) - không bám class nội bộ của AntD. */}
        <div
          className={styles.readyBar}
          role="progressbar"
          aria-label={t('readyTitle')}
          aria-valuemin={0}
          aria-valuemax={items.length}
          aria-valuenow={doneCount}
        >
          <span
            className={styles.readyBarFill}
            style={{ '--ready-percent': `${(doneCount / items.length) * 100}%` } as CSSProperties}
          />
        </div>
        <ul className={styles.readyList}>
          {items.map((item) => (
            <li key={item.key} className={item.done ? styles.readyDone : styles.readyTodo}>
              {item.done ? (
                <span className={styles.readyCheck}>{decorativeIcon(<CheckOutlined />)}</span>
              ) : (
                <span className={styles.readyCircle} aria-hidden="true" />
              )}
              <span>{item.label}</span>
              <span className={styles.srOnly}>{item.done ? t('srDone') : t('srTodo')}</span>
            </li>
          ))}
          {optionalItems.map((item) => (
            <li key={item.key} className={item.done ? styles.readyDone : styles.readyTodo}>
              {item.done ? (
                <span className={styles.readyCheck}>{decorativeIcon(<CheckOutlined />)}</span>
              ) : (
                <span className={styles.readyCircle} aria-hidden="true" />
              )}
              <span>{item.label}</span>
              <span className={styles.optionalTag}>{t('optional')}</span>
            </li>
          ))}
        </ul>
        {/* "Lưu nháp" chỉ còn ở hộp xác nhận cuối - như bản cũ (bước cuối), chốt 18/11/2026. */}
      </Card>
    </>
  );
}

/** Ảnh bìa = mặt trước (cùng luật với bảng ảnh), chưa có thì ảnh đầu tiên. */
function coverOf(media: CreatePreviewValues['media']): string | null {
  return (
    (media ?? []).find((item) => item?.type === VEHICLE_IMAGE_TYPE.FRONT)?.url ??
    media?.find((item) => item?.url)?.url ??
    null
  );
}

/**
 * "Xem trước trên Marketplace" - vẽ bằng CHÍNH thẻ xe của trang khách (`VehicleCard`): ảnh bìa,
 * tên, thông số, logo + tên gian hàng, tích xanh (gian hàng tuyến gói), giá. Một nguồn hình duy
 * nhất nên xem trước không thể lệch trang chủ. Thẻ chỉ để xem - không bấm, không vào tab.
 */
function MarketplacePreview({
  values,
  branchLabel,
  shop,
}: {
  values: CreatePreviewValues;
  branchLabel: string | null;
  shop: PreviewShop | null;
}) {
  const t = useTranslations('Vehicles.form.createAside');
  const listing = useMemo<PublicListing>(() => {
    const vehicleType = (values.vehicleType ?? VEHICLE_TYPE.CAR) as PublicListing['vehicleType'];
    return {
      id: 'preview',
      name: values.name?.trim() || t('namePlaceholder'),
      vehicleType,
      serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
      motorbikeCategory: null,
      seatCount: values.seatCount ?? null,
      fuelType: values.fuelType ?? null,
      transmission: (values.transmission ?? null) as PublicListing['transmission'],
      mainImageUrl: coverOf(values.media),
      imageCount: (values.media ?? []).filter((item) => item?.url).length,
      instantBookServiceTypes: [],
      weekdayPrice: values.weekdayPrice == null ? null : String(values.weekdayPrice),
      deliveryEnabled: Boolean(values.deliveryEnabled),
      noCollateral: false,
      vatInvoiceSupported: false,
      discountPercent: values.discountPercent ?? null,
      shopName: shop?.name ?? '-',
      shopSlug: shop?.slug ?? '',
      shopLogoUrl: shop?.logoUrl ?? null,
      shopProvince: shop?.province ?? null,
      shopVerified: shop?.verified ?? false,
      completedTripCount: 0,
      wardName: branchLabel,
      ratingAvg: null,
      ratingCount: 0,
    } as PublicListing;
  }, [values, shop, branchLabel, t]);

  return (
    <Card className={styles.card}>
      <h2 className={styles.previewTitle}>{t('previewTitle')}</h2>
      <div className={styles.previewCard} inert aria-hidden="true">
        <VehicleCard listing={listing} preview />
      </div>
    </Card>
  );
}
