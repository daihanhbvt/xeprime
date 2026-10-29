import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import Svg, { Path } from 'react-native-svg';
import { Text, XStack, YStack } from 'tamagui';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import { useAppFormat } from '@/i18n/use-app-format';
import { elevation } from '@/theme/elevation';
import { useTranslations } from 'use-intl';
import { CardHighlightOverlay, useCardHighlightBorder } from '@/components/ui/CardHighlight';
import { ListRowSkeleton } from '@/components/ui/Skeleton';
import { layout } from '@/theme/layout';
import { useAppScheme, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import { useFeaturedReviews } from '../../hooks/use-marketplace-data';
import type { FeaturedReview } from '../../api';
import { SectionError } from '../SectionError';
import { HomeCarousel } from './HomeCarousel';
import { HomeSectionHeading } from './HomeSectionHeading';
import { STAR_ART } from './home-art';

/** Cùng con số với web. Trần của server là 12. */
const LIMIT = 6;

/**
 * "Đánh giá — Khách hàng nói gì về XePrime" (design v2, ADR 0062).
 *
 * Lời nhận xét THẬT, đã công khai, do server chọn (`/public/reviews/featured`). Chưa có đánh giá
 * nào đủ điều kiện thì ẩn cả khối — trang chủ không dựng câu trích dẫn mẫu. Cùng luật với web.
 */
export function CustomerReviews() {
  const t = useTranslations('Home.reviews');
  const { data, isLoading, isError, error } = useFeaturedReviews(LIMIT);
  const reviews = data ?? [];
  const [focused, setFocused] = useState(0);

  if (!isLoading && !isError && reviews.length === 0) return null;

  return (
    <YStack gap={layout.section}>
      <HomeSectionHeading kicker={t('kicker')} title={t('title')} />

      {isError ? (
        <SectionError title={t('loadError')} error={error} />
      ) : isLoading ? (
        <YStack gap={space.sm}>
          {Array.from({ length: 2 }, (_, i) => (
            <ListRowSkeleton key={i} />
          ))}
        </YStack>
      ) : (
        <HomeCarousel accessibilityLabel={t('title')} onActiveChange={setFocused}>
          {reviews.map((review, index) => (
            <ReviewCard key={review.id} review={review} highlighted={index === focused} />
          ))}
        </HomeCarousel>
      )}
    </YStack>
  );
}

const STARS = [1, 2, 3, 4, 5] as const;
const CARD_RADIUS = toPx(XP_TOKENS['border-radius-card']);
/**
 * Dấu trích dẫn `/home/quote.svg` (boxicons quote-left-filled), 20px, tô `color-border-strong`
 * SÁNG (#d5d7da) ở cả hai chế độ — web hiện cùng tấm SVG đó trên thẻ tối.
 */
const QUOTE_FILL = XP_TOKENS['color-border-strong'];
/** Đường vẽ của dấu trích dẫn. */
const QUOTE_PATH =
  'M17.5088 8.33325H15.1338C15.3588 7.48325 15.9754 6.24159 17.7088 5.80825L18.3421 5.64992V3.33325H17.5088C15.1921 3.33325 13.4171 3.97492 12.2504 5.24159C10.6754 6.94992 10.8338 9.14159 10.8421 9.16659V14.9999C10.8421 15.9166 11.5921 16.6666 12.5088 16.6666H17.5088C18.4254 16.6666 19.1754 15.9166 19.1754 14.9999V9.99992C19.1754 9.08325 18.4254 8.33325 17.5088 8.33325ZM7.50875 8.33325H5.13375C5.35875 7.48325 5.97542 6.24159 7.70875 5.80825L8.34209 5.64992V3.33325H7.50875C5.19209 3.33325 3.41709 3.97492 2.25042 5.24159C0.675421 6.94992 0.833754 9.14159 0.842088 9.16659V14.9999C0.842088 15.9166 1.59209 16.6666 2.50875 16.6666H7.50875C8.42542 16.6666 9.17542 15.9166 9.17542 14.9999V9.99992C9.17542 9.08325 8.42542 8.33325 7.50875 8.33325Z';

/**
 * Thẻ đánh giá — bản native của `.card` trong `CustomerReviews.module.css` web: bo 16, đệm 16,
 * các hàng cách 12; 5 sao 24px, dấu trích dẫn 20px, lời nhận xét (`text-secondary`, tối đa 5
 * dòng), người đánh giá với avatar chữ cái 32px nền `primary-muted`.
 */
function ReviewCard({
  review,
  highlighted,
}: {
  review: FeaturedReview;
  /** Thẻ đang ở GIỮA băng chuyền — trạng thái nổi DÙNG CHUNG (`CardHighlight`). */
  highlighted: boolean;
}) {
  const colors = useColors();
  const highlightBorder = useCardHighlightBorder();
  const { scheme } = useAppScheme();
  const t = useTranslations('Home.reviews');
  const fmt = useAppFormat();
  const initial = review.customerName.trim().charAt(0).toLocaleUpperCase() || '?';

  return (
    <YStack
      f={1}
      p={space.md}
      gap={12}
      br={CARD_RADIUS}
      bw={1}
      bc={highlighted ? highlightBorder : colors.surface}
      bg={colors.surface}
      style={scheme === 'dark' ? undefined : elevation.card}
    >
      {highlighted ? <CardHighlightOverlay radius={CARD_RADIUS} /> : null}
      <XStack
        gap={space.xs}
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('ratingAria', { rating: fmt.rating(review.rating) })}
      >
        {STARS.map((n) => (
          <Ionicons
            key={n}
            name="star"
            size={24}
            color={STAR_ART}
            style={n > review.rating ? { opacity: 0.35 } : undefined}
          />
        ))}
      </XStack>
      <Svg width={20} height={20} viewBox="0 0 20 20">
        <Path d={QUOTE_PATH} fill={QUOTE_FILL} />
      </Svg>
      <Text col={colors.textMuted} fos={fontSize.body} numberOfLines={5}>
        {review.comment}
      </Text>
      <XStack ai="center" gap={12} mt="auto">
        <YStack
          w={32}
          h={32}
          br={16}
          bg={colors.primaryMuted}
          ai="center"
          jc="center"
          accessibilityElementsHidden
        >
          <Text col={colors.primaryStrong} fos={fontSize.body} fow={fontWeight.semibold}>
            {initial}
          </Text>
        </YStack>
        <YStack f={1} minWidth={0}>
          <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold} numberOfLines={1}>
            {review.customerName}
          </Text>
          {review.customerTripCount > 0 ? (
            <Text col={colors.textMuted} fos={fontSize.body}>
              {t('rentedTimes', { count: review.customerTripCount })}
            </Text>
          ) : null}
        </YStack>
      </XStack>
    </YStack>
  );
}
