import { memo, useCallback } from 'react';
import { Text, YStack } from 'tamagui';
import { BOOKING_SOURCE, BOOKING_SOURCE_VALUES, isMarketplaceBooking } from '@xeprime/types';
import { useDomainLabel } from '@/i18n/domain';
import { themed } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';

export type BookingSourceSkin = { bg: string; fg: string; border: string };

/**
 * Sắc của từng nguồn tự khai thác — native port of web `BookingSourceChip.module.css`: vãng lai xanh lá,
 * khách quen xanh dương, giới thiệu tím, mạng xã hội hồng, nền tảng khác cam, nguồn khác xanh ngọc
 * (web pha `color-mix`; app ghép chữ xanh lá trên nền xanh dương để vẫn khác năm sắc trên). Đỏ để
 * dành cho lỗi, không dùng.
 */
export const useBookingSourceSkins = themed<Record<string, BookingSourceSkin>>((colors) => ({
  [BOOKING_SOURCE.WALK_IN]: {
    bg: colors.successSurface,
    fg: colors.success,
    border: colors.successBorder,
  },
  [BOOKING_SOURCE.REPEAT_CUSTOMER]: {
    bg: colors.infoSurface,
    fg: colors.infoStrong,
    border: colors.infoBorder,
  },
  [BOOKING_SOURCE.REFERRAL]: {
    bg: colors.purpleSurface,
    fg: colors.purple,
    border: colors.purpleBorder,
  },
  [BOOKING_SOURCE.SOCIAL]: { bg: colors.pinkSurface, fg: colors.pink, border: colors.pinkBorder },
  [BOOKING_SOURCE.OTHER_PLATFORM]: {
    bg: colors.warningSurface,
    fg: colors.warningStrong,
    border: colors.warningBorder,
  },
  [BOOKING_SOURCE.OTHER]: { bg: colors.infoSurface, fg: colors.success, border: colors.successBorder },
}));

/** Sắc của một nguồn - mã lạ (dữ liệu mới hơn bản app) rơi về sắc "nguồn khác", như web. */
export function bookingSourceSkinOf(
  skins: Record<string, BookingSourceSkin>,
  source: string,
): BookingSourceSkin {
  const tone = (BOOKING_SOURCE_VALUES as readonly string[]).includes(source)
    ? source
    : BOOKING_SOURCE.OTHER;
  return skins[tone] ?? skins[BOOKING_SOURCE.OTHER]!;
}

/** Chữ của một nguồn đơn: nhãn tự nhập nếu có, không thì nhãn của mã nguồn — web `useBookingSourceText`. */
export function useBookingSourceText(): (source: string, sourceLabel?: string | null) => string {
  const domainLabel = useDomainLabel();
  return useCallback(
    (source: string, sourceLabel?: string | null) =>
      sourceLabel?.trim() || domainLabel('bookingSource', source),
    [domainLabel],
  );
}

/**
 * Viên NGUỒN ĐƠN (ADR 0110) — native port of web `components/data-display/BookingSourceChip`. Đơn qua
 * sàn là MẶC ĐỊNH nên KHÔNG có viên; các nguồn tự khai thác mỗi nguồn một màu, kèm tên kênh khi chủ
 * xe tự nhập. Cùng cỡ với `ServiceTypeChip` để hai viên đứng cạnh nhau đều nhau.
 */
export const BookingSourceChip = memo(function BookingSourceChip({
  source,
  sourceLabel,
  size = 'sm',
}: {
  source: string | null | undefined;
  sourceLabel?: string | null;
  size?: 'sm' | 'md';
}) {
  const text = useBookingSourceText();
  const skins = useBookingSourceSkins();
  if (!source || isMarketplaceBooking(source)) return null;
  const skin = bookingSourceSkinOf(skins, source);
  const type = size === 'md' ? typeScale.body : typeScale.label;
  return (
    <YStack
      alignSelf="flex-start"
      bg={skin.bg}
      px={space.sm}
      py={2}
      br={radius.card}
      bw={1}
      bc={skin.border}
      maxWidth={size === 'md' ? 180 : 140}
    >
      <Text
        col={skin.fg}
        fos={type.fontSize}
        lh={type.lineHeight}
        fow={fontWeight.medium}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {text(source, sourceLabel)}
      </Text>
    </YStack>
  );
});
