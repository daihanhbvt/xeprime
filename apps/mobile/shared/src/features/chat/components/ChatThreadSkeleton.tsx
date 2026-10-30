import { XStack, YStack } from 'tamagui';
import { Skeleton } from '@/components/ui/Skeleton';
import { space } from '@/theme/tokens';

/**
 * Khung chờ cho vùng trò chuyện — bong bóng xen kẽ hai phía như một hội thoại thật, thay vòng
 * quay giữa màn. Khối nằm sát ĐÁY như danh sách tin (tin mới nhất ở dưới), nên lúc tin về không
 * có cú nhảy từ giữa màn xuống chân.
 */
const BUBBLES: readonly { mine: boolean; width: `${number}%`; height: number }[] = [
  { mine: false, width: '62%', height: 44 },
  { mine: false, width: '44%', height: 36 },
  { mine: true, width: '56%', height: 44 },
  { mine: false, width: '70%', height: 60 },
  { mine: true, width: '40%', height: 36 },
  { mine: true, width: '64%', height: 44 },
];

export function ChatThreadSkeleton() {
  return (
    <YStack f={1} jc="flex-end" px={space.md} py={space.md} gap={space.sm}>
      {BUBBLES.map((bubble, index) => (
        <XStack key={index} jc={bubble.mine ? 'flex-end' : 'flex-start'}>
          <YStack w={bubble.width}>
            <Skeleton height={bubble.height} />
          </YStack>
        </XStack>
      ))}
    </YStack>
  );
}
