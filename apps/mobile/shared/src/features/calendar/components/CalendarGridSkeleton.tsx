import { memo } from 'react';
import { useWindowDimensions } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Skeleton } from '@/components/ui/Skeleton';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { useTranslations } from 'use-intl';
import { useCalSurface } from '../calendar-tone';
import { GRID_METRICS } from './CalendarTimeline';

/** Số hàng vẽ sẵn - đủ phủ một màn cao, thừa thì bị cắt chứ không để hở đáy. */
const ROWS = 7;
/** Thẻ giả đặt theo hàng (ô bắt đầu, số ô) - tất định, không `Math.random()`. */
const FAKE_CARDS: ReadonlyArray<readonly [number, number] | null> = [
  [0, 2],
  [1, 1],
  null,
  [2, 2],
  [0, 1],
  [1, 3],
  null,
];

/**
 * Khung chờ của LƯỚI LỊCH - cùng hình với lưới thật (người dùng 28/11/2026): cột "Xe" 80, hàng ngày
 * hiện 3 ô trọn + một mẩu ô thứ tư, hàng cao `rowHeight`, thẻ đơn giả bo 12 có vạch màu trái và
 * 4 dòng chữ như thẻ thật - lúc dữ liệu về bố cục không nhảy.
 *
 * Bề rộng ô ngày tính đúng công thức của lưới từ bề ngang màn hình (`useWindowDimensions`): khung
 * chờ dựng TRƯỚC khi vùng lưới được đo.
 */
export const CalendarGridSkeleton = memo(function CalendarGridSkeleton() {
  const CAL_SURFACE = useCalSurface();
  const colors = useColors();
  const t = useTranslations('Calendar');
  const { width: screenW } = useWindowDimensions();
  const { headerHeight, rowHeight, resourceWidth, minDayWidth, visibleDays, nextDayPeek } =
    GRID_METRICS;
  const dayW = Math.max(minDayWidth, Math.floor((screenW - resourceWidth - nextDayPeek) / visibleDays));
  const dayCount = visibleDays + 1;

  return (
    <XStack f={1} bg={colors.surface} ov="hidden" accessibilityLabel={t('grid.loadingAriaLabel')} accessible>
      {/* ── Cột xe ─────────────────────────────────────────────────────── */}
      <YStack w={resourceWidth} borderRightWidth={1} borderColor={CAL_SURFACE.line}>
        <XStack
          h={headerHeight}
          ai="center"
          px={8}
          bg={colors.background}
          borderTopWidth={1}
          borderBottomWidth={1}
          borderColor={CAL_SURFACE.line}
        >
          <Skeleton width={22} height={12} />
        </XStack>
        {Array.from({ length: ROWS }, (_, row) => (
          <YStack
            key={row}
            h={rowHeight}
            jc="center"
            gap={6}
            px={8}
            borderBottomWidth={1}
            borderColor={CAL_SURFACE.line}
          >
            <YStack w={63} h={40} br={8} ov="hidden">
              <Skeleton fill />
            </YStack>
            <Skeleton width="85%" height={10} />
            <Skeleton width="65%" height={10} />
          </YStack>
        ))}
      </YStack>

      {/* ── Dải ngày: 3 ô trọn + mẩu ô thứ tư ─────────────────────────── */}
      <YStack f={1} ov="hidden">
        <XStack
          h={headerHeight}
          bg={colors.background}
          borderTopWidth={1}
          borderBottomWidth={1}
          borderColor={CAL_SURFACE.line}
        >
          {Array.from({ length: dayCount }, (_, day) => (
            <YStack key={day} w={dayW} ai="center" jc="center" gap={4}>
              <Skeleton width={18} height={9} />
              <Skeleton width={16} height={11} />
            </YStack>
          ))}
        </XStack>

        {Array.from({ length: ROWS }, (_, row) => {
          const card = FAKE_CARDS[row % FAKE_CARDS.length];
          return (
            <XStack key={row} h={rowHeight} borderBottomWidth={1} borderColor={CAL_SURFACE.line}>
              {Array.from({ length: dayCount }, (_, day) => (
                <YStack
                  key={day}
                  w={dayW}
                  h="100%"
                  borderRightWidth={1}
                  borderColor={CAL_SURFACE.line}
                />
              ))}
              {card ? (
                <XStack
                  position="absolute"
                  top={5}
                  bottom={5}
                  left={card[0] * dayW + 2}
                  w={card[1] * dayW - 4}
                  br={12}
                  bg={colors.background}
                  ai="center"
                  gap={6}
                  pr={8}
                  ov="hidden"
                >
                  <YStack w={4} h={32} borderTopRightRadius={12} borderBottomRightRadius={12} ov="hidden">
                    <Skeleton fill />
                  </YStack>
                  <YStack f={1} gap={6}>
                    <Skeleton width="55%" height={9} />
                    <Skeleton width={56} height={14} />
                    <Skeleton width="70%" height={11} />
                    <Skeleton width="50%" height={9} />
                  </YStack>
                </XStack>
              ) : null}
            </XStack>
          );
        })}
      </YStack>
    </XStack>
  );
});

/**
 * Khung chờ của LỊCH THÁNG - cùng hình `CalendarMonthView` (Figma "30-Day Fleet Heatmap"
 * `24729:78597`: thẻ đệm 9, hàng thứ, 6 tuần × 7 ô cao 50 cách 4) + khối ngày bên dưới, để lúc
 * dữ liệu về bố cục không nhảy.
 */
export const CalendarMonthSkeleton = memo(function CalendarMonthSkeleton() {
  const colors = useColors();
  return (
    <YStack px={layout.screenX} gap={16}>
      <YStack p={9} gap={4} br={radius.card} bw={1} bc={colors.border} bg={colors.surface}>
        <XStack gap={4}>
          {Array.from({ length: 7 }, (_, i) => (
            <YStack key={i} f={1} ai="center" py={2}>
              <Skeleton width={18} height={10} />
            </YStack>
          ))}
        </XStack>
        {Array.from({ length: 6 }, (_, week) => (
          <XStack key={week} gap={4}>
            {Array.from({ length: 7 }, (_, day) => (
              <YStack key={day} f={1} h={50} br={radius.sm} ov="hidden">
                <Skeleton fill />
              </YStack>
            ))}
          </XStack>
        ))}
      </YStack>
      <YStack p={12} gap={8} br={radius.card} bw={1} bc={colors.border} bg={colors.surface}>
        <Skeleton width="55%" height={14} />
        {Array.from({ length: 3 }, (_, i) => (
          <XStack key={i} jc="space-between" ai="center" py={4}>
            <YStack gap={6} f={1}>
              <Skeleton width="60%" height={12} />
              <Skeleton width="35%" height={10} />
            </YStack>
            <Skeleton width={64} height={20} />
          </XStack>
        ))}
      </YStack>
    </YStack>
  );
});
