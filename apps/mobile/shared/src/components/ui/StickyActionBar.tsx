import type { ReactNode } from 'react';
import { XStack, YStack } from 'tamagui';
import { space } from '@/theme/tokens';

/**
 * Nội dung thanh nút DÍNH ĐÁY theo khuôn app KHÁCH (thanh CTA của chi tiết xe). Đặt vào `footer`
 * của `Screen` - KHUNG (nền, viền trên, lề, đệm vạch home, bàn phím) đã do `Screen` vẽ, nên ở đây
 * KHÔNG vẽ khung thứ hai, chỉ xếp hàng nút.
 *
 * `secondary`: các nút phụ co vừa chữ bên TRÁI; `primary`: nút chính lấy phần còn lại bên PHẢI -
 * cùng thứ tự tấm huỷ chuyến của app khách. `extra`: một dòng phụ phía trên (tổng tiền, gợi ý).
 */
export function StickyActionBar({
  primary,
  secondary,
  extra,
}: {
  primary?: ReactNode;
  secondary?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <YStack gap={space.sm}>
      {extra}
      <XStack gap={space.sm} ai="center">
        {secondary ? (
          <XStack flexShrink={0} gap={space.sm}>
            {secondary}
          </XStack>
        ) : null}
        {primary ? <YStack f={1}>{primary}</YStack> : null}
      </XStack>
    </YStack>
  );
}
