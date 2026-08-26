import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Card } from '@/components/ui/Card';
import { VehicleCardSkeleton } from '@/components/ui/Skeleton';
import { useDomainLabel } from '@/i18n/domain';
import { layout } from '@/theme/layout';
import { colors, fontSize, space } from '@/theme/tokens';
import { useSearchExperience } from '../search-context';
import { usePublicListings } from '../hooks/use-marketplace-data';
import type { PublicListing } from '../api';
import { SectionError } from './SectionError';
import { SectionHeader } from './SectionHeader';
import { VehicleCard } from './VehicleCard';

/** Trang chủ chỉ XEM TRƯỚC — tối đa 8 xe, không phân trang, không facet. Giống web. */
const PREVIEW_LIMIT = 8;
const SKELETON_COUNT = 3;

interface VehiclePreviewProps {
  /** Vắng mặt = thẻ xe chỉ hiển thị — trang chi tiết (MKT-04) chưa dựng. */
  onOpenListing?: (listing: PublicListing, serviceType: string | undefined) => void;
  /** Vắng mặt = ẩn "Khám phá xe" — màn kết quả tìm xe (MKT-03) chưa dựng. */
  onExplore?: () => void;
}

/**
 * Khối "Xe khả dụng".
 *
 * Đọc ngữ cảnh đã áp dụng từ thẻ tìm kiếm phía trên. Hỏng khối này không được làm hỏng cả
 * trang chủ — lỗi hiện một hộp gọn, các mục bên dưới vẫn dùng được.
 *
 * Dựng bằng `map` chứ không `FlatList`: trang chủ đã cuộn trong `ScrollView` bên ngoài, lồng
 * danh sách ảo hoá vào đó là hỏng đo chiều cao và mất luôn phần ảo hoá.
 */
export function VehiclePreview({ onOpenListing, onExplore }: VehiclePreviewProps) {
  const t = useTranslations('Marketplace.available');
  const domainLabel = useDomainLabel();
  const { filters } = useSearchExperience();

  /*
   * Liệt kê ĐÚNG năm chiều, không trải cả `filters`.
   *
   * Trải cả bộ thì `hourly` (tab "Thuê theo giờ") lọt vào query và khối này chỉ còn xe CÓ giá
   * thuê giờ — web hiện 29 xe, app hiện 19. Web cố ý chỉ lấy ngữ cảnh từ thẻ tìm kiếm; các
   * chiều facet sâu để dành cho màn kết quả tìm xe.
   */
  const { data, isLoading, isError, error } = usePublicListings({
    serviceType: filters.serviceType,
    vehicleType: filters.vehicleType,
    provinceCode: filters.provinceCode,
    pickupAt: filters.pickupAt,
    returnAt: filters.returnAt,
    page: 1,
    limit: PREVIEW_LIMIT,
  });

  const items = data?.listings ?? [];
  const serviceLabel = filters.serviceType ? domainLabel('serviceType', filters.serviceType) : null;

  return (
    <YStack gap={layout.block}>
      <SectionHeader
        title={serviceLabel ? t('titleWithService', { service: serviceLabel }) : t('title')}
        {...(data ? { count: t('count', { count: data.meta.total }) } : {})}
        {...(onExplore ? { action: { label: t('exploreAll'), onPress: onExplore } } : {})}
      />

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
