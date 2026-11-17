import { Ionicons } from '@/components/icons/Ionicons';
import { Text, XStack, YStack } from 'tamagui';
import { memo, useState } from 'react';
import { useTranslations } from 'use-intl';
import { Card } from '@/components/ui/Card';
import { VehicleCardSkeleton } from '@/components/ui/Skeleton';
import { useDomainLabel } from '@/i18n/domain';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, iconSize, radius, space } from '@/theme/tokens';
import { useSearchExperience } from '../search-context';
import { RECOMMENDED_LIMIT, useRecommendedListings } from '../hooks/use-recommended-listings';
import type { PublicListing } from '../api';
import { SectionError } from './SectionError';
import { HomeCarousel } from './home/HomeCarousel';
import { HomeSectionHeading } from './home/HomeSectionHeading';
import { OutlineAction } from './home/GradientButton';
import { VehicleCard } from './VehicleCard';
import { ResponsiveGrid } from '@/components/layout/ResponsiveGrid';
import { useIsTabletLayout } from '@/theme/use-content-width';

/** Bản tablet của web: lưới 2 cột, tối đa 2 hàng. */
const TABLET_GRID_COLUMNS = 2;
const TABLET_GRID_ITEMS = 4;

interface VehiclePreviewProps {
  /** Vắng mặt = thẻ xe chỉ hiển thị — trang chi tiết (MKT-04) chưa dựng. */
  onOpenListing?: (listing: PublicListing, serviceType: string | undefined) => void;
  /** Vắng mặt = ẩn "Khám phá xe" — màn kết quả tìm xe (MKT-03) chưa dựng. */
  onExplore?: () => void;
}

/**
 * Khối "Xe phù hợp với bạn" (ADR 0043).
 *
 * ## Nó xếp hạng thế nào
 *
 * Backend (`GET /public/listings/recommended`) xếp hai tầng: BẬC ĐỊA LÝ trước (đúng tỉnh →
 * cùng vùng → còn lại), rồi `rank_score` — điểm gộp từ chất lượng Bayes, số chuyến đã chạy,
 * độ đầy hồ sơ và độ mới. Mỗi gian hàng tối đa hai xe.
 *
 * ## Tỉnh là ƯU TIÊN, không phải bộ lọc
 *
 * Đây là khác biệt so với bản trước, và là lý do endpoint này tồn tại riêng. Trước đây khối
 * gọi `/public/listings` với `provinceCode` — một BỘ LỌC — nên khách ở tỉnh chưa có xe thấy
 * một khối rỗng. Giờ không xe nào bị loại, chỉ đổi thứ tự; và khi phải bù xe ngoài tỉnh thì
 * khối NÓI RA (`meta.mixedProvinces`) thay vì để người xem tự phát hiện.
 *
 * ## Tỉnh lấy từ đâu
 *
 * `filters.provinceCode` (đã áp) trước, rồi `draft.provinceCode` — tỉnh mà thẻ tìm kiếm đang
 * hiện nhưng khách CHƯA bấm "Tìm xe". Đọc bản nháp ở đây an toàn đúng vì nó không lọc: nếu
 * ghi nó vào bộ lọc thì xe biến mất, còn ở đây nó chỉ đẩy xe gần lên trước. Bỏ qua nó chính
 * là lỗi ADR 0043 mở đầu bằng — viên địa điểm ghi "Hà Nội" còn danh sách mở đầu bằng An Giang.
 *
 * Hỏng khối này không được làm hỏng cả trang chủ — lỗi hiện một hộp gọn, các mục bên dưới
 * vẫn dùng được.
 *
 * Dựng bằng `map` chứ không `FlatList`: trang chủ đã cuộn trong `ScrollView` bên ngoài, lồng
 * danh sách ảo hoá vào đó là hỏng đo chiều cao và mất luôn phần ảo hoá.
 */
function VehiclePreviewImpl({ onOpenListing, onExplore }: VehiclePreviewProps) {
  const colors = useColors();
  const t = useTranslations('Marketplace.available');
  const tHome = useTranslations('Home.featured');
  const domainLabel = useDomainLabel();
  const { filters, draft, provinceName } = useSearchExperience();
  /** Thẻ đang ở GIỮA băng chuyền — hiện sẵn trạng thái hover của web (Card highlighted). */
  const [focused, setFocused] = useState(0);
  const tablet = useIsTabletLayout();

  /*
   * Liệt kê ĐÚNG năm chiều, không trải cả `filters`.
   *
   * Trải cả bộ thì `hourly` (tab "Thuê theo giờ") lọt vào query và khối này chỉ còn xe CÓ giá
   * thuê giờ — web hiện 29 xe, app hiện 19. Web cố ý chỉ lấy ngữ cảnh từ thẻ tìm kiếm; các
   * chiều facet sâu để dành cho màn kết quả tìm xe.
   */
  const { data, isLoading, isError, error } = useRecommendedListings({
    serviceType: filters.serviceType,
    vehicleType: filters.vehicleType,
    nearProvinceCode: filters.provinceCode ?? draft.provinceCode ?? null,
    pickupAt: filters.pickupAt,
    returnAt: filters.returnAt,
    limit: RECOMMENDED_LIMIT,
  });

  const items = data?.data ?? [];
  /*
   * Tên tỉnh tra từ danh mục điểm đến. Không tra ra thì khối IM LẶNG về địa lý thay vì in một
   * mã hai chữ số — mã là dữ liệu, không phải chữ cho người đọc.
   */
  const nearName = data?.meta.nearProvinceCode
    ? provinceName(data.meta.nearProvinceCode)
    : undefined;
  const serviceLabel = filters.serviceType ? domainLabel('serviceType', filters.serviceType) : null;

  return (
    <YStack gap={layout.section}>
      <HomeSectionHeading
        kicker={tHome('kicker')}
        // Người dùng 04/11/2026: bỏ dòng "Xe phù hợp cho mọi hành trình" — chỉ giữ dòng "Xe tiêu biểu".
        {...(serviceLabel ? { title: t('titleWithService', { service: serviceLabel }) } : {})}
      />

      {/*
        Khi phải bù xe ở tỉnh khác, khối NÓI RA điều đó — hứa "xe ở Hà Nội" rồi hiện xe An Giang là
        cách nhanh nhất mất lòng tin. Trường hợp thường (đủ xe đúng tỉnh) thì im lặng, như web v2.
        Dải này chỉ dựng khi tra được TÊN tỉnh: không có tên thì không có câu nào đọc được.
      */}
      {nearName && data?.meta.mixedProvinces ? (
        <XStack
          ai="flex-start"
          gap={space.xs}
          px={space.sm}
          py={space.xs}
          br={radius.md}
          bg={colors.surfaceMuted}
        >
          <Ionicons
            name="location-outline"
            size={iconSize.sm}
            color={colors.accentText}
            accessibilityElementsHidden
          />
          <Text f={1} col={colors.textMuted} fos={fontSize.label}>
            {t('nearProvinceMixed', { province: nearName })}
          </Text>
        </XStack>
      ) : null}

      {isError ? (
        <SectionError
          title={t('loadError')}
          error={error}
          // Web đính nút "Mở trang tìm xe" vào cảnh báo: khối hỏng không có nghĩa là chợ hỏng.
          {...(onExplore ? { action: { label: t('openSearch'), onPress: onExplore } } : {})}
        />
      ) : isLoading ? (
        <VehicleCardSkeleton />
      ) : items.length === 0 ? (
        <Card tone="muted" lift="flat">
          <Text col={colors.textMuted} fos={fontSize.body} ta="center">
            {serviceLabel ? t('emptyForService', { service: serviceLabel }) : t('empty')}
          </Text>
        </Card>
      ) : tablet ? (
        // Máy tính bảng: lưới tĩnh 2 cột × 2 hàng, 4 xe đầu — bản tablet của web
        // (`HomeCarousel layout="grid" responsiveGrid` ≤1024px ẩn từ thẻ thứ 5).
        <ResponsiveGrid columns={TABLET_GRID_COLUMNS}>
          {items.slice(0, TABLET_GRID_ITEMS).map((listing) => (
            <VehicleCard
              key={listing.id}
              listing={listing}
              {...(onOpenListing ? { onPress: onOpenListing } : {})}
            />
          ))}
        </ResponsiveGrid>
      ) : (
        // Băng chuyền thẻ-ở-giữa — đúng trình bày mobile của web v2 (`HomeCarousel` dưới 640px).
        <HomeCarousel accessibilityLabel={tHome('title')} onActiveChange={setFocused} coverflow>
          {items.map((listing, index) => (
            <VehicleCard
              key={listing.id}
              listing={listing}
              highlighted={index === focused}
              {...(onOpenListing ? { onPress: onOpenListing } : {})}
            />
          ))}
        </HomeCarousel>
      )}

      {/* "Xem tất cả xe" dưới băng chuyền, trải hết bề ngang — như web ở bề rộng điện thoại. */}
      {onExplore ? <OutlineAction label={tHome('viewAll')} onPress={onExplore} fullWidth /> : null}
    </YStack>
  );
}

/**
 * Bọc `memo`: trang chủ chạy lại vì đủ thứ (cuộn, ô tìm kiếm, banner) — khối này chỉ cần dựng lại
 * khi dữ liệu của nó đổi. Nơi gọi truyền hàm ỔN ĐỊNH (`useCallback`).
 */
export const VehiclePreview = memo(VehiclePreviewImpl);
