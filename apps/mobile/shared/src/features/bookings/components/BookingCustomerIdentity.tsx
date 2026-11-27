import { Linking } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { telHref } from '@xeprime/domain';
import { TENANT_CUSTOMER_RETURNING_MIN_RENTALS } from '@xeprime/types';
import { Avatar } from '@/components/ui/Avatar';
import { Pill } from '@/components/ui/Pill';
import { useColors } from '@/theme/ThemeProvider';
import { FONT_FAMILY } from '@/theme/fonts';
import { typeScale } from '@/theme/tokens';
import type { BookingDetail } from '../api';

/** Figma "Seller Information": ảnh 48 cách chữ 12; tên ↔ viên cách 8. */
const AVATAR = 48;
const AVATAR_GAP = 12;
const NAME_GAP = 8;

/**
 * Danh tính khách của MỘT đơn - Figma "Seller Information" (`24512:133667` tấm Công nợ,
 * `24512:134148` tấm Thu tiền): ảnh 48 · tên 16/24 đậm vừa (mở hồ sơ khách khi có quyền) · viên
 * "Khách quen" · SĐT 14/20 gọi được. Dùng chung để hai tấm không vẽ hai bản.
 *
 * API đơn chưa mang ảnh khách - ảnh là chữ cái đầu.
 */
export function BookingCustomerIdentity({
  booking,
  onViewProfile,
}: {
  booking: Pick<BookingDetail, 'customerName' | 'customerPhone' | 'customerCompletedRentals'>;
  onViewProfile?: (() => void) | undefined;
}) {
  const colors = useColors();
  const tSide = useTranslations('Bookings.detailPage.side');
  const tel = telHref(booking.customerPhone);
  const returning =
    booking.customerCompletedRentals != null &&
    booking.customerCompletedRentals >= TENANT_CUSTOMER_RETURNING_MIN_RENTALS;

  return (
    <XStack ai="center" gap={AVATAR_GAP}>
      <Avatar name={booking.customerName} url={null} size={AVATAR} soft />
      <YStack f={1} minWidth={0}>
        <XStack ai="center" flexWrap="wrap" columnGap={NAME_GAP} rowGap={2}>
          <Text
            flexShrink={1}
            col={colors.text}
            fos={typeScale.title.fontSize}
            lh={typeScale.title.lineHeight}
            fontFamily={FONT_FAMILY.medium}
            numberOfLines={1}
            {...(onViewProfile
              ? {
                  onPress: onViewProfile,
                  accessibilityRole: 'link' as const,
                  accessibilityHint: tSide('viewProfile'),
                }
              : {})}
          >
            {booking.customerName}
          </Text>
          {returning ? <Pill label={tSide('returningCustomer')} tone="success" /> : null}
        </XStack>
        {booking.customerPhone ? (
          <Text
            alignSelf="flex-start"
            col={colors.placeholder}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            {...(tel ? { onPress: () => void Linking.openURL(tel), accessibilityRole: 'link' as const } : {})}
          >
            {booking.customerPhone}
          </Text>
        ) : (
          <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
            {tSide('noPhone')}
          </Text>
        )}
      </YStack>
    </XStack>
  );
}
