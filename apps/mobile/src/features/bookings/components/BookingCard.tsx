import { memo, useCallback, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BOOKING_STATUS_META, type BookingStatus } from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { Card } from '@/components/ui/Card';
import { DetailChevron } from '@/components/ui/DetailArrow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import type { BookingListItem } from '../api';

/**
 * MỘT ĐƠN trong danh sách đơn thuê — bản native của `BookingTable`, mang đúng năm cột của nó:
 * khách (tên + mã đơn · SĐT) · xe · thời gian thuê · TỔNG TIỀN · trạng thái.
 *
 * Tổng tiền chứ không phải công nợ: tổng tiền là giá trị của đơn và là thứ người ta quét khi lướt
 * danh sách; công nợ là việc còn phải làm, nó thuộc màn chi tiết.
 *
 * KHÔNG dùng `DataRow`: cột nhãn cố định của nó tiêu một phần ba bề ngang cho hai từ mà người đọc
 * đã biết trước. Icon dẫn dòng thay cột nhãn nên mỗi dữ kiện gói trong ĐÚNG một dòng.
 */
function BookingCardImpl({
  booking,
  onPress,
}: {
  booking: BookingListItem;
  onPress: (booking: BookingListItem) => void;
}) {
  const t = useTranslations('Bookings');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const status = booking.status as BookingStatus;
  const meta = BOOKING_STATUS_META[status];

  // Mã đơn và SĐT đứng cùng dòng dưới tên — đúng cột "khách" của web.
  const identity = [booking.code, booking.customerPhone].filter(Boolean).join(LIST_SEPARATOR);

  /*
   * MỘT hàm mở cho cả thẻ lẫn mũi tên — cùng khuôn với `TripCard`. Viết `() => onPress(booking)`
   * hai chỗ là hai closure mới ở mỗi lần render, tức `memo` của `Card` không bao giờ ăn, mà thẻ
   * này nằm trong một danh sách dài.
   */
  const open = useCallback(() => onPress(booking), [onPress, booking]);

  return (
    <Card onPress={open} accessibilityLabel={`${booking.customerName}${LIST_SEPARATOR}${booking.code}`}>
      <YStack gap={space.sm}>
        <XStack ai="flex-start" jc="space-between" gap={space.sm}>
          <YStack f={1} gap={2}>
            <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold} numberOfLines={1}>
              {booking.customerName}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
              {identity}
            </Text>
          </YStack>
          <StatusBadge
            label={domainLabel('bookingStatus', status, meta.label)}
            color={meta.color}
            size="sm"
          />
        </XStack>

        <YStack height={1} bg={colors.borderSubtle} />

        <YStack gap={space.xs}>
          <FactLine icon="car-outline">
            {/* Tên xe co lại, BIỂN SỐ thì không — biển số mới là thứ định danh chiếc xe ngoài bãi. */}
            <Text
              col={colors.text}
              fos={fontSize.bodySm}
              fow={fontWeight.medium}
              numberOfLines={1}
              f={1}
            >
              {booking.vehicleName}
            </Text>
            {booking.vehiclePlate ? (
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {booking.vehiclePlate}
              </Text>
            ) : null}
          </FactLine>

          <FactLine icon="time-outline">
            <Text col={colors.text} fos={fontSize.bodySm} numberOfLines={1} f={1}>
              {fmt.shortDateTimeRange(booking.pickupAt, booking.returnAt)}
            </Text>
          </FactLine>
        </YStack>

        <YStack height={1} bg={colors.borderSubtle} />

        {/*
          Mũi tên `>` cuối hàng tổng tiền — DẤU HIỆU thẻ mở ra được, không phải một nút nữa.

          Cả thẻ đã là đích chạm, nên một nút "Xem chi tiết" ở chân thẻ chỉ là lối vào thứ hai cho
          đúng một việc, lại còn nặng bằng một hành động chính. Mũi tên đứng ở đây chứ không nổi
          tuyệt đối ở góc trên: góc trên là chỗ của nhãn trạng thái, hai thứ chồng nhau.
        */}
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('card.total')}
          </Text>
          <XStack ai="center" gap={space.xs}>
            <Text col={colors.price} fos={fontSize.h4} fow={fontWeight.bold}>
              {fmt.money(booking.totalAmount)}
            </Text>
            <DetailChevron />
          </XStack>
        </XStack>
      </YStack>
    </Card>
  );
}

/** Một dữ kiện = một icon dẫn dòng + nội dung. Icon thay cho cột nhãn — xem chú thích ở trên. */
function FactLine({
  icon,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
}) {
  return (
    <XStack ai="center" gap={space.xs}>
      <Ionicons name={icon} size={iconSize.sm} color={colors.textMuted} />
      {children}
    </XStack>
  );
}

export const BookingCard = memo(BookingCardImpl);
