import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { STALE_TIME } from '@xeprime/api-client';
import { Card } from '@/components/ui/Card';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { queryKeys } from '@/queries/query-keys';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import { marketplaceApi, type ShopReviewItem } from '../api';

/** Web lấy 6 — vừa một màn cuộn, đủ để đọc được giọng của gian hàng mà không thành một trang riêng. */
const SHOP_REVIEW_LIMIT = 6;

/**
 * Đánh giá của CẢ gian hàng.
 *
 * Khác khối đánh giá trên trang một chiếc xe: khách chọn gian hàng trước rồi mới chọn xe, nên câu
 * hỏi "chỗ này làm ăn thế nào" phải trả lời được ở tầng gian hàng.
 *
 * Mỗi thẻ dẫn về ĐÚNG chiếc xe được đánh giá — một lời khen về chiếc Vios không nói gì về chiếc
 * Fortuner, và người đọc đang tìm xe chứ không đọc hồi ký gian hàng.
 *
 * Lỗi tải thì DẤU KHỐI đi, không dựng thẻ lỗi: đánh giá là thông tin phụ trợ, một dải đỏ ở đây
 * làm hỏng cả trang vì một thứ không ai đang chờ.
 */
export function ShopReviews({ slug }: { slug: string }) {
  const t = useTranslations('Shops.reviews');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();

  const query = useQuery({
    queryKey: queryKeys.marketplace.shopReviews(slug, SHOP_REVIEW_LIMIT),
    queryFn: () => marketplaceApi.shopReviews(slug, SHOP_REVIEW_LIMIT),
    staleTime: STALE_TIME.REFERENCE,
  });

  if (query.isPending) {
    return (
      <Card>
        <MiniRowsSkeleton rows={3} />
      </Card>
    );
  }

  if (query.isError || !query.data) return null;

  const { summary, data } = query.data;
  const title =
    summary.ratingCount > 0 ? t('titleWithCount', { count: summary.ratingCount }) : t('title');

  return (
    <Card>
      <YStack gap={space.md} accessibilityLabel={t('sectionLabel')}>
        <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold}>
          {title}
        </Text>

        {data.length === 0 ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('empty')}
          </Text>
        ) : (
          data.map((review) => (
            <ReviewRow
              key={review.id}
              review={review}
              vehicleLabel={t('vehicle', { name: review.vehicleName })}
              date={fmt.date(review.createdAt)}
              onPress={() => navigateOnce(ROUTES.explore.listingDetail(review.vehicleId))}
            />
          ))
        )}
      </YStack>
    </Card>
  );
}

function ReviewRow({
  review,
  vehicleLabel,
  date,
  onPress,
}: {
  review: ShopReviewItem;
  vehicleLabel: string;
  date: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={vehicleLabel} onPress={onPress}>
      <YStack gap={space.xs}>
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold} numberOfLines={1}>
            {review.customerName}
          </Text>
          <XStack ai="center" gap={2}>
            <Ionicons name="star" size={iconSize.xs} color={colors.primary} />
            <Text col={colors.textMuted} fos={fontSize.label}>
              {review.rating}
            </Text>
          </XStack>
        </XStack>

        {review.comment ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={3}>
            {review.comment}
          </Text>
        ) : null}

        <XStack ai="center" jc="space-between" gap={space.sm}>
          <Text col={colors.placeholder} fos={fontSize.label} numberOfLines={1} flexShrink={1}>
            {vehicleLabel}
          </Text>
          <Text col={colors.placeholder} fos={fontSize.label}>
            {date}
          </Text>
        </XStack>
      </YStack>
    </Pressable>
  );
}
