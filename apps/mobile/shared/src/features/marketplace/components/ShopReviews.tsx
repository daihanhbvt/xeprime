import { useQuery } from '@tanstack/react-query';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { STALE_TIME } from '@xeprime/api-client';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { Stars } from '@/components/ui/Stars';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { queryKeys } from '@/queries/query-keys';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { marketplaceApi, type ShopReviewItem } from '../api';

/** Web lấy 6 (`REVIEW_LIMIT`) — chỉ trang ĐẦU: bằng chứng xã hội, không phải kho lưu trữ. */
const SHOP_REVIEW_LIMIT = 6;

/** `.avatar` web: tròn 32, lề trên 7 để tâm avatar ngang tâm khối tên hai dòng. */
const REVIEWER_AVATAR = 32;
const AVATAR_TOP_OFFSET = 7;

/** `Stars size="lg"` web — Figma `20058:71283`: sao 20px. */
const STAR_SIZE = 20;

/** `.item` gap / `.vehicle` — `--xp-space-12`, line-height cố định 22 của `.date` / `.comment`. */
const ITEM_GAP = toPx(XP_TOKENS['space-12']);
const BODY_LINE = 22;

/** `.comment` cắt 4 dòng để một nhận xét dài không đẩy cả khối. */
const COMMENT_LINES = 4;

/**
 * "Đánh giá từ khách hàng" của CẢ gian hàng — bản native của web `ShopReviews` (#222, Figma
 * `20058:71273`), lấy bố cục ≤760px của web: một cột thẻ.
 *
 * Mỗi thẻ dẫn về ĐÚNG chiếc xe được đánh giá — trả lời "4 sao này là của xe nào".
 *
 * Lỗi tải thì DẤU KHỐI đi như web: đánh giá là thông tin phụ trợ, không làm hỏng cả trang.
 */
export function ShopReviews({ slug }: { slug: string }) {
  const colors = useColors();
  const t = useTranslations('Shops.reviews');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();

  const query = useQuery({
    queryKey: queryKeys.marketplace.shopReviews(slug, SHOP_REVIEW_LIMIT),
    queryFn: () => marketplaceApi.shopReviews(slug, SHOP_REVIEW_LIMIT),
    staleTime: STALE_TIME.REFERENCE,
  });

  if (query.isPending) return <MiniRowsSkeleton rows={3} />;
  if (query.isError || !query.data) return null;

  /*
   * `?? []`: phản hồi thiếu `data` vẫn là `query.data` hợp lệ với TanStack Query — đọc thẳng
   * `data.length` lúc đó làm vỡ cả trang gian hàng vì một khối phụ trợ.
   */
  const data = query.data.data ?? [];
  // Số đếm của tiêu đề lấy từ `meta.total` như web (tổng đánh giá của gian hàng).
  const total = query.data.meta?.total ?? 0;

  return (
    /* Vùng `.section` web: cột, gap `space-md`. */
    <YStack gap={space.md} accessibilityLabel={t('sectionLabel')}>
      {/* `.title` web: `font-size-lead` (20) semibold, màu `text`. */}
      <Text col={colors.text} fos={fontSize.lead} fow={fontWeight.semibold} accessibilityRole="header">
        {total > 0 ? t('titleWithCount', { count: total }) : t('title')}
      </Text>

      {data.length === 0 ? (
        /* `.empty` web: đệm lg, viền `border` 1px NÉT ĐỨT, bo `radius-card`, chữ `text-secondary` giữa. */
        <YStack
          p={space.lg}
          bw={1}
          bc={colors.border}
          borderStyle="dashed"
          br={radius.card}
          ai="center"
        >
          <Text col={colors.textMuted} fos={fontSize.body} ta="center">
            {t('empty')}
          </Text>
        </YStack>
      ) : (
        /* `.list` web ≤760px: một cột, gap `space-md`. */
        <YStack gap={space.md}>
          {data.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              date={fmt.date(review.createdAt)}
              vehicleLabel={t('vehicle', { name: review.vehicleName })}
              onOpenVehicle={() => navigateOnce(ROUTES.explore.listingDetail(review.vehicleId))}
            />
          ))}
        </YStack>
      )}
    </YStack>
  );
}

function ReviewCard({
  review,
  date,
  vehicleLabel,
  onOpenVehicle,
}: {
  review: ShopReviewItem;
  date: string;
  vehicleLabel: string;
  onOpenVehicle: () => void;
}) {
  const colors = useColors();

  return (
    /* `.item` web: thẻ RIÊNG mỗi đánh giá — nền `bg` (xám nhạt trên nền trang trắng), bo `radius-card`, đệm md, gap space-12. */
    <YStack p={space.md} br={radius.card} bg={colors.background} gap={ITEM_GAP}>
      {/* `.head` web: avatar · tên + ngày · năm sao bên phải, gap sm, căn trên. */}
      <XStack ai="flex-start" gap={space.sm}>
        {/*
          `.avatar` web: chữ cái đầu (KHÔNG ảnh thật — `customerName` đã được backend rút gọn để che
          danh tính), tròn 32, nền `primary-light`, chữ `primary-strong` body semibold.
        */}
        <YStack
          w={REVIEWER_AVATAR}
          h={REVIEWER_AVATAR}
          mt={AVATAR_TOP_OFFSET}
          marginRight={space.xs}
          br={radius.pill}
          bg={colors.primaryLight}
          ai="center"
          jc="center"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text col={colors.primaryStrong} fos={fontSize.body} fow={fontWeight.semibold}>
            {initialOf(review.customerName)}
          </Text>
        </YStack>

        {/* `.who` web: `.name` h4 semibold `text` (1 dòng) trên `.date` body `text-secondary`. */}
        <YStack f={1} minWidth={0}>
          <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.semibold} numberOfLines={1}>
            {review.customerName}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.body} lineHeight={BODY_LINE}>
            {date}
          </Text>
        </YStack>

        <Stars value={review.rating} size={STAR_SIZE} />
      </XStack>

      {/* `.comment` web: body `text-secondary`, line-height 22, cắt 4 dòng. */}
      {review.comment ? (
        <Text
          col={colors.textMuted}
          fos={fontSize.body}
          lineHeight={BODY_LINE}
          numberOfLines={COMMENT_LINES}
        >
          {review.comment}
        </Text>
      ) : null}

      {/* `.vehicle` web: liên kết về chiếc xe — body-sm medium màu `primary-hover`, 1 dòng, căn trái. */}
      <Pressable
        onPress={onOpenVehicle}
        accessibilityRole="link"
        accessibilityLabel={vehicleLabel}
        style={{ alignSelf: 'flex-start', maxWidth: '100%' }}
      >
        <Text col={colors.primaryHover} fos={fontSize.bodySm} fow={fontWeight.medium} numberOfLines={1}>
          {vehicleLabel}
        </Text>
      </Pressable>
    </YStack>
  );
}

/** Chữ cái đầu cho avatar — cùng luật `initialOf` của web (`[...value]` để không cắt đôi ký tự). */
function initialOf(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return '?';
  return ([...trimmed][0] ?? '?').toLocaleUpperCase('vi-VN');
}
