import { XStack, YStack } from 'tamagui';
import { Skeleton } from '@/components/ui/Skeleton';
import { HEADER_SHADOW, IS_PARTNER_APP } from '@/lib/app-kind';
import { elevation } from '@/theme/elevation';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/** Cùng số đo với `CustomerHeroCard` (Figma `24486:106613`): ảnh 40, nút cao 36, ô số bo 10. */
const AVATAR = 40;
const BUTTON_H = 36;
const STAT_H = 52;
const TAB_H = 32;
const GAP = 12;

/**
 * Khung chờ của hồ sơ khách - vẽ ĐÚNG hình dạng màn thật để dữ liệu về không làm trang nhảy:
 * khối đầu trắng (ảnh · tên · SĐT, hai nút Gọi/Zalo, bốn ô số liệu, dải bốn tab) rồi hai thẻ nội dung.
 * Dùng với `Screen padded={false}` như màn thật.
 */
export function CustomerDetailSkeleton() {
  const colors = useColors();
  return (
    <YStack>
      <YStack
        bg={colors.surface}
        pt={space.lg}
        px={space.lg}
        gap={GAP}
        style={IS_PARTNER_APP ? HEADER_SHADOW : elevation.xs}
      >
        <XStack ai="center" gap={GAP}>
          <Skeleton width={AVATAR} height={AVATAR} round />
          <YStack f={1} gap={space.xs}>
            <Skeleton width="45%" height={16} />
            <Skeleton width="32%" height={12} />
          </YStack>
        </XStack>

        <XStack gap={GAP}>
          <Skeleton width={96} height={BUTTON_H} />
          <Skeleton width={96} height={BUTTON_H} />
        </XStack>

        <XStack gap={space.sm}>
          {[0, 1, 2, 3].map((i) => (
            <YStack key={i} f={1} flexBasis={0}>
              <Skeleton height={STAT_H} />
            </YStack>
          ))}
        </XStack>

        <XStack gap={space.sm} pb={space.xs}>
          {[0, 1, 2, 3].map((i) => (
            <YStack key={i} f={1} flexBasis={0} ai="center" jc="center" h={TAB_H}>
              <Skeleton width="70%" height={14} />
            </YStack>
          ))}
        </XStack>
      </YStack>

      <YStack p={space.lg} gap={space.lg}>
        {[0, 1].map((i) => (
          <YStack
            key={i}
            bg={colors.surface}
            br={radius.lg}
            bw={1}
            bc={colors.border}
            p={space.lg}
            gap={GAP}
          >
            <XStack jc="space-between" ai="center">
              <Skeleton width="40%" height={18} />
              <Skeleton width="22%" height={22} round />
            </XStack>
            <Skeleton height={64} />
            <Skeleton width="65%" height={13} />
          </YStack>
        ))}
      </YStack>
    </YStack>
  );
}
