import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Card } from '@/components/ui/Card';
import { VehicleCardSkeleton } from '@/components/ui/Skeleton';
import { useDomainLabel } from '@/i18n/domain';
import { layout } from '@/theme/layout';
import { colors, fontSize, iconSize, radius, space } from '@/theme/tokens';
import { useSearchExperience } from '../search-context';
import {
  RECOMMENDED_LIMIT,
  useRecommendedListings,
} from '../hooks/use-recommended-listings';
import type { PublicListing } from '../api';
import { SectionError } from './SectionError';
import { SectionHeader } from './SectionHeader';
import { VehicleCard } from './VehicleCard';

const SKELETON_COUNT = 3;

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
export function VehiclePreview({ onOpenListing, onExplore }: VehiclePreviewProps) {
  const t = useTranslations('Marketplace.available');
  const domainLabel = useDomainLabel();
  const { filters, draft, provinceName } = useSearchExperience();

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
    <YStack gap={layout.block}>
      <SectionHeader
        title={serviceLabel ? t('titleWithService', { service: serviceLabel }) : t('title')}
        {...(data ? { count: t('count', { count: data.meta.total }) } : {})}
        {...(onExplore ? { action: { label: t('exploreAll'), onPress: onExplore } } : {})}
      />

      {/*
        Nói ra tỉnh nào đang được ưu tiên — và nói THÊM khi phải bù xe tỉnh khác.

        Hứa "xe ở Hà Nội" rồi hiện xe An Giang là cách nhanh nhất mất lòng tin vào cả trang.
        Dải này chỉ dựng khi tra được TÊN tỉnh: không có tên thì không có câu nào đọc được.
      */}
      {nearName ? (
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
            color={colors.primaryActive}
            accessibilityElementsHidden
          />
          <Text f={1} col={colors.textMuted} fos={fontSize.label}>
            {data?.meta.mixedProvinces
              ? t('nearProvinceMixed', { province: nearName })
              : t('nearProvince', { province: nearName })}
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
        <YStack gap={space.md}>
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <VehicleCardSkeleton key={i} />
          ))}
        </YStack>
      ) : items.length === 0 ? (
        <Card tone="muted" lift="flat">
          <Text col={colors.textMuted} fos={fontSize.body} ta="center">
            {serviceLabel ? t('emptyForService', { service: serviceLabel }) : t('empty')}
          </Text>
        </Card>
      ) : (
        <YStack gap={space.md}>
          {items.map((listing) => (
            <VehicleCard
              key={listing.id}
              listing={listing}
              {...(onOpenListing ? { onPress: onOpenListing } : {})}
            />
          ))}
        </YStack>
      )}
    </YStack>
  );
}
